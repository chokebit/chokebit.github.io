---
title: UDS 流量分析
lang: cn
description: 解释 tcpdump 为什么看不到 Unix 域套接字，并比较 socat、strace、LD_PRELOAD、ptrace 与 eBPF 等观测方法。
created: 2026-08-14
modified: 2026-09-24
tags:
  - network
  - linux
  - socket
  - debugging
---

> 内容难免有误，请带着辩证视角阅读。本文所有方法均用于**分析你自己拥有或已获授权的进程**之间的 Unix 域套接字（UDS）通信。

## 本文内容

- **为什么 `tcpdump` 抓不到 UDS**：libpcap 基于网卡帧，无法捕获 `AF_UNIX`
- **环境诊断**：定位 UDS 路径、所属进程、加载的加密库
- **5 种观测方法**：socat 中间人、LD_PRELOAD、strace、ptrace、自写代理
- **eBPF / 内核态**与 **SCM_RIGHTS 文件描述符传递**调试
- **WinPcap / Npcap**：Windows 上的抓包方案对比

---

## 一、背景：为什么 UDS 不能像网卡那样被动抓包

Unix Domain Socket（`AF_UNIX`）是同一台主机上进程间通信（IPC）的高效方式，比 TCP loopback 更快、支持传递文件描述符。但它有一个**关键限制**：

> `libpcap` / `tcpdump` 基于网络设备的帧（`AF_PACKET` / `PF_PACKET`），**无法直接捕获 `AF_UNIX` 的流量**。

因此没有像网卡那样天然的被动 hook 点——这正是下面这些替代方案存在的理由：eBPF/kprobe、中间人代理、LD_PRELOAD、ptrace。

---

## 二、环境诊断（先搞清楚"谁在和谁通"）

在动手抓之前，先用系统工具把拓扑摸清楚：

```bash
/proc/net/unix          # 列出系统上所有 UNIX socket（含 abstract namespace），定位路径与类型
ss -x -a                # 显示 UNIX socket、监听端口及相关 PID
ss -x -pl               # 同上，带进程信息
lsof -U                 # 确认哪个进程打开了哪些 UDS
lsof -p <pid>           # 看指定进程打开的 UDS

/proc/<pid>/maps        # 确认进程加载的加密库（libssl / libgnutls / mbedtls 等）→ 决定 hook 哪个 API
ldd <binary>            # 同上，看动态链接的 TLS 库
ps auxf                 # 看进程树，识别父子进程关系（有时协议由父进程转发给子进程处理）
```

---

## 三、方法一：socat 中间人（最直观）

**何时用**：你能短暂停服务 / 改配置，希望用熟悉的 `tcpdump` / Wireshark 做流量分析时。

**思路**：用 `socat` 把 UDS 转成 TCP，再对 TCP 抓包。

```bash
# 把原 socket 重命名，让 socat 顶上
mv /tmp/test.sock /tmp/test.sock.orig
socat -v UNIX-LISTEN:/tmp/test.sock,fork UNIX-CONNECT:/tmp/test.sock.orig

# 然后在 loopback 上抓 TCP
sudo tcpdump -i lo -w uds_tcp.pcap tcp port 15555
# 用 Wireshark 打开 uds_tcp.pcap 分析
```

`-v` 会把转发的流量打印到终端（也可重定向到文件）。缺点：需要能切换 socket 文件或重启服务来换成代理。

运行效果示例（输出已脱敏）：

```text
# 左侧：server 不断收到连接与数据
[+] Client connected
[server recv] b'hello'
[-] Client disconnected

# 右侧：socat 报错 /tmp/test.sock 已存在，先重命名
"/tmp/test.sock" exists
mv /tmp/test.sock /tmp/test.sock.orig
> 2025/11/08 14:54:40 length=5 from=0 to=4
hello
< 2025/11/08 14:54:40 length=10 from=0 to=9
echo:hello
```

---

## 四、方法二：LD_PRELOAD 拦截 send / recv（用户态，最轻量）

**何时用**：你能控制进程启动方式，希望在用户态直接拿到数据（快速、可定制）。

**思路**：启动 client / server 时用 `LD_PRELOAD` 注入共享库，拦截 `send` / `sendmsg` / `recv` / `recvmsg`，把 UDS 数据记录到日志。

### 最小可复现 Demo

`uds_server.c` —— 监听 `./test.sock` 并回显：

```c
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

int main() {
    const char *path = "./test.sock";
    int ls = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un sa;
    unlink(path);
    memset(&sa, 0, sizeof(sa));
    sa.sun_family = AF_UNIX;
    strncpy(sa.sun_path, path, sizeof(sa.sun_path) - 1);
    if (bind(ls, (struct sockaddr*)&sa, sizeof(sa)) < 0) { perror("bind"); return 1; }
    if (listen(ls, 5) < 0) { perror("listen"); return 1; }
    printf("server listening %s\n", path);

    while (1) {
        int c = accept(ls, NULL, NULL);
        if (c < 0) { perror("accept"); continue; }
        char buf[4096];
        ssize_t n = recv(c, buf, sizeof(buf) - 1, 0);
        if (n > 0) {
            buf[n] = 0;
            printf("server recv (%zd): %s\n", n, buf);
        } else {
            printf("server recv none\n");
        }
        close(c);
    }
    close(ls);
    return 0;
}
```

`uds_client.c` —— 连接并发送一条消息：

```c
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>

int main() {
    const char *path = "./test.sock";
    int s = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un sa;
    memset(&sa, 0, sizeof(sa));
    sa.sun_family = AF_UNIX;
    strncpy(sa.sun_path, path, sizeof(sa.sun_path) - 1);
    if (connect(s, (struct sockaddr*)&sa, sizeof(sa)) < 0) { perror("connect"); return 1; }
    const char *msg = "HELLO_FROM_CLIENT";
    send(s, msg, strlen(msg), 0);
    close(s);
    return 0;
}
```

`preload_log.c` —— 拦截库，把 send / recv 的数据以 hex 记录：

```c
#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/socket.h>
#include <unistd.h>
#include <stdio.h>
#include <time.h>
#include <string.h>
#include <stdlib.h>
#include <stdarg.h>

static ssize_t (*real_send)(int, const void*, size_t, int) = NULL;
static ssize_t (*real_recv)(int, void*, size_t, int) = NULL;

static void ensure_real() {
    if (!real_send) real_send = dlsym(RTLD_NEXT, "send");
    if (!real_recv) real_recv = dlsym(RTLD_NEXT, "recv");
}

static void hexdump(FILE *f, const unsigned char *b, size_t len) {
    for (size_t i = 0; i < len; i++) fprintf(f, "%02x", b[i]);
}

static void log_data(int fd, const void *buf, size_t len, const char *dir) {
    pid_t pid = getpid();
    char path[128];
    snprintf(path, sizeof(path), "./uds_log_%d.log", pid);
    FILE *f = fopen(path, "a");
    if (!f) return;
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    fprintf(f, "%ld.%09ld pid=%d fd=%d dir=%s len=%zu data=",
            ts.tv_sec, ts.tv_nsec, pid, fd, dir, len);
    hexdump(f, buf, len);
    fprintf(f, "\n");
    fclose(f);
}

ssize_t send(int sockfd, const void *buf, size_t len, int flags) {
    ensure_real();
    if (len > 0 && buf) log_data(sockfd, buf, len, "send");
    return real_send(sockfd, buf, len, flags);
}

ssize_t recv(int sockfd, void *buf, size_t len, int flags) {
    ensure_real();
    ssize_t r = real_recv(sockfd, buf, len, flags);
    if (r > 0) log_data(sockfd, buf, (size_t)r, "recv");
    return r;
}
```

`Makefile`：

```makefile
all: server client lib
server: uds_server.c
	gcc -o uds_server uds_server.c
client: uds_client.c
	gcc -o uds_client uds_client.c
lib: preload_log.c
	gcc -fPIC -shared -O2 -o libpreload_log.so preload_log.c -ldl
clean:
	rm -f uds_server uds_client libpreload_log.so ./test.sock ./uds_log_*.log
```

运行：

```bash
make
./uds_server &                         # 终端 1：启动 server
LD_PRELOAD=./libpreload_log.so ./uds_client   # 终端 2：注入 client
cat ./uds_log_*.log                    # 查看 hex 日志
```

运行效果示例：

```text
$ make
gcc -o uds_server uds_server.c
gcc -o uds_client uds_client.c
gcc -fPIC -shared -O2 -o libpreload_log.so preload_log.c -ldl

$ LD_PRELOAD=./libpreload_log.so ./uds_client
[send] fd=3 len=17 data=48454c4c4f5f46524f4d5f434c49454e54

$ cat ./uds_log_*.log
1762579425.454751572 pid=7195 fd=3 dir=send len=17 data=48454c4c4f5f46524f4d5f434c49454e54
```

常见坑：若报 `undefined symbol: dlsym`，是链接时 `-ldl` 放错位置——必须放在源文件之后：

```makefile
lib: preload_log.c
	gcc -fPIC -shared -O2 -o libpreload_log.so preload_log.c -ldl
```

---

## 五、方法三：strace 抓系统调用（最快上手）

**思路**：直接拦截 `sendmsg` / `recvmsg` 等系统调用，打印进程间通信的原始数据。适合分析未加密、走 UNIX 套接字的通信。

```bash
# 全面订阅常见 socket / syscall
strace -s 2000 -y -e trace=send,sendto,sendmsg,recv,recvfrom,recvmsg python3 client.py

# 输出写文件（每个线程/子进程一个 trace.<pid>）
strace -s 2000 -y -ff -o trace.%p -e trace=send,sendto,sendmsg,recv,recvfrom,recvmsg python3 client.py

# 或用 -e trace=network 捕获一组网络相关 syscall
strace -s 2000 -y -e trace=network python3 client.py
```

`-y` 会显示 `fd -> socket:xyz` 的关联，方便定位是哪个 socket。

运行效果示例：

```text
$ strace -s 2000 -y -e trace=network ./uds_client
sendto(3<socket:[5616070]>, "hello", 5, 0, NULL, 0) = 5
recvfrom(3<socket:[5616070]>, "echo:hello", 1024, 0, NULL, NULL) = 10
getsockname(3<socket:[5616070]>, {sa_family=AF_UNIX, sun_path="/tmp/test.sock"}, [16->17]) = 0
getpeername(3<socket:[5616070]>, {sa_family=AF_UNIX, sun_path="/tmp/test.sock"}, [16->17]) = 0
+++ exited with 0 +++
```

---

## 六、方法四：ptrace + process_vm_readv（不改进程、读内存）

**思路**：对目标进程 `ptrace` attach（需 root 或被允许 ptrace），在 syscall 入口/出口读取寄存器找出 buffer 指针与长度，再用 `process_vm_readv` 把目标内存拷回本地保存。

**注意**：

- 需要 root（或目标被允许 ptrace）；
- 示例是最小演示，实际要处理多 iov、并发线程、32/64bit 兼容及更多系统调用；
- ptrace 会显著拖慢被追踪进程。

运行效果示例：

```text
$ ./uds_client & sudo ./ptrace_sniffer $!
[1] 7443
[1]+  Done                    ./uds_client

$ cat ptrace_send_7443.bin
HELLO_FROM_CLIENT
```

---

## 七、方法五：自写 UDS 代理（中间人，记录原始字节）

**思路**：写一个小代理 `uds_proxy.c`，监听一个 socket（proxy.sock），把流量转发给真实 server socket（orig.sock），在两端转发时把每条消息以 hex 记录。

```c
// uds_proxy.c (minimal stream proxy)
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <errno.h>
#include <fcntl.h>
#include <time.h>

#define BUF 65536

static void hexdump_fd(int fd, const unsigned char *b, ssize_t n) {
    char buf[3];
    for (ssize_t i = 0; i < n; i++) {
        snprintf(buf, sizeof(buf), "%02x", b[i]);
        write(fd, buf, 2);
    }
    write(fd, "\n", 1);
}

int main(int argc, char **argv) {
    if (argc < 3) { fprintf(stderr, "Usage: %s <listen_sock> <target_sock>\n", argv[0]); return 1; }
    const char *listen_sock = argv[1];
    const char *target_sock = argv[2];
    unlink(listen_sock);
    int ls = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un sa;
    memset(&sa, 0, sizeof(sa));
    sa.sun_family = AF_UNIX;
    strncpy(sa.sun_path, listen_sock, sizeof(sa.sun_path) - 1);
    if (bind(ls, (struct sockaddr*)&sa, sizeof(sa)) < 0) { perror("bind"); return 1; }
    if (listen(ls, 5) < 0) { perror("listen"); return 1; }
    printf("proxy listening %s -> %s\n", listen_sock, target_sock);
    while (1) {
        int c = accept(ls, NULL, NULL);
        if (c < 0) { perror("accept"); continue; }
        int t = socket(AF_UNIX, SOCK_STREAM, 0);
        struct sockaddr_un ta;
        memset(&ta, 0, sizeof(ta));
        ta.sun_family = AF_UNIX;
        strncpy(ta.sun_path, target_sock, sizeof(ta.sun_path) - 1);
        if (connect(t, (struct sockaddr*)&ta, sizeof(ta)) < 0) { perror("connect target"); close(c); close(t); continue; }
        while (1) {
            fd_set rf; FD_ZERO(&rf); FD_SET(c, &rf); FD_SET(t, &rf);
            int mx = (c > t ? c : t) + 1;
            if (select(mx, &rf, NULL, NULL, NULL) <= 0) break;
            if (FD_ISSET(c, &rf)) {
                unsigned char buf[BUF];
                ssize_t n = recv(c, buf, sizeof(buf), 0);
                if (n <= 0) break;
                int lf = open("./uds_proxy.log", O_WRONLY|O_CREAT|O_APPEND, 0600);
                if (lf >= 0) { hexdump_fd(lf, buf, n); close(lf); }
                send(t, buf, n, 0);
            }
            if (FD_ISSET(t, &rf)) {
                unsigned char buf[BUF];
                ssize_t n = recv(t, buf, sizeof(buf), 0);
                if (n <= 0) break;
                int lf = open("./uds_proxy.log", O_WRONLY|O_CREAT|O_APPEND, 0600);
                if (lf >= 0) { hexdump_fd(lf, buf, n); close(lf); }
                send(c, buf, n, 0);
            }
        }
        close(c); close(t);
    }
    close(ls);
    return 0;
}
```

运行：

```bash
gcc -o uds_proxy uds_proxy.c

# 把原 socket 移动并以代理替代
mv /tmp/test.sock /tmp/test.sock.orig
./uds_proxy /tmp/test.sock /tmp/test.sock.orig

# 启动 client 连接 /tmp/test.sock，代理把所有经过的字节以 hex 写入 /tmp/uds_proxy.log
```

运行效果示例：

```text
$ mv /tmp/test.sock /tmp/test.sock.orig
$ ./uds_proxy /tmp/test.sock /tmp/test.sock.orig
proxy listening ./test.sock -> ./test.sock.orig

# 启动 client 后，代理日志 uds_proxy.log 中出现 hex
$ xxd uds_proxy.log
48454c4c4f5f46524f4d5f434c49454e54
```

**注意**：中间代理需要你能短暂停止服务或重命名原 socket；某些守护进程不能这样操作，需先停服务再替换。另外，如果应用在用户态做了加密，代理只能记录 UDS 中传输的字节流（密文或明文都一样），看不到加密前的明文。

---

## 八、更底层：eBPF / 内核态 hook

如果上述用户态方法都不适用（如无法改启动方式、无法停服务），可以用 eBPF / kprobe 在 `unix_stream_sendmsg` 等处插桩，打印或收集数据。需要较新的内核与 root，风险更高，适合内核级研究与分析。也可考虑 SystemTap 或直接写内核模块，但门槛与风险更大。

---

## 九、多进程 / 特权拆分：SCM_RIGHTS 文件描述符传递

在多进程架构中常见这样的设计：主进程 / 守护进程负责监听 socket 或打开特权资源，子进程通过 `recvmsg()` 接收这些资源的文件描述符。FD 通过 **Unix 域套接字 + SCM_RIGHTS 控制消息**传递。

调试时，关键是观察 `recvmsg()` 的 `msg_control` 字段中的 `cmsghdr`：

- `strace -e trace=recvmsg,sendmsg` 能看到调用参数，但若 FD 通过 SCM_RIGHTS 传递，它只会显示：

  ```
  recvmsg(3, {msg_control=[{cmsg_level=SOL_SOCKET, cmsg_type=SCM_RIGHTS, ...}]}, 0) = ...
  ```

  不会显示 `CMSG_DATA()` 里的实际 FD 值。

- 用 `LD_PRELOAD` 自定义 `recvmsg` wrapper，可完整解析 `cmsghdr`：

  ```c
  ssize_t recvmsg(int sockfd, struct msghdr *msg, int flags) {
      static ssize_t (*real_recvmsg)(int, struct msghdr *, int) = NULL;
      if (!real_recvmsg) real_recvmsg = dlsym(RTLD_NEXT, "recvmsg");
      ssize_t ret = real_recvmsg(sockfd, msg, flags);
      struct cmsghdr *cmsg = CMSG_FIRSTHDR(msg);
      while (cmsg) {
          if (cmsg->cmsg_level == SOL_SOCKET && cmsg->cmsg_type == SCM_RIGHTS) {
              int *fd = (int *) CMSG_DATA(cmsg);
              printf("[recvmsg wrapper] Received FD: %d\n", *fd);
          }
          cmsg = CMSG_NXTHDR(msg, cmsg);
      }
      return ret;
  }
  ```

---

## 十、Windows 抓包：WinPcap 与 Npcap

前面所有方法针对 Linux 的 `AF_UNIX`。在 Windows 上做网卡层面的抓包（如分析走网卡的进程流量），常用的是 WinPcap / Npcap 这套 libpcap 生态：

- **WinPcap**：由 Loris Degioanni（Politecnico di Torino）创建、经 CACE Technologies 维护，后被 Riverbed 收购。本质上是 libpcap API 的旧版 Windows 移植，**已停止维护（legacy）**。
- **Npcap**：现代、持续维护的继任者，由 **Nmap Project** 开发（源于 Yang Luo 在 Google Summer of Code 的工作，后由 Nmap 团队延续）。

### 掌握 Npcap API（6 个核心调用）

| API | 作用 |
|-----|------|
| `pcap_findalldevs()` | 枚举网卡，打印名称 / 地址 |
| `pcap_open_live()` | 打开网卡，指定 snaplen、混杂模式、超时 |
| `pcap_compile()` + `pcap_setfilter()` | 编译并附加 BPF 过滤器，降低噪声 |
| `pcap_next_ex()` / `pcap_loop()` | 捕获循环，解析 `pcap_pkthdr` + 包字节 |
| `pcap_sendpacket()` | 构造并发送 Ethernet/IP/TCP 或原始帧 |
| `pcap_close()` | 关闭并释放资源 |

> 与本文 Linux 部分对照：Npcap 抓的是**网卡帧**（`AF_PACKET` 等价物），因此能捕获走网卡的 TCP/UDP 流量；而 Linux 上的 `AF_UNIX` 流量仍需上文介绍的专用方法。现代 Windows 抓包应优先选用 Npcap；若需捕获本机 loopback，可启用 Npcap 自带的 loopback 适配器。

参考：

- Npcap vs WinPcap：https://npcap.com/vs-winpcap
- Npcap 开发教程：https://npcap.com/guide/npcap-tutorial.html
- 练习项目（PcapPlusPlus）：https://pcapplusplus.github.io/docs/tutorials/intro

---

## 一句话总结

UDS 没有"被动抓包"的天然 hook，因为 libpcap 只认网卡帧；要观测它，要么用 socat / 自写代理把它"提升"成 TCP 再抓，要么用 LD_PRELOAD / strace / ptrace / eBPF 在用户态或内核态拦截。选择哪种，取决于你能不能改进程启动方式、能不能短暂停服务。
