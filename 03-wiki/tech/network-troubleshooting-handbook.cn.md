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
- **NAT 行为探测与 STUN**：判断是否位于 NAT 之后、NAT 类型与映射分析
- **安全研究视角（授权环境）**：ARP 欺骗 / 反弹 Shell / DNS 枚举的原理与防御——理解攻击面
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
  ├─ raw → conntrack → mangle → nat (DNAT)
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

Windows NAT（注意不是 `netsh interface portproxy`——那是端口转发，不是 NAT）：

- 消费级：**ICS（Internet 连接共享）**，在「适配器属性 → 共享」里开启。
- 服务器级：**RRAS（路由和远程访问）** 做 NAT 路由。

```bash
# RRAS NAT（旧版 netsh routing，Server 版可用）
netsh routing ip nat install
netsh routing ip nat add interface "以太网" full
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

## 十五、NAT 行为探测与 STUN

前面讲了 NAT 的原理与排障，这一节讲**如何确认自己是否位于 NAT 之后，以及 NAT 到底做了什么映射**。在做 P2P、WebRTC、端口映射类问题时特别有用。

### 判断是否位于 NAT 之后（4 种方法）

**方法 1：对比本机 IP 与公网 IP**

```bash
ip addr show | grep inet        # 看本机地址
curl ifconfig.me               # 看公网地址
```

若本机是 `192.168.x.x` / `10.x.x.x` / `172.16~31.x.x`，而公网是另一段地址，说明你在 NAT 之后。

**方法 2：看默认网关是不是私网地址**

```bash
ip route show
# default via 192.168.1.1 dev eth0  → 私网网关 → 一定经过 NAT
```

**方法 3：用 STUN 协议精确探测（最推荐）**

STUN（Session Traversal Utilities for NAT）向公网 STUN 服务器发包，服务器把"它看到的你的源 IP:端口"原样回显，从而暴露你的外部映射身份。

```bash
# Debian/Ubuntu
sudo apt install stun-client
stun stun.l.google.com:19302
# 输出示例：
# Primary: Open NAT, mapped address is 203.0.113.10:54321
```

它能告诉你两件事：NAT 类型（Full Cone / Restricted / Symmetric 等），以及外部映射的 IP 和端口。

**方法 4：在网关/路由器上看 NAT 表**

```bash
sudo iptables -t nat -L -v
sudo conntrack -L
# tcp 6 ... src=192.168.1.100 dst=142.250.4.110 sport=53210 dport=443 ...
#   → 内部地址 / 外部地址 / 映射端口一目了然
```

### NAT 过程中"谁被改了"（对照分析）

| 层级 | NAT 修改内容 | 分析方法 |
|------|--------------|----------|
| IP 层 | 源 IP 被替换 | `tcpdump -n -i eth0 src <内网IP>` |
| 传输层 | 源端口被改写 | `conntrack -L` |
| NAT 表 | 动态映射记录 | `iptables -t nat -L -v` |
| 内外对比 | 包头逐字段比对 | NAT 前后双点抓包对比 |

**典型实验**：在主机 `eth0` 抓内网侧，在网关外网口 `eth1` 抓公网侧，用 Wireshark 对比两份 pcap，观察源 IP / 源端口是否变化、负载是否不变。

### NAT 是否影响了通信（常见现象）

| 现象 | 原因 | 验证方式 |
|------|------|----------|
| 外网无法主动连回你 | 没有公网端口映射 | `nmap -Pn <公网IP>` 测端口可达性 |
| P2P 连接失败 | Symmetric NAT | 用 `stun` 检测 NAT 类型 |
| SSH / Web / 出向代理可用 | 典型出向 NAT 正常 | 无需公网映射 |

### STUN 原理（简化）

```
内网主机 ──UDP──▶ NAT 路由器 ──▶ STUN 服务器
  （内网 IP 如 192.168.1.100；服务器看到的源 = 203.0.113.10:54321）
        ◀──── 服务器把"看到的源地址"回显给客户端 ─────
客户端比较：自己发出的 src vs 服务器回显的 mapped
  → 不同 = 经过 NAT；一致 = 直连公网
```

STUN 核心探测逻辑：

| 探测目标 | 方法 | 说明 |
|----------|------|------|
| 映射 IP / 端口 | 服务器回显的源地址 | 判断是否经过 NAT |
| 映射是否恒定 | 连续请求不同 STUN 服务器比较 | 映射不同 → NAT 重新分配端口 |
| 过滤策略 | 让服务器从不同 IP 回包测试是否被丢 | 判断是否限制回包源 |
| Hairpin 支持 | 从映射地址回发自己 | 测试内网回环是否可行 |

### NAT 类型分类（STUN 识别结果）

| 类型 | 特性 | 穿透性 | 举例 |
|------|------|--------|------|
| Full Cone | 任意外部主机都能访问映射端口 | ✅ 最好 | 早期简单 NAT（现代家庭路由少见） |
| Restricted Cone | 仅被你访问过的 IP 能回包 | ⚠️ 一般 | 中性路由 |
| Port-Restricted Cone | 必须 IP + 端口都匹配 | ⚠️ 较差 | 安全型 NAT |
| Symmetric | 每个目标 IP 生成不同映射 | ❌ 最差 | 企业 / 运营商 NAT |

> 一句话：STUN 像一面镜子，让你看到自己在 NAT 外部世界中的"真实网络身份"——外部看到你是谁、你穿了哪套 IP 伪装、能否"穿墙而出"。

---

## 十六、安全研究视角（仅限授权环境）

前面都是工程排查视角。本章把几个常被用于攻击的技术**以「攻击面 / 防御」视角**讲清原理与排查路径，便于在自有 / 授权设备上理解与加固。**所有内容仅用于自己拥有或已授权的目标，对他人设施实施属未授权行为。**

### 1. ARP 欺骗与中间人嗅探

原理：攻击机持续向「受害者」与「网关」双向发送伪造的 ARP reply，把双方的 MAC 映射都改成攻击机——于是双方流量都先经过攻击机（中间人），攻击机转发的同时可抓包分析。这是理解「为什么明文流量会被窃听」最直观的案例，也正好对应第七章的 ARP 阶段。

```bash
# 仅在你自己隔离的实验网络里使用；IP/网卡一律用占位符
# 单向：让受害者以为攻击机是网关（只能抓到受害者发出的请求）
# arpspoof -i <网卡> -t <受害者IP> <网关IP>

# 双向：同时欺骗受害者与网关，能抓到请求 + 响应
# arpspoof -i <网卡> -r <网关IP> -t <受害者IP>
```

被欺骗时受害者侧看到的就是一条伪造 ARP reply（攻击机 MAC 冒充网关 IP）：

```
<攻击者MAC> <受害者MAC> 0806 42: arp reply <网关IP> is-at <攻击者MAC>
```

抓到明文流量后可还原内容，例如把 HTTP 图片流提取出来：

```bash
# driftnet 从网卡抓图片（HTTPS 无法抓取）
# driftnet -i <网卡> -b -a -d <输出目录>
```

排查 / 防御要点：

- 交换网络开启 **DAI（Dynamic ARP Inspection）** 与端口安全，校验 ARP 合法性。
- 关键主机用**静态 ARP** 绑定。
- 敏感流量一律走 **HTTPS / VPN**，避免明文被嗅探（HTTP 图片、表单可被还原）。
- 主机侧用 `arp -n` 观察是否存在「一个 IP 对应多个 MAC / 网关 MAC 频繁变化」的异常。

### 2. 异常外连与反弹 Shell（防御检测视角）

原理：与其让控制端连进目标（常被入站防火墙挡住），不如**让目标机主动向外 `connect()` 到控制端**，从而拿到交互式 shell。排查一条反弹 shell 是否通，本质就是前面各章的连通性排查：

```
目标机
  ↓ connect()
  ↓ 经过 Internet
控制端（监听）
```

公开文章不提供可直接复制的回连载荷，重点放在识别与阻断：

- 用 `ss -tpn`、`lsof -i` 或 EDR 检查 shell、脚本解释器与非常用外部地址之间的长连接。
- 用 DNS、代理、NetFlow 与防火墙日志关联「新域名、非常用端口、周期性短连接」等异常行为。
- 对服务器实施 egress 白名单，限制能够访问的目的地址、端口和协议。
- 对 Bash、Python、Perl、Netcat 等常被滥用的解释器和工具建立进程树与网络连接告警。

排查通信路径时仍可按 `route` → `iptables` → `NAT` → `conntrack` 的顺序进行；防御关键点是**目标主动外连**，因此出向控制通常比单纯封堵入站端口更有效。

### 3. DNS 枚举（资产暴露面梳理）

原理：通过查询目标域名的各类记录（A/AAAA、MX、NS、TXT，以及区域传送 AXFR 等）来梳理一个组织的网络资产与暴露面——对防御者而言，这是「先对手一步暴露自己域名信息」该做的自查。

```bash
# 解析各类记录
# dig <域名>           # A 记录
# dig <域名> MX        # 邮件服务器
# dig <域名> NS        # 权威 DNS
# dig <域名> TXT       # 文本记录（SPF / 验证信息常在此暴露）
# nslookup -query=<记录类型> <域名>

# 区域传送：若 DNS 服务器未限制，可一次拉出整个域内主机列表
# dig axfr @<权威DNS服务器> <域名>

# 反向查询（已知 IP 反查域名）
# dig -x <IP> +short
```

防御侧：限制 zone transfer（仅允许可信次级 DNS）、采用 split-horizon DNS、监控对外可查的敏感记录（TXT 里可能泄露 SPF/验证 token）。

> 一句话：这些技术既能用于攻击，也能用于「在授权范围内理解并加固自己的系统」——理解攻击者怎么想，是防御的起点。

---

## 最终核心结论

```
没有神秘的网络问题
只有没有被观察到的数据包

抓包是最终真相
tcpdump + Wireshark 是最重要的工具
```
