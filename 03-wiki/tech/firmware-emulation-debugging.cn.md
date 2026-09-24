---
title: 固件仿真与调试（QEMU / FirmAE）
lang: cn
description: 使用 QEMU、FirmAE、chroot 与调试工具搭建授权固件分析环境，并定位常见启动与 CGI 问题。
created: 2026-08-14
modified: 2026-09-24
tags:
  - iot
  - firmware
  - qemu
  - firmae
  - emulation
  - debugging
---

> 本文介绍在**授权范围内**对固件做仿真与调试的方法：用 QEMU 跑起二进制、用 FirmAE 批量仿真路由器、以及用 `chroot + qemu` / `gdb` / `strace` 分析固件里的 CGI 程序。所有操作都假定你分析的是**自己拥有的设备 / 已授权的样本**（如厂商开发板、自购硬件、官方固件）。请勿对他人设备实施。
> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **QEMU 两种模式**：全系统仿真 vs 用户态仿真；TCG vs KVM
- **QEMU 网络模型**：`-net`（旧）vs `-netdev`+`-device`；桥接 vs 用户态 NAT；端口转发
- **各架构启动命令**：mips / mipsel / armel / aarch64 / powerpc（含 `-dtb` 设备树）
- **镜像启动模式对比**：ARM/MIPS 需 `-kernel`；x86/PowerPC 自带 bootloader；`qemu-img` 格式转换
- **FirmAE 框架**：NVRAM 模拟、fixImage/makeImage、scratch 目录、串口 / 监视器接入
- **其他框架速览**：Firmadyne / FAP / EMUX / FAT / Qiling / Unicorn / FACT_core / emba
- **CGI 调试（授权分析）**：提取环境变量、QEMU `-E` 传参、`chroot + qemu`、用 `LD_PRELOAD` 暂停短命进程、原生 webserver 仿真、三层排错法
- **防御视角**：CGI 环境变量的攻击面认知（不提供利用代码）

---

## 一、QEMU 两种仿真模式

| 模式 | 说明 | 典型用途 |
|------|------|----------|
| **全系统仿真**（system emulation） | 模拟整台机器：CPU、外设、板级设备，跑完整内核 + 用户态 | 启动整个固件系统（`qemu-system-*`） |
| **用户态仿真**（user-mode） | 只模拟 CPU，直接在宿主机 OS 上跑单个跨架构二进制（`qemu-*-static`） | 单跑一个 CGI / 守护进程，无需整套系统 |

- **TCG vs KVM**：在宿主机架构与 Guest 不同（如 x86 上跑 MIPS）时，QEMU 用 **TCG**（纯软件翻译）；当架构相同（x86 on x86）时可用 **KVM** 硬件加速。IoT 仿真几乎都是跨架构，走 TCG。
- **binfmt_misc**：Kali/Ubuntu 等发行版通过 `/proc/sys/fs/binfmt_misc` + `qemu-binfmt` 让你直接 `./mips_binary` 就能跑（内核自动调用对应 `qemu-*-static`），无需手写前缀。

---

## 二、QEMU 网络模型

### 旧写法（已废弃）

```bash
qemu-system-mipsel -M malta -kernel vmlinux -hda rootfs.cpio \
  -append "root=/dev/sda1 console=tty0" -net nic -net tap -nographic
```

`-net nic -net tap` 是老接口，**新版本 QEMU 已废弃**，推荐用 `-netdev` + `-device` 拆开「后端」与「前端」：

```bash
qemu-system-mipsel -M malta -kernel vmlinux -hda rootfs.cpio \
  -netdev tap,id=net0,ifname=tap0,script=no,downscript=no \
  -device rtl8139,netdev=net0 \
  -nographic
```

### 用户态 NAT（无需 root、最省事）

```bash
qemu-system-arm -M virt -kernel zImage -initrd rootfs.cpio \
  -netdev user,id=net0,hostfwd=tcp::443-:443 \
  -device virtio-net-device,netdev=net0 \
  -nographic
```

`hostfwd=tcp::443-:443` 把宿主机 443 端口转发到 Guest 443——访问 `宿主机IP:443` 即可访问 Guest 服务。

### 桥接（让 Guest 真正出现在局域网）

需要 `ip_forward` 与 `iptables` 做 NAT 转发：

```bash
sysctl -w net.ipv4.ip_forward=1
iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
```

（桥接的底层 `tunctl` / `brctl` / `/etc/qemu-ifup` 配置，见《网络命名空间与 VLAN 隔离》的 QEMU 网络一节。）

---

## 三、各架构 QEMU 启动命令

| 架构 | 用户态二进制 | 系统态二进制 | 备注 |
|------|--------------|--------------|------|
| MIPS 大端 | `qemu-mips-static` | `qemu-system-mips` | `-M malta` |
| MIPS 小端 | `qemu-mipsel-static` | `qemu-system-mipsel` | `-M malta` |
| ARM | `qemu-arm-static` | `qemu-system-arm` | `-M virt` 或具体开发板 |
| ARM64 | `qemu-aarch64-static` | `qemu-system-aarch64` | `-M virt` |
| PowerPC | `qemu-ppc-static` | `qemu-system-ppc` | |

用户态调试单个程序（开 gdbserver 端口 1234）：

```bash
qemu-mipsel-static -g 1234 -L ./ ./webs/cgi-bin/webapp
```

> `-L` 指定运行库目录（根文件系统根），`-g` 开启 GDB 远程调试桩。常见坑：直接 `qemu-mips-static ./bin/boa` 会报 `no user program specified`，必须把程序路径放在 `-L` 之后。

### 设备树 `-dtb`

部分板子（尤其 ARM/MIPS 开发板）的内核需要单独传入设备树二进制（`.dtb`，Device Tree Blob）来描述板级硬件布局。QEMU 用 `-dtb` 指定：

```bash
qemu-system-mipsel -M malta -kernel vmlinux -hda rootfs.ext2 -dtb malta.dtb
qemu-system-aarch64 -M virt,gic_version=3 -cpu host -dtb board.dtb --enable-kvm ...
```

若内核本身已内嵌 dtb（很多现代内核通过 `CONFIG_ARM_APPENDED_DTB` 拼进 zImage，或打包时合并），则可省略 `-dtb`。

---

## 四、镜像启动模式对比

| 架构 | 是否需 `-kernel` | 启动方式 |
|------|------------------|----------|
| ARM | 需要（多数） | 单独给内核 + initrd，U-Boot 常被省略 |
| MIPS | 需要（多数） | `-M malta` + `-kernel vmlinux` |
| PowerPC | 自带 bootloader | 镜像内含引导程序 |
| x86 | 自带 bootloader | 直接 `-hda` 即可 |

`-initrd` 与 `-hda` 区别：

- **`-initrd`**：初始 RAM 磁盘（initramfs），内核启动前临时挂载，用来加载驱动、准备真正的根文件系统。
- **`-hda`**：虚拟硬盘镜像，挂载为持久化根文件系统。

### 镜像格式转换（qemu-img）

固件仿真时常需要在 raw / qcow2 / vmdk 之间转换（例如把 VMware 虚拟磁盘转成 qcow2 给 QEMU 用）：

```bash
qemu-img convert -f vmdk -O qcow2 source.vmdk destination.qcow2
qemu-img convert -f qcow2 -O vmdk source.qcow2 destination.vmdk
qemu-img convert -f vmdk -O qcow2 -o compress mydisk.vmdk mydisk.qcow2   # 压缩
qemu-img info mydisk.qcow2                                              # 查看镜像信息
```

`-f` 指定源格式，`-O` 指定目标格式（不写则自动探测）。

---

## 五、FirmAE 框架

FirmAE（基于 Firmadyne）是目前最实用的**批量路由器固件仿真**框架。核心思路：提取固件 → 修补文件系统（补 NVRAM、补配置）→ 构 QEMU 磁盘镜像 → 自动推断网络、启动 Web 服务、自动化漏洞分析。

### 1. NVRAM 模拟（关键）

很多固件通过 `nvram_get("xxx")` 读配置。FirmAE 用 `libnvram.so` 这个**自定义共享库**拦截 NVRAM 调用，从 `key-value` 文件（`/etc/nvram.default`、`/etc/nvram.conf`、`/var/etc/nvram.default` 等）返回默认值。

局限：如果固件把 NVRAM 实现成 MTD 分区上的自定义数据结构、或调用了未模拟的函数，就会失效，需要手动补。

### 2. 核心脚本（`scripts/`）

- **`fixImage.sh`**：镜像修复——补目录、补 NVRAM 值、初始化缺失的配置文件（FirmAE 精华）。
- **`makeImage.sh`**：把 `extractor.py` 解出的 tar.gz 文件系统做成 QEMU 启动镜像（`losetup` 建分区 → 格式化 ext4 → 挂载 → 拷 firmadyne 工具 → `chroot` + `inferFile.sh` 统计启动文件 / Web 服务 → `chroot` + `fixImage.sh` 修补）。
- **`inferFile.sh`**：统计可能的启动脚本、Web 服务器类型与配置，写入 `/firmadyne`。
- **`makeNetwork.py`**：网络配置与「预模拟」（pre-emulation）——通过拦截文件系统 / 网络 / 内核子系统的系统调用，推断系统与网络配置。
- **`inferKernel.py`**：从内核里找 `init` 路径、收集 `kernelCmd`（内核命令行）、波特率、文件系统类型等，用于排障。

### 3. scratch 工作目录

每次分析有独立 `IID`（Image ID），目录布局（`scratch/<IID>/`）：

```
name / brand / result / ip / web / architecture   # 状态文件
image.raw            # QEMU 磁盘镜像
qemu.*.log          # QEMU 运行日志（initial=预模拟，final=正式）
makeImage.log / makeNetwork.log
nvram_keys / nvram_files
kernelCmd / kernelInit / kernelVersion
run_*.sh             # 各种运行脚本的符号链接
```

### 4. 接入 QEMU 调试

- **串口日志**：`-serial file:scratch/<IID>/qemu.final.serial.log`
- **UNIX socket 串口**（外部交互）：
  ```bash
  -serial unix:/tmp/qemu.<IID>.S1,server,nowait
  # 连接：
  socat -,raw,echo=0 unix-connect:/tmp/qemu.<IID>.S1
  ```
- **监视器接口**（发 QEMU 命令如 `system_reset` / `info registers` / `savevm`）：
  ```bash
  -monitor unix:/tmp/qemu.<IID>,server,nowait
  socat -,raw,echo=0 unix-connect:/tmp/qemu.<IID>
  ```

### 5. 基本用法

```bash
./init.sh                  # 初始化（装依赖、建数据库）
sudo ./run.sh -d <brand> <firmware>   # -d 调试模式
```

---

## 六、其他仿真框架速览

| 框架 | 特点 | 链接 |
|------|------|------|
| **Firmadyne** | FirmAE 前身，启动较慢、较复杂 | https://github.com/firmadyne/firmadyne |
| **FAP**（firmware-analysis-plus） | 基于 Firmadyne，配置简单 | https://github.com/liyansong2018/firmware-analysis-plus |
| **EMUX** | 配置步骤多，默认 `root` 登录，端口映射表固定（如 20080→80） | https://github.com/therealsaumil/emux |
| **FAT**（Firmware Analysis Toolkit） | 图形化套件 | — |
| **Qiling** | 高层仿真框架（PE/MachO/ELF 加载、动态链接、syscall），基于 Unicorn | https://github.com/qilingframework/qiling |
| **Unicorn** | 纯 CPU 仿真引擎（裸指令，无 OS 上下文） | https://github.com/unicorn-engine/unicorn |
| **FACT_core** | 固件综合分析框架（解包、漏洞扫描、软件成分分析），偏审计流水线 | https://github.com/fkie-cad/FACT_core |
| **emba** | 固件安全扫描器，专注漏洞 / CVE / 薄弱配置检测，报告丰富 | https://github.com/e-m-b-a/emba |

---

## 七、CGI 调试（授权分析）

固件里的 Web 接口大多由 CGI 二进制（如 `boa`、`lighttpd+mod_cgi`、`goahead`、`thttpd`）处理。要在 x86 工作站上分析这些跨架构 CGI，常用 `chroot + qemu-user` 组合。

### 1. 提取 CGI 需要的环境变量

CGI 程序通过环境变量（`REQUEST_METHOD`、`QUERY_STRING`、`CONTENT_LENGTH`、`REMOTE_ADDR` 等）和 stdin（POST body）获取请求。设备上运行时，可以从 `/proc/<pid>/environ` 抓：

```bash
cat /proc/<PID>/environ | tr '\0' '\n'     # 查看完整环境变量
pmap -x <PID>                              # 看内存布局（含环境变量位置）
strace -e env pri.cgi                       # 跟踪对环境变量的修改
```

把抓到的变量存成 `env.sh`（`export ...`），之后本地 `source env.sh` 再跑程序即可复现大致运行环境。

### 2. 用 QEMU `-E` 直接传参（用户态）

```bash
# GET 方式
qemu-mips-static -E REQUEST_METHOD=GET \
  -E QUERY_STRING="param1=value1&param2=value2" ./cgi_program

# POST 方式（CONTENT_LENGTH 必须与 stdin 实际长度一致！）
echo "param1=value1&param2=value2" | \
  qemu-mips-static -E REQUEST_METHOD=POST \
  -E CONTENT_TYPE="application/x-www-form-urlencoded" \
  -E CONTENT_LENGTH=23 ./cgi_program
```

> `CONTENT_LENGTH` 一定要和实际输入字节数匹配，否则 CGI 读到的 body 会截断或阻塞。

### 3. chroot + qemu 本地仿真

把固件文件系统 `chroot` 进去，用内部自带的 qemu 跑，能解决库路径与地址偏移问题：

```bash
sudo chroot . /usr/bin/env -i \
  REQUEST_METHOD=POST \
  CONTENT_LENGTH=$(wc -c < postdata.xml) \
  CONTENT_TYPE="application/x-www-form-urlencoded" \
  HTTP_COOKIE="sessionid=aaaaaaaaaaaaaaaaaa" \
  QUERY_STRING="" \
  SCRIPT_NAME="/cgi-bin/webapp" \
  REMOTE_ADDR="127.0.0.1" \
  ./qemu-mips-static -g 1234 ./webs/cgi-bin/webapp < postdata.xml
```

### 4. 用 `LD_PRELOAD` 暂停「短命」CGI（调试技巧）

CGI 进程往往一闪而过，来不及 attach。一个干净的办法：写一个 `.so`，在构造函数里读 `/proc/self/cmdline`，若匹配目标进程名就 `sleep` 一段时间，把你争取到的窗口用来 `gdb attach`。

```c
// hook.c —— 仅供授权调试
#include <stdio.h>
#include <string.h>
#include <unistd.h>

void __attribute__((constructor)) init(void) {
    FILE* f = fopen("/proc/self/cmdline", "r");
    static char name[1024];
    if (f && fgets(name, sizeof(name), f)) {
        if (strstr(name, "mainfunction"))   // 匹配目标 CGI 名
            sleep(60);                       // 留下调试窗口
    }
    if (f) fclose(f);
}
```

交叉编译后放进固件根，并写入 `/etc/ld.so.preload`（或由 `LD_PRELOAD` 环境变量指定）。这样目标 CGI 启动即睡 60 秒，期间从容 `gdb attach`。

> 注意：多加载一个 `.so` 会改变内存布局（基址偏移），真机 ROP 偏移需重新核对；且调试时 `gdb` 一定要带目标文件路径以加载符号表（`gdb-multiarch <file> -x <script>`），否则下不到函数符号断点。

### 5. 原生 webserver 仿真

直接在 chroot 里跑固件自带的 httpd，能绕过登录、直接观察 UI 与请求结构：

```bash
# busybox httpd
sudo chroot . ./qemu-mips-static ./busybox.mipsel httpd -f -p 8000 -h ./webs

# 原生 lighttpd（注意配置文件里的相对路径要先 cd 进去）
sudo chroot . /bin/sh -c "cd /home/lighttpd/config && \
  ./qemu-arm-static /home/lighttpd/sbin/lighttpd -f ./lighttpd.conf -D"
```

常见报错与修复：

- `opening /dev/null failed` → 在 chroot 里 `mknod -m 666 dev/null c 1 3`
- `SSL: not enough entropy` → `mknod -m 444 dev/random c 1 8 && mknod -m 444 dev/urandom c 1 9`
- `No such file or directory` 类路径错误 → 先 `cd` 到配置所在目录再启动

### 6. 三层排错法

程序本身、`gdb`、系统调用追踪三者构成完整闭环：

| 层 | 目的 | 命令示例 |
|----|------|----------|
| 程序层 | 看运行输出 / 库依赖 / ELF 架构 | `./program >log 2>&1`、`ldd`、`file`、`readelf -h` |
| GDB 层 | 指令级单步、断点、看寄存器/内存 | `gdb --args qemu-*-static ./p`、`si`/`ni`、`bt`、`info reg`、`x/16xw $sp` |
| 系统调用层 | 追踪 open/read/connect 等 | `QEMU_STRACE=1 qemu-mips-static ./p`，或 `strace -f -e open,read,write` |

`QEMU_STRACE=1`（或 `--strace`）比 `strace` 更优：它走 QEMU 内核接口层，能完整捕获所有 syscall（包括部分 libc 内部路径），而 `strace` 在 MIPS user 模式下很多库函数不会显示。三者结合常能定位到 `open("/etc/xxx","No such file")` 这类根因。

### 7. 补丁制造调试窗口（把 CGI 改成死循环）

除了 `LD_PRELOAD` 睡眠，另一条路是**直接把目标 CGI 二进制的入口改成「跳转到自身」（死循环）**：进程起来后卡在原地，从容 `gdb attach`，再手动把指令恢复成原样继续跑。比 sleep 法更稳——不依赖额外 `.so`、不改变内存布局。

### 8. 自动 attach gdbserver（轮询脚本）

如果目标进程是按需拉起、名字固定（如 `lighttpd`、`share.cgi`、`libsqlite` 相关），可以写循环脚本等它出现并自动 attach。下面是一段实测可用的思路（在固件 chroot 环境里跑）：

```bash
#!/bin/bash
while true; do
    # [/] 写法避免 grep 自身被匹配
    pid=$(ps | grep '[/]tmp/lighttpd.conf' | awk '{print $1}')
    [ -z "$pid" ] && { sleep 1; continue; }
    # 从 /proc/$pid/maps 取第一个基址，按阈值决定 kill 还是 attach
    base_addr=$(cat /proc/$pid/maps | grep libsqlite | head -n 1 | awk '{print $1}' | cut -d'-' -f1)
    if [ "$base_addr" \< "401a0000" ]; then
        echo "Killing $pid ($base_addr)"
        kill -9 $pid
    else
        echo "Attaching gdbserver to $pid ($base_addr)"
        ./gdbserver *:1234 --attach $pid
    fi
    sleep 2
done
```

变体（按进程名直接 attach）：

```bash
for pid in $(busybox ps | grep share.cgi | busybox awk '{print $1}'); do
    if kill -0 $pid &>/dev/null; then
        gdbserver 0.0.0.0:1234 --attach $pid
        break
    fi
done
```

> 这类脚本的价值在于：CGI 往往「一闪而过」，人工来不及 attach；轮询脚本能在进程存活窗口里抢到 gdbserver。注意字符串比较基址是十六进制字典序技巧，真机上要核对 hertz 与内存布局。

---

## 八、CGI 环境变量的攻击面（攻防视角）

理解上面这套环境变量机制，**对攻防两端都重要**：攻击者利用它拿 shell，防御者靠它定位加固点。下面把几类公开漏洞的**编号、触发条件、利用链路**讲清楚，便于在隔离授权环境里复现验证。**所有手法仅用于自有 / 已授权设备，对他人设备实施属未授权行为。**

### 8.1 标准 CGI 里「stdin = POST body」这一事实

绝大多数命令注入 / 环境变量劫持的根，都在于：标准 CGI 把 HTTP 请求的 **body（POST 主体）通过 stdin 喂给 CGI 程序**，而 `QUERY_STRING`、各 `HTTP_*` 头则放在环境变量里。只要 CGI 内部又去读 stdin 当命令执行，攻击者就能让「POST body 被当成 shell 执行」。

可以用下面这段最小 CGI 验证「stdin 只包含 body、不含请求头」：

```sh
#!/bin/sh
echo "Content-type: text/plain"
echo
# 把 stdin 原样写到文件，便于观察 CGI 实际拿到了什么
cat > /tmp/cgi_stdin.txt
echo "Wrote stdin to /tmp/cgi_stdin.txt"
```

```bash
curl -v -X POST 'http://localhost/cgi-bin/test.sh' -d $'cmd=echo hello; id'
# 查看 /tmp/cgi_stdin.txt，确认只有 POST body（如 cmd=...），不含请求头
```

### 8.2 典型漏洞与边界条件

| CVE | 组件 / 类型 | 审计时应关注的边界 |
|-----|------------|--------------------|
| **CVE-2021-33514** | NETGEAR 多款交换机预认证命令注入 | CGI 把未经安全处理的 HTTP 头带入 shell 命令；审计重点是外部输入到命令执行函数的数据流。 |
| **CVE-2017-17562** | GoAhead 3.6.5 之前版本的 CGI 远程代码执行 | CGI 把不可信请求参数带入进程环境，动态链接程序又信任了 `LD_PRELOAD`；漏洞成立还依赖 CGI 与动态链接等条件。 |
| **CVE-2014-6271** | Bash 环境变量函数注入（Shellshock） | Web 服务器把请求头映射为环境变量，而下游 Bash 错误解析函数定义后的内容；关键是跨组件信任边界。 |
| **CVE-2023-4911** | glibc `GLIBC_TUNABLES` 本地提权 | `ld.so` 处理环境变量时发生缓冲区溢出，影响 SUID 程序边界，属于本地提权而非远程 CGI 漏洞。 |
| **CVE-2025-4802** | glibc 静态 setuid 程序的库搜索路径问题 | 特定静态 setuid 程序调用 `dlopen` 时可能错误信任 `LD_LIBRARY_PATH`；这是有严格前提的本地问题。 |

> 实际限制：上述 `$(cat)` 类技巧成立的前提是——server 把 POST body 作为 stdin 提供（标准 CGI 会，自实现服务未必）；body 若被先解析消费则读不到；`multipart/form-data` 会读到边界与 part 头；`Content-Length` 为 0 或受限会失败/阻塞；WAF/IDS 可能检测到 `$(cat)` + 可疑 body 组合。

### 8.3 防御审计清单

- 明确 CGI 如何接收 body、query string 与请求头，画出它们进入环境变量、stdin 和配置文件的路径。
- 搜索 `system`、`popen`、shell 调用、模板求值和动态库加载等高风险操作，验证参数是否来自外部输入。
- 启动 CGI 前清理 `LD_*` 等危险环境变量，并用固定允许列表重建子进程环境。
- 让 Web 服务和 CGI 以独立低权限账户运行，限制文件系统写入、网络出口和可执行程序集合。
- 在隔离环境中记录系统调用与进程树，确认测试输入没有跨越预期信任边界。

对设备厂商而言，核心是严格校验外部输入、收紧子进程环境并落实最小权限；对研究者而言，前面的仿真与调试流程用于验证这些边界是否真实生效。

---

## 参考

- QEMU 网络文档：https://wiki.qemu.org/Documentation/Networking
- FirmAE：https://github.com/pr0v3rbs/FirmAE
- Firmadyne：https://github.com/firmadyne/firmadyne
- Qiling：https://github.com/qilingframework/qiling
- Unicorn：https://www.unicorn-engine.org/
- NETGEAR CVE-2021-33514 公告：https://kb.netgear.com/000063641/
- GoAhead CVE-2017-17562：https://nvd.nist.gov/vuln/detail/CVE-2017-17562
- glibc CVE-2025-4802：https://sourceware.org/cgit/glibc/tree/advisories/GLIBC-SA-2025-0002
- 调试 httpd fork+exec 的 CGI（看雪）：https://bbs.kanxue.com/thread-276464.htm
- LD_PRELOAD 简介：https://blog.csdn.net/whatday/article/details/108890018
