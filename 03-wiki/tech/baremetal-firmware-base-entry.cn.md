---
title: 裸机固件基址与入口定位
lang: cn
description: 从向量表、绝对地址与内存映射入手，定位裸机固件的加载基址和 Reset 入口。
created: 2026-08-14
modified: 2026-09-24
tags:
  - firmware
  - reverse-engineering
  - ghidra
  - stm32
---

> 内容难免有误，请带着辩证视角阅读。本文讨论的是无文件系统、直接烧录到 MCU 的裸固件（bare-metal firmware）在逆向工具里的加载地址与入口定位，属于通用逆向工程基础。

## 本文内容

- **为什么裸固件需要「找基址」**：工具不知道加载地址，乱加载会满屏红地址
- **三种手工定位基址的方法**：switch 跳转表、JUMPOUT、LDR 绝对地址猜测
- **自动化工具**：rbasefind
- **Ghidra 实操**：以 STM32F103 为例，手动重建内存映射
- **SVD-Loader 插件**：自动创建内存段与外设
- **入口点（reset 向量）**的定位

---

## 一、为什么裸固件要先找基址

裸固件是一段原始二进制（没有 ELF/PE 那种自带加载信息的头），IDA / Ghidra 拿到它时**不知道该把它放到内存的哪个地址**。如果直接加载到 `0x0`，反汇编出来的绝对地址引用会全部标红（工具在文件里找不到对应偏移），字符串也没有交叉引用。

解决思路：先推断出正确的加载基地址（base address），再重新加载，让绝对地址能落到文件内的真实偏移上。

原笔记里的经验做法：先加载到 `0` 地址并**全量分析**，再通过观察绝对地址引用反推基地址。

---

## 二、三种手工定位基址的方法

### 方法 1：通过 switch 跳转表（jump table）定位

这是最常用、最稳的办法。C 的 `switch` 编译后常生成跳转表，表里存的是**绝对地址**。例如某处反汇编：

```
ROM:00001E70  LDR  R5, =...
ROM:00001E74  ; JUMP TABLE FOR SWITCH STATEMENT
ROM:00001E78  DCD 0x81601E9C
ROM:00001E7C  DCD 0x81601EE4
ROM:00001E80  DCD 0x81601ECC
...
```

表里的 `0x81601E9C` 是文件偏移 `0x1E9C` 处的真实运行地址，于是：

```
基地址 = 0x81601E9C - 0x1E9C = 0x81600000
```

（最常见的是 default case 分支，它往往直接指向某个函数入口。）

### 方法 2：F5 后通过 JUMPOUT 定位

反编译（F5）后若出现大量 `JUMPOUT(xxx)` 提示，说明函数边界因地址错误没切分对；结合这些异常跳转目标地址，也能反推出基址区间。

### 方法 3：通过 `LDR Rx, =0x...` 猜测

类似：

```
LDR  R0, =0x403102EC
LDR  PC, =0xXXXXXXXX
```

这类加载绝对常量的指令里经常出现外设基址或固定地址，是推断基址的重要线索。

---

## 三、自动化工具 rbasefind

手工方法适合小样本，大文件可用启发式工具自动猜基址：

- 项目：https://github.com/sgayou/rbasefind

它通过统计绝对地址的分布来推测最可能的加载地址，可作为手工验证的补充。

---

## 四、Ghidra 实操：以 STM32F103 为例

参考：https://blog.attify.com/analyzing-bare-metal-firmware-binaries-in-ghidra/

### 1. 加载固件

Ghidra 导入原始二进制后，第一步选对**语言**。STM32F103 是 ARM Cortex-M3（32 位小端），选 `ARM-Cortex-32-little`。

### 2. 识别「加载错了」的特征

分析完后若发现：

- 形如 `0x08000XXX` 的地址被标红（双击无结果）；
- 对 `0xE000xxxx`（内核外设）、`0x20000xxx`（SRAM）的引用解析不了；
- 字符串没有任何交叉引用；

就说明**基地址不对**。

### 3. 查数据表确定基地址

STM32F103 的闪存（Flash）基地址是 `0x08000000`，这同时就是固件映像的加载地址。SRAM 从 `0x20000000` 开始。可以从芯片头文件（`stm32f103x6.h`）或数据表的内存映射确认：

```c
#define FLASH_BASE   0x08000000UL  // 闪存基址 = 固件加载地址
#define SRAM_BASE    0x20000000UL  // SRAM 基址
#define PERIPH_BASE  0x40000000UL  // 外设基址
```

### 4. 重新创建内存映射

重新导入时，在导入对话框的 Options 里把基地址设为 `0x08000000`。然后手动补两块内存：

- **Flash 段**：base `0x08000000`，长度 = 固件文件大小（如 64 KiB = `0x10000`）。
- **SRAM 段**：base `0x20000000`，长度按芯片 SRAM 大小（如 20 KiB = `0x5000`）。
- **Peripherals 段**：base `0xE0000000`，长度 `0x100000`（ Cortex-M 内核外设 / 位带区）。

> 注意：设好内存映射后若反汇编没自动刷新，可在 `Analysis → Auto Analyze` 重跑默认分析。

重新分析后：

- `0x08000xxx` 不再标红；
- 字符串旁边开始出现交叉引用；

说明加载地址与内存映射都对了，可以正常分析代码逻辑。

> 提醒：Ghidra 不会自动识别所有函数边界——有些地址处是代码还是数据仍需手工判断（快捷键 `D` 转代码、`C` 转数据）。

---

## 五、SVD-Loader 插件

手动建内存映射很繁琐。Leveldown Security 的 **SVD-Loader**（https://github.com/leveldown-security/SVD-Loader-Ghidra）能解析 SVD（System View Description）文件，**自动创建**裸机 ARM 固件的内存段和外设寄存器。

用法：

1. 安装：把插件目录加入 Ghidra 脚本管理器（Window → Script Manager）的脚本目录列表。
2. 先把固件以正确基地址（`0x08000000`）加载进来。
3. 从脚本管理器运行 `SVD-Loader.py`，按提示选择对应芯片的 `.svd` 文件（如 `STM32F103xx.svd`，可从 https://github.com/posborne/cmsis-svd 获取）。
4. 插件会自动建好外设段；但 **SRAM 段（`0x20000000`）插件不会自动创建**，需手动补上。

之后同「手动恢复」后续步骤一样跑自动分析即可。

相关资源：

- CMSIS SVD 仓库：https://github.com/cmsis-svd/cmsis-svd
- STM32 SVD：https://github.com/modm-io/cmsis-svd-stm32

---

## 六、入口点（Reset 向量）定位

裸固件的「入口」不是 `main`，而是芯片上电后硬件读取的 **向量表（vector table）**。以 Cortex-M 为例，向量表固定在 Flash 起始处：

| 偏移 | 内容 | 含义 |
|------|------|------|
| `0x00` | 初始 SP 值 | 栈顶地址（指向 SRAM 顶部，如 `0x2000XXXX`） |
| `0x04` | Reset 处理例程地址 | 复位后第一条执行的指令（入口点） |
| `0x08` | NMI 处理例程 | |
| ... | 各类异常 / 中断向量 | |

所以一旦基址确定（如 `0x08000000`）：

- `0x08000000` 处的 4 字节 = 初始栈指针；
- `0x08000004` 处的 4 字节 = **复位入口地址**，也就是真正的程序起点。

顺着这个地址往下，就是芯片初始化、搬移数据、最终跳到 `main` 的启动代码。结合前面「基址定位」的结果，向量表里的绝对地址应当能正确解析。

---

## 参考

- 固件安全之加载地址分析：https://bbs.kanxue.com/thread-267719-1.htm
- Analyzing bare metal firmware binaries in Ghidra：https://blog.attify.com/analyzing-bare-metal-firmware-binaries-in-ghidra/
- 另一示例分析：https://tttang.com/archive/1418/
