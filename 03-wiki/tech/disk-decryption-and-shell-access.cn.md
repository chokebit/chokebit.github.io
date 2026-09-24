---
title: 磁盘解密与获取 Shell（授权 / 防御视角）
lang: cn
description: 面向自有或授权设备，梳理 LUKS、LVM、救援 Shell 与设备访问面的排查和加固方法。
created: 2026-08-14
modified: 2026-09-24
tags:
  - iot
  - lvm
  - luks
  - forensics
  - defensive
---

> 本文内容涉及磁盘解密与「如何拿到设备 shell」。这些技术的合法用途包括：**恢复你自己的加密磁盘、对自有 / 已授权设备进行安全评估、事件响应与取证**。请勿将文中任何方法用于你无权操作的设备。没有合法授权的前提下访问他人设备，是违法行为。
> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **磁盘探测**：识别传统分区 vs LVM（lsblk / pvs / fdisk / /dev/mapper）
- **LUKS 解密与挂载**：有密钥时 `cryptsetup luksOpen`；无密码时为何无法解密
- **GRUB `cryptomount` vs `init=/bin/sh`**：两种「启动到 shell」的环境差异与恢复
- **设备被拿到 shell 的 8 类路径（防御视角）**：把攻击手法当作攻击面清单，反向指导加固

---

## 一、磁盘探测：传统分区还是 LVM？

分析一块磁盘 / 镜像前，先判断它是普通分区还是 **LVM（Logical Volume Manager，逻辑卷管理）**——这决定后续挂载方式。

### 方法一：`lsblk -f`

```bash
lsblk -f
```

- 若某分区 `FSTYPE` 是 `LVM2_member` → 它是 LVM 物理卷。
- 若设备名形如 `/dev/mapper/...` → 它是逻辑卷。

```text
NAME                FSTYPE      MOUNTPOINT
sda
├─sda1              ext4        /boot
└─sda2              LVM2_member
  └─ubuntu--vg-root ext4        /
```

### 方法二：`fdisk` / `parted`

```bash
sudo fdisk -l /dev/sdb
sudo parted /dev/sdb print
```

- 分区类型 `Linux LVM`（fdisk 里 ID 为 `8e`）→ LVM。
- `Linux` / `EFI System` → 传统分区。

### 方法三：`pvs` / `vgs` / `lvs`

```bash
sudo pvs     # 物理卷
sudo vgs     # 卷组
sudo lvs     # 逻辑卷
```

有输出即启用了 LVM。

### 方法四：看 `/dev/mapper/`

```bash
ls /dev/mapper/
```

出现 `vgname-lvname` 即启用 LVM。

### 传统分区 vs LVM 速查

| 标志 | 是否 LVM |
|------|----------|
| `ext4` / `xfs` 等，挂载点 `/dev/sda1` | 否 |
| `LVM2_member`（或 fdisk 类型 `8e`） | 是 |
| `/dev/mapper/...` | 是 |

> 若 `lvdisplay` 无输出：可能根本没用 LVM（用 `lsblk` 确认）；若确认用了却扫不到，试 `sudo vgscan`、`sudo vgchange -a y` 激活卷组。

---

## 二、解密并挂载 LUKS 加密分区

LUKS 是 Linux 主流的磁盘加密方案。前提是你**拥有合法的密码或密钥文件**。

### 已知密钥：解密 + 挂载

```bash
# 1. 打开 LUKS 分区（my_secure_disk 为自定义映射名）
sudo cryptsetup luksOpen /dev/sdb2 my_secure_disk
# 输入加密密码后，生成映射设备 /dev/mapper/my_secure_disk

# 2. 看解密后是什么
lsblk
# 若是 LVM：
sudo vgscan && sudo vgchange -ay && sudo lvscan
# 若是普通文件系统（如 ext4）：
sudo mount /dev/mapper/my_secure_disk /mnt
```

### 用密钥文件而非口令

```bash
sudo cryptsetup luksOpen /dev/sdb2 my_secure_disk --key-file <密钥文件>
sudo mount /dev/mapper/my_secure_disk /mnt
```

### 没有密码 / 没有密钥文件怎么办？

需要明确：**LUKS 是强加密，没有密码或（合法的）密钥文件，无法解密该分区**，数据不可恢复。这是 LUKS 的设计目标，也是它作为防护手段的价值所在。

合法的「找回密钥」途径仅限于：你有**备份的密钥文件**或**恢复密钥**；或设备自带自动解锁脚本（如 `mount.sh` / `unlock.sh`）里引用了密钥文件——可以审查该脚本确认其引用的密钥路径（注意密钥文件常为二进制，用 `file` 判断类型，不要直接当文本打开）。

> 内存中恢复密钥：在**系统运行且已解锁**的状态下，可从 RAM 提取 LUKS 主密钥（需物理访问 / 调试接口）。这是数据恢复手段，相关公开研究见 rce.moe 与 wzt.ac.cn 的 LUKS 内存取证文章。它同样只适用于你有权操作的系统。

---

## 三、GRUB `cryptomount` 与 `init=/bin/sh` 的区别

想「在启动阶段拿到一个 shell」有两种常见场景，环境不同、能用的命令也不同：

| 环境 | 说明 | 能否运行 `cryptomount` |
|------|------|------------------------|
| **GRUB 命令行** | 系统启动前、GRUB 提供的交互 shell | ✅ 可以（`cryptomount -a` 等） |
| **Linux shell（`init=/bin/sh`）** | 内核启动后进入的最小用户空间 | ❌ 不行（没有 GRUB 模块） |

### 用 `init=/bin/sh` 进救援 shell

在 bootloader 的 kernel 命令行加 `init=/bin/sh`，可绕过正常 init、直接拿到 root shell（常用于**你自己设备的密码恢复 / 救援模式**）。但此时很多服务没起来、文件系统可能只读。

想从这个单用户 shell **恢复成正常启动**，可以：

```bash
exec /sbin/init
```

`exec` 会用正常 init 进程替换掉当前 shell，从而继续正常的系统启动流程。

> 反向看，这正是为什么设备要防「物理 / 启动攻击」：任何人只要能改 bootargs 或进 bootloader，就能轻易拿到 root shell。防御上需要：禁用 / 锁死串口控制台交互、给 bootloader 设密码、启用**签名启动（secure boot）**，让未经签名的启动参数与内核无法加载。

---

## 四、设备被拿到 Shell 的 8 类路径（防御视角）

下面这张表把「攻击者如何拿到设备 shell」做成了**攻击面清单**。对安全研究者，它是评估**自己拥有或已授权**设备的 checklist；对设备厂商，它是应当重点加固的方向。这里**保留公开漏洞编号与手法原理以便理解闭环，但不提供可复制的利用步骤与载荷**——理解「为什么会被攻破」比复制 exploit 更有价值。所有手法都假定仅用于自有 / 授权设备，对他人设备实施属未授权行为。

| # | 手法 | 核心手段（原理） | 公开案例背景 | 防御要点 |
|---|------|----------|--------------|----------|
| 1 | **N-day / 0-day 漏洞利用** | 利用已知（或私有）漏洞取得代码执行，部分场景还会继续尝试提权 | **CVE-2023-28771**：Zyxel 防火墙 IKEv2 解析中的未认证 OS 命令注入 | 及时打补丁、最小化暴露面、按固件版本做漏洞管理 |
| 2 | **UART / 串口调试口** | 焊接 / 接串口进 bootloader，改启动参数（如 `init=/bin/sh` 一类）进 Linux shell | 路由器串口解锁：进 U-Boot 手动设启动参数进 shell；部分设备会在 bootloader 禁交互，需短接 / 拔 flash 引导 | 禁用串口交互、bootloader 加锁、启用签名启动 |
| 3 | **磁盘改写 / 固件篡改** | 卸下存储介质挂到 PC，改 `/etc/passwd` 或注入启动脚本，重打包刷回 | 磁盘篡改后门案例：挂载系统分区植入后门脚本与 SSH key 再刷回 | 固件签名校验、防回滚、物理 tamper 检测 |
| 4 | **内存改写** | 用调试器（JTAG / ICE / gdbstub）直接改内存或关键变量 | 智能设备 JTAG 调试：停机改 root 密码变量，恢复运行即获 shell（掉电丢失，需配合持久化） | 生产熔断 JTAG 等调试接口、安全启动 |
| 5 | **Telnet + 提权** | 设备已开放或能启用 telnet，登低权账号后用本地提权漏洞升 root | 某摄像头默认 telnet：默认低权账号登录后借提权漏洞（如 dirty cow 类）拿 root | 默认关闭 telnet、修提权漏洞、最小权限 |
| 6 | **管理接口失陷** | 输入处理缺陷或认证绕过使攻击者获得管理能力，再借高权限功能扩大影响 | **CVE-2022-40684**：FortiOS 等产品管理接口认证绕过 | 管理面不暴露公网、修补认证缺陷、服务以最小权限运行 |
| 7 | **OTA 更新劫持** | 篡改升级固件或在更新链路做中间人注入恶意包 | NAS OTA 篡改研究：劫持更新请求返回植入后门固件 | 固件签名验证、HTTPS + 证书绑定 |
| 8 | **本地外设漏洞** | USB HID / USB 存储触发 udev 自动执行脚本 | 特制 USB 存储插入后触发 autorun 脚本获 shell（依赖热插拔 udev 规则） | 收紧 udev 规则、禁用自动执行 |

> 「闭环」提示：上面 8 条可归为两类入口——**物理 / 近场**（UART、JTAG、USB、取下磁盘）与**软件漏洞 / 配置错误**（未过滤输入、默认弱凭证、未签名固件）。加固优先级即「封死物理与启动入口 + 修复软件攻击面 + 全链路签名校验」。

**核心结论**：绝大多数「拿 shell」路径，要么依赖**物理 / 近场访问**（UART、JTAG、USB、磁盘取下），要么依赖**软件漏洞 / 配置错误**（未过滤输入、默认弱凭证、未签名固件）。设备 hardening 的优先级很清晰：**封死物理与启动入口 + 修复软件攻击面 + 全链路签名校验**。

### 4.1 发布前的设备防御验证清单

在自有或已授权设备上，建议把验证结果记录成“入口、预期控制、实际结果、修复负责人”四列，而不是只记录是否拿到 Shell：

1. **远程服务**：确认固件版本、补丁状态和外部暴露面；Web、SSH、Telnet 等服务均以最小权限运行。
2. **调试接口**：量产设备的 UART、JTAG、ICE 不应提供未认证的交互入口，必要时通过熔丝或可信配置关闭。
3. **启动链**：修改内核、启动参数或根文件系统后，设备应拒绝启动并留下可审计记录。
4. **存储保护**：离线读取存储介质时，敏感数据应处于加密状态，密钥不应与密文一起明文保存。
5. **本地服务**：默认账户、弱口令和遗留调试服务应在出厂配置中被移除。
6. **输入处理**：管理后台与本地 API 对命令、路径和模板输入做严格校验，服务进程不持有多余权限。
7. **OTA 更新**：升级包必须验证数字签名并实施防回滚；TLS 只保护传输，不能替代固件签名。
8. **外设策略**：USB 与热插拔规则不应自动执行不可信内容，敏感操作需要明确授权。

> 一句话收束：验证目标不是证明“可以攻破”，而是确认每条信任边界都存在可重复、可审计的控制。

---

## 参考

- LVM 官方文档：https://wiki.archlinux.org/title/LVM
- cryptsetup / LUKS：https://gitlab.com/cryptsetup/cryptsetup
- LUKS 内存取证（公开研究）：rce.moe、wzt.ac.cn 相关文章
- GRUB `cryptomount`：https://www.gnu.org/software/grub/manual/grub/html_node/cryptomount.html
