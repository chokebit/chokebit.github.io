---
title: IoT 文件系统与内核启动参数
lang: cn
description: 认识常见 IoT 文件系统、initramfs 与 Linux 启动参数，为固件拆解和启动分析打基础。
created: 2026-08-14
modified: 2026-09-24
tags:
  - iot
  - filesystem
  - kernel
  - squashfs
  - ubifs
---

> 内容难免有误，请带着辩证视角阅读。本文梳理 IoT 固件里常见的文件系统格式，以及 Linux 内核常见的启动参数——这些是「拆开固件、挂载文件系统、理解启动行为」的基础。

## 本文内容

- **常见 IoT 文件系统**：squashfs、ubifs、jffs2、cpio/initramfs、以及 ext4/xfs
- **cpio 解包命令详解**
- **Linux 内核常见启动参数**：ro/rw/init/single/root/vga/quiet/mem/acpi/noapic/nomodeset
- **与固件分析的关系**

---

## 一、常见 IoT 文件系统

IoT / 嵌入式设备的根文件系统（rootfs）和内核镜像里，常见的文件系统格式：

### 1. squashfs（最常见）

只读、高度压缩的文件系统，几乎是所有路由器 / 嵌入式 Linux 固件 rootfs 的标配。特点：

- **只读**：设备运行时无法直接改写，保证了系统完整性（要改需重打包镜像）。
- **高压缩比**：支持 gzip/lzma/xz/zstd 等多种压缩。
- 工具：`squashfs-tools`（`unsquashfs` 解包、`mksquashfs` 打包）。

### 2. ubifs（UBI + UBIFS）

面向 **NAND Flash** 的文件系统，工作在「裸 NAND」之上，配合 UBI 卷管理层处理坏块、磨损均衡。常见于较新的 NAND 方案设备。和 squashfs 不同，UBIFS 可以**可读写**。提取通常需要先 `ubi_extract` / `ubireader` 或借助 `nanddump` + `ubifs` 工具链。

### 3. jffs2（Journalling Flash File System v2）

较早的、**NOR Flash** 常用文件系统，也支持 NAND。带磨损均衡与断电保护（日志型）。可用 `jefferson`（Python）或 `jffs2dump` 提取。现在新设备更多被 ubifs 取代。

### 4. cpio + initramfs / initrd

`cpio` 是早期 Unix 的归档格式，常用于 **initramfs / initrd**（初始 RAM 文件系统）。内核启动早期先挂载它，加载驱动、准备真正的根文件系统。格式非常朴素，没有压缩头之外的复杂结构。

解包命令：

```bash
sudo cpio -idmv < rootfs
```

各选项含义：

| 选项 | 含义 |
|------|------|
| `sudo` | 以超级用户权限执行（部分文件需要） |
| `cpio` | 归档工具本身 |
| `-i` | 提取（解归档） |
| `-d` | 需要时自动创建目录结构 |
| `-m` | 保留文件的修改时间 |
| `-v` | 显示详细的提取进度 / 文件列表 |
| `< rootfs` | 从 `rootfs` 这个归档文件读入 |

### 5. ext4 / xfs（仿真镜像里常见）

当固件被仿真框架（如 FirmAE、FAT）重组成磁盘镜像（`image.raw`）时，里面的分区通常是 **ext4**（用 `mkfs.ext4` 生成），可以直接 `kpartx + mount` 挂载（见《固件获取、解密与重打包》）。xfs 是高性能日志文件系统，在服务器 / 某些嵌入式方案里也能见到。

### 6. ram 磁盘（ramdisk）

把文件系统整个放进内存，启动快、掉电即失。常用于 Live 系统或早期引导阶段。`initramfs` 本质上就是一种 ram 磁盘。

---

## 二、内核常见启动参数

内核命令行（`bootargs` / `cmdline`）控制启动行为。常见参数：

| 参数 | 作用 |
|------|------|
| `ro` | 以**只读**方式挂载根文件系统，防意外写入 |
| `rw` | 以**读写**方式挂载根文件系统 |
| `init=/path/to/init` | 指定初始化进程（绕过默认 `/sbin/init`；救援 / 提权研究常用 `init=/bin/sh`） |
| `single` | 单用户模式，只起一个 shell，用于维护 / 排障 |
| `root=/dev/sda1` 或 `root=UUID=...` | 指定根文件系统的设备或 UUID |
| `vga=XXX` | 设置启动显示模式（`0`=80×25 文本、`1`=80×50 文本等） |
| `quiet` | 屏蔽内核启动冗长输出，界面更干净 |
| `mem=xxx` | 指定可用物理内存大小 |
| `acpi=off/on/force` | 控制 ACPI（高级配置与电源接口） |
| `noapic` | 禁用 APIC（高级可编程中断控制器），排中断相关问题时用 |
| `nomodeset` | 禁用内核显卡模式设置，排图形驱动问题时用 |

> 安全研究提示：`init=/bin/sh` 这类参数在**你拥有物理访问 / 串口权限的设备**上，可用于绕过登录拿到 shell（救援模式）。这正是很多设备上「串口 + 改 bootargs」能拿到 root 的原因——也说明给设备加物理 / 启动保护（禁用串口控制台、签名启动）的重要性。

参考：Linux 内核 initramfs 文档 https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html

---

## 三、与固件分析的关系

- **拆固件 → 认格式**：先用 `binwalk` 看固件由哪些段组成，判断 rootfs 是 squashfs / ubifs / jffs2 / cpio，再选对应工具提取。
- **挂载 → 改文件**：squashfs 需 `unsquashfs`+`mksquashfs` 重打包；仿真镜像里的 ext4 可直接 `mount` 改（效率更高）。
- **看启动 → 懂参数**：`bootargs` 里的 `init=`、串口输出，能告诉你设备怎么起来的、有没有留后门式的调试入口。

下接《固件仿真与调试（QEMU / FirmAE）》会用到这里的所有格式与参数概念。

---

## 参考

- squashfs-tools：https://github.com/plougher/squashfs-tools
- Linux ramfs/rootfs/initramfs 文档：https://docs.kernel.org/filesystems/ramfs-rootfs-initramfs.html
- ubifs / UBI 工具：http://www.linux-mtd.infradead.org/
