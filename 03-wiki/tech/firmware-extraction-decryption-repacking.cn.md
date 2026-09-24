---
title: 固件获取、解密与重打包
lang: cn
description: 在授权前提下理解固件获取、启动链解密、文件系统挂载与镜像重打包的完整流程。
created: 2026-08-14
modified: 2026-09-24
tags:
  - firmware
  - iot
  - reverse-engineering
  - encryption
---

> 本文所有操作均假定你在**自己拥有或已获书面授权**的设备 / 固件上进行（例如厂商提供的开发板、自购硬件、官方公开固件）。不要对不属于你的设备执行任何提取、刷写或绕过校验的操作。
> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **固件获取途径**：官方、售后、编程器、UART、升级流量等（均在授权前提下）
- **固件加解密原理**：从 BootROM → SPL → BootLoader → Kernel → FileSystem 的启动链理解「谁加密、谁解密」
- **如何拿到可分析的明文固件**：过渡版本法、升级接口定位、UART / 串口、授权范围内的漏洞利用
- **镜像重打包**：firmware-mod-kit 与 kpartx + mount 两种路径
- **常见坑**：重打包后体积变大、CRC update failed

---

## 一、固件获取途径（授权前提下）

在拿到一台设备做安全研究时，第一步是获得固件镜像。常见的、合规的获取渠道：

- **官方渠道**：厂商官网的固件下载页、SDK 包。
- **售后 / 支持**：官方提供的修复包、升级包。
- **编程器（SPI NOR/NAND 编程器）**：直接读取芯片内容。适用于你拥有物理设备的场景。
- **UART / 串口**：通过设备预留的调试串口 dump 内存或分区。
- **telnet / ssh**：设备已开放且你有权限时，直接读取分区（`/dev/mtd*` 等）。
- **抓取升级请求流量**：在自己控制的网络里，拦截设备向官方服务器请求更新的包，从而拿到官方升级固件。若已在授权设备上拿到 shell，也可以直接用 `tcpdump -i any -w upgrade.pcap 'host <升级服务器>'` 抓升级流量，再离线分析提取固件包。

辅助识别工具：`file`、`grep`、`hexdump`、`strings`、`dd`。它们用来判断镜像格式、定位关键字段、提取某一段数据。

> 安全研究的正当边界：上述方法（尤其 UART、串口、流量抓取、漏洞利用）只有在你对自己所有的设备或已授权的测试目标使用时才合法合规。把方法用到他人设备上是另一回事。

---

## 二、固件加解密原理

理解固件加解密，要从**设备启动链**看：

```
BootROM（芯片厂固化） → SPL（片内二级加载） → BootLoader → Kernel → FileSystem
```

- **BootROM**：厂商出厂固化在芯片里，最先执行，通常不可改。
- **SPL（Second Program Loader）**：片内 SRAM 中运行的二级加载器，体积小。
- **BootLoader**：如 U-Boot，负责加载内核。
- **Kernel**：Linux 内核。
- **FileSystem**：根文件系统，厂商的核心业务逻辑一般在这里。

**解密逻辑的核心约束**：被加密部分的「解密程序」必须存在于**更早启动**的那一段里。例如：

| 被加密的部分 | 特点 | 通常由谁负责解密 |
|------|------|------|
| FileSystem | 厂商核心数据 | BootLoader 或 Kernel |
| Kernel | 开源、可定制 | BootLoader |
| BootLoader | 开源、可定制 | SPL（但 SPL 体积受限，难以塞入复杂解密逻辑） |

**加密固件的一个可观测特征**：被加密区域的字节熵值接近 1（接近随机），与周围明文区域的熵有明显落差，可以用 `binwalk -E`（熵分析）快速定位。

---

## 三、如何拿到解密后的明文固件

### 1. 过渡版本法（最常用）

厂商在引入加密时，往往有一个「过渡期」：

- **v1**：未加密。
- **v1.1**：开始包含解密程序，但固件本身还没加密。
- **v1.2**：固件加密，同时仍携带解密程序。

为什么需要过渡版本？因为直接从未加密的 v1 升级到加密的 v1.2 会失败——v1 里没有解密程序，无法处理 v1.2 的密文。所以官方升级说明里常出现类似：

> The firmware v3.11 must be upgraded from the transitional version of firmware v303WWb04_middle.

思路：先拿到中间过渡版本（v1.1），从中提取出解密程序 / 密钥，再用来解密目标版本。

### 2. 通过固件升级接口定位解密逻辑

- 用抓包工具（如 Burp Suite）拦截设备发起的固件升级请求，拿到升级接口。
- 在固件文件系统中 `grep` 相关关键字，定位到处理该接口的后台服务 / CGI。
- 顺着调用链找到真正做解密 / 校验的函数。

### 3. 其它获取明文的方法

- **UART / 串口**：进入设备 shell，直接读取解密后的运行态分区。
- **telnet / ssh**：已开放且授权时，同样可以读取运行态。
- **低版本漏洞（授权范围内）**：若老版本存在已知漏洞可拿到执行权限，可借此 dump 内存或分区。仅用于自己拥有的设备 / 已授权的目标。
- **逆向算法**：从过渡版本或 BootLoader 里把解密算法和密钥还原出来（见下一篇《固件字符串混淆解密》）。

---

## 四、镜像重打包

研究时常需要修改文件系统后再重新打包成可刷写的镜像。

### 1. firmware-mod-kit（FMK）

适用于大多数 BIN 格式（对 IMG 类镜像作用有限）。解包与打包必须用同一套脚本配对：

```bash
# 解压，产物在 ./fmk/ 下
./extract-firmware.sh <固件.bin>

# 重打包，产物同样在 ./fmk/ 下
./build-firmware.sh [-nopad] [-min] ./fmk/
```

常用工具对照（整理自原笔记）：

| 工具 | 主要用途 |
|------|----------|
| firmware-mod-kit | 解包 / 打包 BIN 固件 |
| mkxqimage | 修改小米路由器 IMG 镜像 |
| WinHex | 编辑大部分 BIN 文件 |
| squashfs-tools | 处理 IMG 中的 squashfs |
| mkimage | 生成 U-Boot 可用的 uImage |

> 镜像格式链：`vmlinux/vmlinuz → image(objcopy) → zImage(gzip) → uImage(uboot 头部)`。

### 2. 不破坏镜像、直接进文件系统（kpartx + mount）

当固件是原始磁盘镜像（如仿真框架生成的 `image.raw`，通常是 ext4）时，更优的做法是直接挂载，而不是重新打包：

```bash
# 步骤 1：把 raw 镜像映射到 loop 分区设备
sudo kpartx -av image.raw
# 输出示例：add map loop28p1 (253:7): 0 2093056 linear /dev/loop28 2048

# 步骤 2：挂载第一个分区
sudo mount /dev/mapper/loop28p1 ./mnt

# 步骤 3：浏览、修改文件系统
ls ./mnt

# 步骤 4：清理
sudo umount ./mnt
sudo kpartx -dv image.raw
```

先 `fdisk -l image.raw` 可确认分区偏移与类型。FirmAE 之类的框架构造的 `image.raw` 多为 `mkfs.ext4` 生成的 ext4，Linux 可直接挂载。

---

## 五、常见坑

### 1. 重打包后体积变大 → 打包失败

firmware-mod-kit 默认拒绝生成比原镜像更大的固件（防止变砖）：

```
ERROR: New firmware image will be larger than original image!
       Building firmware images larger than the original can brick your device!
       REFUSING to create new firmware image.
```

解决：用 `-min` 重新压缩，或删减不必要的文件、降低图片分辨率来缩小体积。

### 2. CRC update failed

```
CRC update failed.
Firmware header not supported; firmware checksums may be incorrect.
```

含义：FMK 不认识该固件的头部校验格式，无法自动更新 CRC / 校验和。此时镜像虽然生成了，但设备刷入时可能因校验不通过而拒绝。

应对方向：

- 手动根据厂商头部格式补算校验和（需逆向头部结构）。
- 若设备支持「命令行本地升级 / 救援模式 / 官方打包工具」，可绕过部分校验。
- 删文件并不能解决「头部不支持」的问题，CRC update failed 与文件多少无关。

---

## 六、参考

- IoT 漏洞研究（一）固件基础：https://www.freebuf.com/articles/endpoint/254257.html
- 四个字节的安全：一次固件加密算法的逆向分析：https://cloud.tencent.com/developer/article/1005700
- firmware-mod-kit：https://github.com/rampageX/firmware-mod-kit
- 上接《加密算法基础：AES 与 RSA》，下接《固件字符串混淆解密》。
