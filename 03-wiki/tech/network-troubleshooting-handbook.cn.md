---
title: 网络排查实战手册
lang: cn
translations:
  en: tech/network-troubleshooting-handbook
tags:
  - network
  - security
  - workflow
---

> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **核心思想**：网络问题本质 = 数据包没有按预期路径流动
- **黄金排查流程**：从底层往上层，逐层排除
- **十一个排查阶段**：接口 → IP → 路由 → ARP → 连通性 → 路由检测 → 端口 → 抓包
- **ping 的完整生命周期**：一次 ping 背后发生了什么
- **网络通信四种路径**：本机、同网段、跨网段、NAT
- **NAT / iptables / conntrack 深度解析**：三者关系与排障方法
- **双网卡管理**：多路由表、DHCP、nmcli
- **工具速查**：Linux + Windows 最小工具集

---

## 一、核心思想

### 网络问题的本质

```
数据包没有按照预期路径流动
```

### 排查基本方法

```
观察 → 假设 → 验证
```

### 工程经验原则

```
从底层往上排查
```

顺序：

```
物理层 → 链路层 → IP 层 → TCP/UDP 层 → 应用层
```

### IOS 网络模型关键原则

```
上层正常，下层绝对没问题
下层故障 → 上层一定异常
```

---

## 二、网络协议层（工程视角）

OSI 七层在工程中简化为五层：

| 层 | 作用 | 示例 |
|----|------|------|
| 应用层 | 用户程序 | HTTP, DNS, SSH |
| 传输层 | 端口通信 | TCP, UDP |
| 网络层 | IP 寻址 | IPv4, IPv6 |
| 链路层 | MAC 通信 | Ethernet |
| 物理层 | 电信号 | 网卡 |

### 工程级通信模型

```
网络通信 = 地址 + 路由 + 转发 + 状态 + 策略
```

| 层 | 关键问题 | 例子 |
|----|---------|------|
| 地址 | 我是谁 | IP / MAC |
| 路由 | 我要去哪 | route |
| 转发 | 下一跳是谁 | ARP |
| 状态 | 是否允许 | conntrack |
| 策略 | 是否被拦截 | firewall |

所以排查网络问题一般顺序：

```
IP → ARP → Route → Forward → Firewall → Application
```

---

## 三、网络排查黄金流程

```
1. 网络接口（网卡状态）
2. IP 地址（身份）
3. 路由（出口）
4. ARP（邻居）
5. 网络连通性（ping）
6. 路由检测（traceroute）
7. 端口状态（服务）
8. 抓包（最终手段）
```

---

## 四、第一阶段：网络接口

检查网卡状态。

### Linux

```bash
ip link
# 2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP>
```

`UP` + `LOWER_UP` 表示网卡启用且物理链路连接正常。

```bash
ip link set eth0 up    # 启用接口
```

### Windows

```bash
ipconfig /all
# 或
Get-NetAdapter
```

---

## 五、第二阶段：IP 地址

IP 地址决定主机身份。

### Linux

```bash
ip addr
# inet 192.168.1.10/24
```

### Windows

```bash
ipconfig
# IPv4 Address . . . : 192.168.1.10
```

---

## 六、第三阶段：路由

路由决定数据包出口。参考：RFC 1812 (IP Routing)。

### Linux

```bash
ip route
# default via 192.168.1.1 dev eth0
```

测试特定 IP 的路由：

```bash
ip route get 8.8.8.8
# 8.8.8.8 via 192.168.31.1 dev ens33 src 192.168.31.101
```

### Windows

```bash
route print
```

添加路由：

```bash
route add 10.0.0.0 mask 255.255.255.0 192.168.1.1
```

### 路由表字段解释

| 字段 | 含义 |
|------|------|
| Destination | 目标网络，`0.0.0.0` 表示未知/默认 |
| Gateway | 下一跳网关，`0.0.0.0` 表示直连 |
| Genmask | 子网掩码 |
| Flags | U=Up, G=Gateway, H=Host, D=Dynamic |
| Metric | 优先级，越小越优先 |
| Iface | 出口接口 |

总结：访问一个 IP → 路由表 `IP & Genmask` 计算子网 → Destination → Iface → Gateway → 目的服务器。

---

## 七、第四阶段：ARP

ARP 负责 `IP → MAC`。参考：RFC 826。

### Linux

```bash
ip neigh
# 192.168.31.1 dev ens33 lladdr 4c:c6:4c:bf:ca:6e REACHABLE

arp -n
# Address            HWtype  HWaddress           Flags Mask  Iface
# 192.168.31.1       ether   4c:c6:4c:bf:ca:6e   C           ens33
```

清除 ARP：

```bash
ip neigh flush all
```

### Windows

```bash
arp -a
arp -d *    # 清除
```

### ARP 表 vs 路由表

```
路由表决定包去哪
ARP 表决定包给谁
```

| 表 | 功能 | 示例 |
|----|------|------|
| 路由表 | IP → 下一跳 | `8.8.8.8 → 192.168.1.1` |
| ARP 表 | IP → MAC | `192.168.1.1 → aa:bb:cc:dd` |

---

## 八、第五阶段：网络连通性

### ping（IP 层检查）

参考：RFC 792 (ICMP)。

```bash
ping 8.8.8.8        # Linux
ping 8.8.8.8        # Windows
```

### ping 的完整生命周期

假设 A `192.168.1.10` ping B `192.168.2.10`，网关 `192.168.1.1`。

**Step 1 — DNS 解析**（如果是域名）：

```
应用 → getaddrinfo() → libc resolver → /etc/resolv.conf → DNS server → 返回 IP
```

**Step 2 — 路由判断**：

```bash
ip route get 192.168.2.10
# 192.168.2.10 via 192.168.1.1 dev eth0
# → 下一跳 = 192.168.1.1
```

**Step 3 — ARP 解析**：

```
系统发广播：
  ARP Request: Who has 192.168.1.1? Tell 192.168.1.10

网关回应：
  192.168.1.1 is at aa:bb:cc:dd:ee

缓存：
  ip neigh → 192.168.1.1 ... REACHABLE
```

**Step 4 — 发送以太网帧**：

```
Ethernet Frame:
  dst MAC = 网关
  src MAC = 本机
   └─ IP packet
       └─ ICMP
```

**Step 5 — 网关转发**：

```
网关查路由表: 192.168.2.0/24 dev vlan20
网关 ARP 查询 B: who has 192.168.2.10
```

**Step 6 — 重封装**：

网关修改 MAC，**不改 IP**：

| 字段 | 变化 |
|------|------|
| src MAC | 变（替换为网关出口 MAC） |
| dst MAC | 变（替换为目标 MAC） |
| src IP | 不变 |
| dst IP | 不变 |

**Step 7 — 目标主机回应**：

```
ICMP echo reply: B → 网关 → A
```

### 为什么 ping 不通就检查路径？

```
IP 层可达 ≠ 应用服务可达
```

如果 ping 不通，存在至少一种情况：

```
1. 路由不存在
2. 中间设备丢包
3. 防火墙阻止
4. 目标不存在
```

---

## 九、第六阶段：路由检测

查看网络路径。

```bash
traceroute 8.8.8.8    # Linux
tracert 8.8.8.8        # Windows
```

### 网络通信四种路径

**1. 本机通信**：

```
127.0.0.1

Application → Socket → Loopback Interface → Application
（不经过网卡、ARP、路由）
```

**2. 同网段通信**：

```
A 192.168.1.10 → B 192.168.1.20

A → ARP 查询 B 的 MAC → 直接发送 Ethernet Frame → B
（没有路由，只有 ARP）
```

**3. 跨网段通信**：

```
A 192.168.1.10 → B 192.168.2.10

A → 查路由 → 下一跳=网关 → ARP 获取网关 MAC → 发给网关 → 网关转发 → B

核心规则：IP 不变，MAC 每跳变
```

**4. NAT 通信**：

```
192.168.1.10 → NAT Router → Internet

SNAT: 192.168.1.10:4444 → 1.2.3.4:50000
返回: 1.2.3.4:50000 → 192.168.1.10:4444

依赖 conntrack
```

---

## 十、第七阶段：端口状态

### 为什么路径通了还要检查端口？

```
IP 层可达 ≠ 应用服务可达
```

服务运行在 TCP/UDP 上。例如：服务器 IP 可达，但 80 端口没开 → ping 正常，HTTP 访问失败。

### Linux

```bash
ss -lntp    # 查看监听端口
ss -ant     # 查看所有连接
```

### Windows

```bash
netstat -ano
```

---

## 十一、抓包（最终手段）

抓包是网络排查**最重要的工具**。路径和端口是"逻辑检查"，但中间设备问题（firewall、NAT、负载均衡、ACL、IPS）系统命令无法直接看到，必须抓包。

### Linux — tcpdump

```bash
tcpdump -i eth0              # 抓所有流量
tcpdump host 8.8.8.8        # 抓特定 IP
tcpdump port 80              # 抓 HTTP
tcpdump arp                  # 抓 ARP
tcpdump -i eth0 -w dump.pcap # 保存到文件
```

### Windows — pktmon

```bash
pktmon start --capture
```

### Wireshark（跨平台推荐）

支持 Windows / Linux / macOS。官方文档：https://www.wireshark.org/docs/

---

## 十二、NAT / iptables / conntrack 深度解析

### 三者关系

```
Netfilter（Linux 防火墙框架）
 ├─ conntrack   (连接状态跟踪)
 ├─ iptables    (规则控制系统)
 └─ NAT         (地址转换模块)
```

| 组件 | 本质 |
|------|------|
| conntrack | 连接状态跟踪系统 |
| iptables | 规则控制系统（操作 Netfilter 的工具） |
| NAT | 地址转换模块（**必须依赖 conntrack 才能工作**） |

### Linux Netfilter 架构

```
                Userspace
                ──────────
                 iptables / nftables
                      │
                Kernel Space
                ────────────
                   Netfilter
                      │
      ┌───────────────┼───────────────┐
      │               │               │
  conntrack         NAT            filter
```

### Netfilter 五个 Hook

```
            incoming
               │
           PREROUTING
               │
      ┌────────┴─────────┐
      │                  │
    routing            local
      │                  │
   FORWARD             INPUT
      │                  │
      └──────┬───────────┘
             │
          OUTPUT
             │
         POSTROUTING
             │
           outgoing
```

### 完整数据包流程图

```
网卡接收
  │
NIC Driver
  │
内核协议栈入口
  │
Netfilter PREROUTING
  ├─ raw → mangle → nat (DNAT)
  │
conntrack
  │
路由决策
  ├─ INPUT  → mangle → filter → 本地进程
  └─ FORWARD → mangle → filter → POSTROUTING
                                    │
                                  mangle → nat (SNAT) → 网卡发送
```

### NAT 发生位置

| Hook | NAT 类型 |
|------|---------|
| PREROUTING | DNAT（目标地址转换） |
| OUTPUT | 本机 DNAT |
| POSTROUTING | SNAT（源地址转换） |

### DNAT（目标地址转换）

常见场景：公网 IP → 内网服务器。

```bash
iptables -t nat -A PREROUTING -d 1.1.1.1 -j DNAT --to 192.168.1.10
```

流程：

```
Client → 访问 1.1.1.1 → Router → DNAT → 192.168.1.10
```

### SNAT（源地址转换）

典型：内网访问互联网。`192.168.1.10 → 8.8.8.8` 经 Router 变为 `1.1.1.1 → 8.8.8.8`。

```bash
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -j MASQUERADE
```

### conntrack 核心作用

**每个连接记录**：

```
源 IP、目标 IP、源端口、目标端口、协议、状态
```

查看：

```bash
conntrack -L
cat /proc/net/nf_conntrack
# tcp  6  431999 ESTABLISHED src=192.168.1.10 dst=8.8.8.8 sport=50000 dport=53
```

### NAT 为什么必须依赖 conntrack

SNAT 后返回包 `8.8.8.8 → 1.1.1.1`，路由器必须知道"这个包应该还给谁"。conntrack 记录了 `1.1.1.1:60000 ↔ 192.168.1.10:50000`，自动反向 NAT。

### Linux 排查三件套

```bash
iptables -t nat -L -n -v    # 查看 NAT 规则
conntrack -L                # 查看连接跟踪
tcpdump -i eth0 host 8.8.8.8  # 抓包（NAT 前后对比）
```

### 典型 NAT 故障排查

内网不能访问互联网：

```bash
# Step 1: 检查 IP
ip addr

# Step 2: 检查路由
ip route

# Step 3: 检查 NAT
iptables -t nat -L
# 是否有 MASQUERADE?

# Step 4: 检查 conntrack
conntrack -L
# 是否有记录?

# Step 5: 抓包
tcpdump -i eth0
# 看是否 SNAT
```

### 四大误区

1. ❌ "iptables 做 NAT" → ✅ Netfilter NAT 模块做 NAT，iptables 只是配置工具
2. ❌ "NAT 不需要 conntrack" → ✅ NAT 100% 依赖 conntrack
3. ❌ "NAT 每个包都转换" → ✅ 只在连接第一个包时决定，后续直接用 conntrack
4. ❌ "SNAT 在 PREROUTING" → ✅ SNAT → POSTROUTING，DNAT → PREROUTING

### Windows 对应机制

| Linux | Windows |
|-------|---------|
| iptables | Windows Firewall |
| conntrack | WFP (Windows Filtering Platform) |
| NAT | ICS / RRAS |

Windows NAT：

```bash
netsh interface portproxy
```

---

## 十三、双网卡管理

### 场景与关键配置

一张上外网（eth1），一张做测试（eth0）。**默认路由只能有一个**。

控制某张网卡不拿默认路由：

```bash
nmcli connection modify eth0 ipv4.never-default yes
```

### DHCP 管理

```bash
# 查看租约
nmcli connection show "Wired connection 1" | grep DHCP4

# 手工操作
sudo dhclient eth1          # 申请
sudo dhclient -r eth1        # 释放
sudo dhclient -v eth1        # 详细过程
```

### nmcli 常用命令

```bash
# 查看
nmcli device status
nmcli device show eth1
nmcli connection show
nmcli connection show "Wired connection 1"
ip route show

# 操作
nmcli connection up eth0
nmcli connection down "Wired connection 1"
nmcli device disconnect eth0
nmcli device connect eth1

# 修改
nmcli connection modify eth0 ipv4.never-default yes
nmcli connection modify eth0 connection.autoconnect yes
sudo nmcli connection down "..." && sudo nmcli connection up "..."
```

### 断网排查顺序

```bash
# 1. 物理层：链路通不通？
ip link show eth1 | grep state    # UP + LOWER_UP

# 2. IP 层：有没有拿到 IP？
ip addr show eth1 | grep inet

# 3. 路由层：默认路由在不在？
ip route show | grep default

# 4. DNS：能不能解析？
cat /etc/resolv.conf

# 5. 终极测试：
ping 8.8.8.8          # 先 ping IP（排除 DNS 问题）
ping google.com        # 再 ping 域名
```

### 多路由表配置

```bash
# 添加路由表
sudo ip route add default via 192.168.20.1 dev ens33 table 100
sudo ip route add default via 192.168.1.1 dev br-lan table 200

# 添加规则
sudo ip rule add from 192.168.20.0/24 lookup 100
sudo ip rule add from 192.168.1.0/24 lookup 200
sudo ip rule add pref 32766 lookup main

# 测试
ping -I ens33 google.com
ping -I br-lan google.com
```

---

## 十四、网络排查最小工具集

### Linux

```
ip          — 接口、地址、路由
ss          — 端口、连接
tcpdump     — 抓包
iptables    — 防火墙/NAT 规则
conntrack   — 连接跟踪
```

### Windows

```
ipconfig    — IP 配置
route       — 路由表
netstat     — 端口、连接
tracert     — 路径检测
pktmon      — 抓包
```

### 跨平台

```
Wireshark   — 图形化抓包分析
```

---

## 最终核心结论

```
没有神秘的网络问题
只有没有被观察到的数据包

抓包是最终真相
tcpdump + Wireshark 是最重要的工具
```
