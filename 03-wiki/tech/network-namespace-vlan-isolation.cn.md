---
title: 网络命名空间与 VLAN 隔离
lang: cn
description: 从 netns、veth、VLAN 与三层路由理解 Linux 网络隔离，并用可复现实验验证通信路径。
created: 2026-08-14
modified: 2026-09-24
tags:
  - network
  - linux
  - namespace
  - vlan
---

> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **Linux 网络命名空间（netns）**：内核级网络栈隔离，容器网络的基石
- **netns 常用操作**：创建、进入、veth 对接、跨命名空间访问
- **netns 与 VLAN 的区别**：内核隔离 vs 二层逻辑隔离
- **VLAN 原理**：802.1Q tag、广播域、虚拟接口
- **跨 VLAN 通信**：三层路由（推荐）/ 桥接 / NAT 三种打通方式
- **ip_forward 原理**：为什么二层隔离能被三层打通
- **动手实验**：验证二层隔离不通、三层路由打通
- **QEMU 虚拟机网络**：TAP/TUN、桥接、qemu-ifup、多网卡路由（把 VM 接入上面的桥 / 网络）

---

## 一、Linux 网络命名空间（netns）

Network Namespace（网络命名空间，简称 netns）是 Linux 内核提供的**网络隔离**能力：每个 netns 拥有**独立的网络栈**——独立的网络接口、路由表、iptables 规则、端口监听。Docker 的容器网络正是基于 netns 实现的。

Linux 内核通过命名空间（namespace）实现资源隔离，不止网络一种：

| 类型 | 隔离内容 |
|------|----------|
| `net` | 网络接口、路由表、端口监听 |
| `mnt` | 文件系统挂载点 |
| `pid` | 进程号空间 |
| `user` | 用户和权限 |
| `ipc` | 信号量、消息队列等 |
| `uts` | 主机名和域名 |
| `time` | 时钟和时间设置 |

> `ip netns` 创建的命名空间会出现在 `/var/run/netns/` 目录下。

### 常用命令

```bash
ip netns list                  # 查看所有网络命名空间
ip netns add testns           # 创建新命名空间
ip netns exec testns bash     # 进入命名空间执行命令
ip netns delete testns        # 删除命名空间
```

查看某进程的网络命名空间：

```bash
ls -l /proc/<pid>/ns/net      # 查看该进程 netns 的 inode
ls -l /proc/$$/ns/net         # 对比当前 shell 的网络命名空间

lsns -t net                   # 列出所有 netns 的 inode 与关联 PID
```

进入某个进程的完整命名空间（不止网络）：

```bash
nsenter -t <PID> -a bash      # -a 进入所有命名空间（mnt/net/pid/ipc/uts/user）
nsenter -t <PID> -n bash      # 只进入网络命名空间
```

在隔离命名空间中访问监听的服务：

```bash
# 方法一：进入目标进程的命名空间执行 curl
nsenter -t 3809 -n curl http://127.0.0.1:9090/prom

# 方法二：用命名空间名访问
ip netns exec netns_name curl http://127.0.0.1:9090/prom
```

### veth 对与跨命名空间通信

netns **原生就完全隔离于主机网络**，外部无法直接访问。要实现跨命名空间通信，通常需要虚拟网卡（veth pair）对接：

```bash
# 创建 veth 对
ip link add veth0 type veth peer name veth1

# 把一端移入命名空间
ip link set veth1 netns testns

# 配置 IP 并启用
ip addr add 10.0.0.1/24 dev veth0
ip netns exec testns ip addr add 10.0.0.2/24 dev veth1
ip link set veth0 up
ip netns exec testns ip link set veth1 up
```

若要让命名空间访问外网，需要 NAT（通常通过 `iptables` + `ip_forward`）：

```bash
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -o eth0 -j MASQUERADE
```

常用的"桥梁"技术小结：

| 技术 | 用途 |
|------|------|
| `veth` | 跨命名空间通信 |
| `macvlan` | 把多个 netns 接入同一物理网卡 |
| `bridge` + `tap` | 虚拟机 / 容器网络 |
| `iptables NAT` | 主机把流量转发到 netns |

---

## 二、netns 与 VLAN 的区别

两者可以结合使用，但本质不同：**netns 是内核级隔离，VLAN 是二层逻辑隔离**。

| 概念 | 网络命名空间 | VLAN |
|------|--------------|------|
| 定义 | Linux 内核的资源隔离机制 | 二层网络的虚拟局域网划分 |
| 作用 | 隔离整个网络栈（接口、路由、端口） | 隔离广播域、控制流量 |
| 实现方式 | 内核命名空间 + 虚拟网卡 | 交换机配置 + VLAN tag |
| 交集 | 可在 netns 中配置 VLAN 接口 | VLAN 接口可存在于 netns 中 |

更细的对比：

| 特性 | VLAN 虚拟接口（如 `eth0.100`） | 网络命名空间（netns） |
|------|-------------------------------|------------------------|
| 隔离层级 | 二层（数据链路层） | 网络栈级别 |
| 原理 | 物理网卡上创建带 tag 的逻辑接口 | 内核中创建独立网络环境 |
| 接口表现 | `eth0.100` 是主机上的接口 | `eth0`、`lo`、`veth` 存在于 netns 中 |
| 是否共享网络栈 | 是（共享主机网络栈） | 否（完全隔离） |
| 是否可见监听端口 | 可以（主机可见） | 不可以（主机不可见） |
| 是否需虚拟网卡 | 不需要（基于物理网卡） | 通常需要 veth 对接 |
| 应用场景 | VLAN 隔离、QoS、交换机配置 | 容器网络、服务隔离、安全沙箱 |

**相似点**：都是 Linux 网络虚拟化技术；都能创建虚拟接口、配置 IP、添加路由；都可用于服务隔离、调试、网络实验。

**不同点**：VLAN 是物理网卡上的逻辑隔离、共享主机网络栈；netns 是内核级资源隔离、拥有独立网络栈，更适合容器、沙箱、隐形服务部署。

---

## 三、VLAN 原理与虚拟接口

VLAN（Virtual LAN）在二层（数据链路层）通过 **802.1Q tag** 实现逻辑隔离。每个 VLAN 相当于一个独立广播域，默认**不能互通**。

- **广播域**：一个网络中，广播包（如 ARP 请求）能被所有设备接收到的范围。
- 在传统交换机中，所有端口默认属于同一个广播域；VLAN 通过在二层数据帧添加 802.1Q 标签，把物理网络划分为多个逻辑网络。
- 广播包只在本 VLAN 内传播，不会跨 VLAN。

举例：

- VLAN 10：`192.168.10.0/24` → 所有设备能互相广播
- VLAN 20：`192.168.20.0/24` → 与 VLAN 10 完全隔离，广播互不干扰

### VLAN 虚拟接口（`eth0.100`）

- 是在物理网卡上创建的带 VLAN tag 的逻辑接口。
- 多个 VLAN 接口共享同一个物理网卡，但逻辑上隔离。

---

## 四、不同 VLAN 之间如何通信

VLAN 是二层隔离，跨 VLAN 通信**必须**通过三层（IP）路由。

### 方法一：三层路由（推荐）

```bash
# 在 Linux 主机上创建多个 VLAN 接口作为各 VLAN 的网关
ip addr add 192.168.10.1/24 dev eth0.10
ip addr add 192.168.20.1/24 dev eth0.20
echo 1 > /proc/sys/net/ipv4/ip_forward
```

结果：VLAN 10 与 VLAN 20 的设备可以通过这台 Linux 主机（网关）互相通信，**广播仍然隔离**。

### 方法二：桥接（仅适用于同一广播域，会打破隔离）

```bash
ip link add br0 type bridge
ip link set eth0.10 master br0
ip link set eth0.20 master br0
ip link set br0 up
```

结果：VLAN 10 与 VLAN 20 可以直接通信，但**失去了 VLAN 隔离性**，生产环境慎用。

### 方法三：NAT 转发（适合私有地址访问外网）

```bash
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -A POSTROUTING -s 192.168.10.0/24 -o eth0 -j MASQUERADE
```

结果：VLAN 10 的设备可以访问外网，但外网无法主动访问 VLAN 内部。

| 方法 | 原理 | 是否保留隔离 | 是否能互通 | 是否能访问外网 |
|------|------|--------------|------------|----------------|
| 三层路由 | IP 层转发 | ✅ 是 | ✅ 是 | ✅ 可配置 |
| 桥接 | 二层合并 | ❌ 否 | ✅ 是 | ✅ 可配置 |
| NAT | 地址转换 | ✅ 是 | ❌ 否（仅出） | ✅ 是 |

---

## 五、VLAN 网络与 WAN（外网）通信

### 方法一：为 VLAN 接口配置默认网关

```bash
ip addr add 192.168.100.2/24 dev eth0.100
ip route add default via 192.168.100.1 dev eth0.100
```

前提是交换机 / 路由器支持 VLAN 并能转发到外网。

### 方法二：NAT 转发（Linux 主机作为网关）

```bash
echo 1 > /proc/sys/net/ipv4/ip_forward
iptables -t nat -A POSTROUTING -s 192.168.100.0/24 -o eth0 -j MASQUERADE
```

| 目标 | 方法 | 关键命令 |
|------|------|----------|
| VLAN 间通信 | 三层路由 | `ip route`、`ip_forward` |
| VLAN 与外网通信 | NAT 转发 | `iptables`、`ip_forward` |
| VLAN 桥接 | 软件桥接 | `ip link add bridge`、`brctl` |

---

## 六、原理问答

### 「VLAN 是二层隔离」是什么意思？

二层（Layer 2）即数据链路层，负责 MAC 地址通信、广播、交换机转发。VLAN 通过 802.1Q tag 把二层逻辑隔离，每个 VLAN 是一个独立广播域，**ARP、DHCP、ICMP 等广播只在本 VLAN 内传播**。

### 二层隔离如何通过三层打通？

1. 在 Linux 主机上创建多个 VLAN 接口（`eth0.10`、`eth0.20`）；
2. 每个接口配置一个 IP，作为该 VLAN 的网关；
3. 启用 IP 转发：`echo 1 > /proc/sys/net/ipv4/ip_forward`；
4. VLAN 设备把包发给网关 → 主机根据路由表转发到目标 VLAN。

效果：虽然 VLAN 在二层隔离，但 IP 层可以通过主机进行转发，实现通信。

### `echo 1 > /proc/sys/net/ipv4/ip_forward` 是什么？

这是 Linux 内核的一个开关：

- 默认情况下，Linux **不会**转发 IP 包（即不当路由器）；
- 设为 `1` 后，Linux 会根据路由表把收到的 IP 包转发到其他接口；
- 等效命令：`sysctl -w net.ipv4.ip_forward=1`。

### 三层通信能穿透物理层吗？

**不会阻断**。VLAN 虚拟接口（如 `eth0.10`）是物理网卡上的逻辑接口，数据包最终仍通过物理网卡（如 `eth0`）发出，只是带上了 VLAN tag，交换机据此送到对应 VLAN 的端口。三个核心结论：

- 三层通信是**逻辑**上的转发；
- 二层隔离是**广播域**的限制；
- 物理层始终是底层承载，不会被隔离阻断。

| 层级 | 功能 | 是否隔离 | 如何打通 |
|------|------|----------|----------|
| 二层（VLAN） | MAC、广播 | ✅ 隔离广播域 | 通过三层网关 |
| 三层（IP） | 路由、转发 | ❌ 可跨 VLAN | 启用 `ip_forward` |
| 物理层（网卡） | 数据传输 | ❌ 不隔离 | VLAN tag 决定路径 |

---

## 七、完整通信路径架构图

```
                    外网 / Internet
          （网络层 Layer 3：公网 IP、DNS、Web 服务等）
                          │
                          ▼
                    Linux 主机（网关）
              物理网卡 eth0
                ├─ 二层接口（VLAN 子接口）
                │     eth0.10 → VLAN 10（192.168.10.1）
                │     eth0.20 → VLAN 20（192.168.20.1）
                └─ 三层功能
                      IP Forwarding（已开启）
                      路由表：决定包从哪个接口出去
                      NAT（iptables）：私网地址 → 公网地址
                          │
                          ▼
                  VLAN 交换机（二层设备）
            按 VLAN tag 转发数据帧
              VLAN 10 → 端口 1,2
              VLAN 20 → 端口 3,4
                │              │
                ▼              ▼
      设备 A（VLAN 10）   设备 B（VLAN 20）
      192.168.10.x       192.168.20.x
      网关 .10.1          网关 .20.1
```

| 层级 | 设备 | 功能 |
|------|------|------|
| 物理层（Layer 1） | 网线、网卡、链路 | 承载比特流 |
| 数据链路层（Layer 2） | VLAN、交换机、MAC | 局域网通信、广播隔离 |
| 网络层（Layer 3） | IP、路由器、Linux 主机 | 子网间通信、外网访问 |
| 传输层（Layer 4） | TCP/UDP | 应用连接、端口识别 |
| 应用层（Layer 7） | 浏览器、SSH、Web 服务 | 用户交互、数据处理 |

**通信流程简述**：

1. 设备 A/B 发起通信 → 把 IP 包发到网关（Linux 主机）；
2. Linux 主机根据路由表转发到目标 VLAN 或外网；
3. 目标是外网 → 经 NAT 转换 IP → 从 `eth0` 发出；
4. 外网服务器响应 → 回包 → 经 Linux 主机 → 回到设备。

---

## 八、动手实验：二层隔离 vs 三层联通

> 本实验用 **netns + 带 VLAN 过滤的桥** 来真实演示。关键前提：两个"主机"必须是**独立网络命名空间**里的地址——否则在单机上互 ping 本机自己配置的地址会被内核 `local` 路由表直接环回送达（无论 VLAN / `ip_forward` 如何都成功），根本测不出隔离。下面用 `nsA`、`nsB` 两个命名空间模拟两台分属不同 VLAN 的设备。

### 拓扑

```
        nsA (VLAN 10)              nsB (VLAN 20)
   192.168.10.10/24          192.168.20.20/24
        │ vethA                    │ vethB
        │                          │
   brvethA(pvid 10)         brvethB(pvid 20)
        └──────── br0 ────────────┘
           (vlan_filtering = 1)
        │ br0.10                │ br0.20
   192.168.10.1            192.168.20.1
        └──── 主机作网关(ip_forward) ────┘
```

### 搭建

```bash
# 1) 建桥并开启 VLAN 过滤
ip link add br0 type bridge
ip link set br0 type bridge vlan_filtering 1
ip link set br0 up

# 2) 两个 netns 模拟两台设备
ip netns add nsA
ip netns add nsB

# 3) veth 对：一端进 netns，一端进桥
ip link add vethA type veth peer name brvethA
ip link add vethB type veth peer name brvethB
ip link set vethA netns nsA
ip link set vethB netns nsB
ip link set brvethA master br0
ip link set brvethB master br0

# 4) 桥端口 VLAN 成员：A 口只属于 vlan10，B 口只属于 vlan20（去掉默认 vlan1）
bridge vlan del dev brvethA vid 1
bridge vlan add dev brvethA vid 10 pvid untag
bridge vlan del dev brvethB vid 1
bridge vlan add dev brvethB vid 20 pvid untag

# 5) 在桥上创建两个 VLAN 子接口作为各 VLAN 的网关
ip link add link br0 name br0.10 type vlan id 10
ip link add link br0 name br0.20 type vlan id 20
ip addr add 192.168.10.1/24 dev br0.10
ip addr add 192.168.20.1/24 dev br0.20
ip link set br0.10 up
ip link set br0.20 up

# 6) 配置 netns 内地址与默认网关
ip netns exec nsA ip addr add 192.168.10.10/24 dev vethA
ip netns exec nsA ip link set vethA up
ip netns exec nsA ip route add default via 192.168.10.1
ip netns exec nsB ip addr add 192.168.20.20/24 dev vethB
ip netns exec nsB ip link set vethB up
ip netns exec nsB ip route add default via 192.168.20.1
```

### Demo 1：二层隔离 + 未开转发（不通）

```bash
sysctl -w net.ipv4.ip_forward=0

ip netns exec nsA ping -c 3 192.168.20.20   # 预期失败
```

预期：`nsA` 把包发给网关 `192.168.10.1`，但主机**未开启 IP 转发**，不会把包路由到 `br0.20`，ping 失败。同时 `nsA` 的 ARP / 广播被 VLAN 过滤限制在自己的 vlan10 内，不会扩散到 `nsB` 一侧。

### Demo 2：开启三层转发（通）

```bash
sysctl -w net.ipv4.ip_forward=1

ip netns exec nsA ping -c 3 192.168.20.20   # 预期成功
```

预期：主机作为网关，依据路由表把 `br0.10` 收到的包转发到 `br0.20`，跨 VLAN 三层打通；但**广播域仍然隔离**（`nsA` 的 ARP 不会出现在 `nsB` 一侧）。

| 实验 | 是否启用 IP 转发 | 是否能通信 | 是否隔离广播 |
|------|------------------|------------|--------------|
| Demo 1（二层隔离） | ❌ 否 | ❌ 不通 | ✅ 是 |
| Demo 2（三层联通） | ✅ 是 | ✅ 通 | ✅ 是 |

### 清理

```bash
ip netns del nsA
ip netns del nsB
ip link del br0
```

---

## 九、把虚拟机接入这套网络：QEMU 桥接与 TAP

前面搭的 bridge / VLAN / netns，最终都是为了把**真实或虚拟的设备**接进来。用 QEMU 跑固件或虚拟机时，最实用的就是让它通过 **TAP 接口**接入我们建的 Linux 网桥（br0），这样 Guest 就像插在交换机上的一台真实设备。

### 1. br、tun/tap、eth 各自作用

```
br（网桥 / 交换机）
├── eth0（物理网口）
├── tap0（QEMU 虚拟机 1）
└── tap1（QEMU 虚拟机 2）
```

- **br（Bridge）**：充当软件交换机。eth、tap 都接在 br 上，br 接替 eth 成为主机的上网设备（IP 配给 br，不再配给 eth0）。
- **tap/tun（虚拟网卡）**：供 QEMU 等虚拟机使用。`tap` 工作在**数据链路层**（交换以太网帧），用于桥接；`tun` 工作在网络层（路由 IP 包），用于路由。桥接场景用 **tap**。
- **eth（物理网卡）**：桥接时退化成网口，不再单独配置 IP。

| 类型 | 工作层 | 交换内容 | 用途 |
|------|--------|----------|------|
| TUN | 网络层 | IP 数据包 | 路由 |
| TAP | 数据链路层 | 以太网帧 | 桥接 |

### 2. 经典桥接配置（bridge-utils + tunctl）

> 下面用传统的 `brctl` / `tunctl`（需装 `bridge-utils`、`uml-utilities`）。现代等价命令见末尾注。

```bash
# 1. 装工具
apt-get install bridge-utils uml-utilities

# 2. 关闭物理网卡，把它和 TAP 都挂到网桥上
ifconfig eth0 down
brctl addbr br0
brctl addif br0 eth0
brctl stp br0 off          # 单网桥场景可关 STP
brctl setfd br0 1           # 转发延迟
brctl sethello br0 1        # hello 时间

# 3. 启用网桥和物理网卡（都不配 IP，IP 交给 br0）
ifconfig br0 0.0.0.0 promisc up
ifconfig eth0 0.0.0.0 promisc up
dhclient br0                # 由 br0 去拿 IP

# 4. 创建 TAP 接口并加入网桥
tunctl -t tap0 -u root
brctl addif br0 tap0
ifconfig tap0 0.0.0.0 promisc up

# 验证
brctl show br0
bridge link                  # 看 br0 上接了哪些设备
```

### 3. /etc/qemu-ifup 启动脚本

让 QEMU 启动时自动把它的 tap 接口加入网桥：

```bash
#!/bin/sh
# /etc/qemu-ifup
echo "Bringing up $1 for bridge mode"
sudo /sbin/ifconfig $1 0.0.0.0 promisc up
echo "Adding $1 to br0"
sudo /sbin/brctl addif br0 $1
sleep 2
```

```bash
sudo chmod +x /etc/qemu-ifup
```

QEMU 启动示例（注意 `-net tap` 参数之间不要有空格）：

```bash
sudo qemu-system-mipsel -M malta -kernel vmlinux \
  -hda debian.qcow2 -append "root=/dev/sda1 console=tty0" \
  -nographic \
  -net nic -net tap,ifname=tap0,script=no,downscript=no
```

- `-net nic`：在 Guest 里创建一张虚拟网卡；
- `-net tap,ifname=tap0`：连接类型为 TAP，接口名 tap0；
- `script=no,downscript=no`：已手动配好，不让 QEMU 再跑自动脚本。

> 新版本 QEMU 推荐用 `-netdev tap,id=net0,...` + `-device ...` 拆开前后端（见《固件仿真与调试》第二节），上面 `-net` 写法已废弃但大量旧资料仍在用。

### 4. 开机自启：/etc/network/interfaces

```ini
auto lo
iface lo inet loopback

# eth0 注释掉，IP 交给 br0
# auto eth0
# iface eth0 inet dhcp

auto br0
iface br0 inet dhcp
bridge_ports eth0
bridge_fd 9
bridge_hello 2
bridge_maxage 12
bridge_stp off

auto tap0
iface tap0 inet manual
pre-up tunctl -t tap0 -u root
pre-up ifconfig tap0 0.0.0.0 promisc up
post-up brctl addif br0 tap0
```

### 5. 多网卡路由管理

一张网卡上外网（eth1），一张做测试（eth0）：默认路由只有一个，需要精细控制。

```bash
# 让某张网卡不抢默认路由
nmcli connection modify eth0 ipv4.never-default yes

# 多路由表：为不同来源走不同出口
sudo ip route add default via 192.168.20.1 dev ens33 table 100
sudo ip route add default via 192.168.1.1  dev br-lan table 200
sudo ip rule add from 192.168.20.0/24 lookup 100
sudo ip rule add from 192.168.1.0/24  lookup 200
sudo ip rule add pref 32766 lookup main

# 指定出口验证
ping -I ens33  google.com
ping -I br-lan google.com
```

DHCP 手工操作：

```bash
sudo dhclient eth1          # 申请
sudo dhclient -r eth1        # 释放
sudo dhclient -v eth1        # 看详细过程
```

### 6. Linux 配置网络的四种方法

| 方法 | 持久性 | 命令 / 文件 |
|------|--------|-------------|
| `ifconfig` | 临时 | `sudo ifconfig eth0 <ip> netmask <mask>` |
| `ip` | 临时 | `sudo ip addr add <ip>/<mask> dev eth0` |
| Netplan | 永久 | `/etc/netplan/*.yaml` → `sudo netplan apply` |
| NetworkManager | 永久 | `nmcli con add ...` |

常用排查：

```bash
nmcli device status
nmcli connection show
ip route show
# 断网三板斧
sudo nmcli connection down "Wired connection 1" && sudo nmcli connection up "Wired connection 1"
sudo dhclient -r eth1 && sudo dhclient eth1
# 临时备用网关
sudo ip route add default via 192.168.65.1 dev eth0 metric 200
```

> **现代等价命令**（替代 `brctl` / `ifconfig`）：`ip link add br0 type bridge`、`ip link set eth0 master br0`、`bridge link`、`ip addr add ... dev br0`、`ip route add default via ...`。

---

## 其他好用命令

```bash
# 查看对端 IP 的主机名（需 DNS）
getent hosts 192.168.1.89

# 用 conntrack 看连接追踪（更底层）
conntrack -L | grep 192.168.1.234
```

---

## 一句话总结

netns 是**内核级**网络栈隔离，VLAN 是**二层**广播域隔离；要让隔离的网络互通或上外网，靠的是三层路由、桥接或 NAT——而 `ip_forward` 是这一切的开关。
