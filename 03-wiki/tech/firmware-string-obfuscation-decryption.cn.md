---
title: 固件/二进制字符串混淆与解密还原
lang: cn
description: 结合反汇编器 API、Capstone 与 Unicorn，还原固件和二进制中的混淆字符串。
created: 2026-08-14
modified: 2026-09-24
tags:
  - reverse-engineering
  - strings
  - capstone
  - unicorn
  - malware-analysis
---

> 本文介绍的是「从二进制里还原被混淆 / 加密的字符串」这一通用逆向技术，常用于恶意代码分析（提取 IOC）、受保护程序分析、以及固件里被混淆的字符串还原。文中示例仅用于**授权范围内的研究**：你自己的程序、已授权的测试目标、或公开的研究语料（如 Abuse.ch MalwareBazaar、CTF 题目）。不要对你无权分析的样本使用这些方法。
> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **两类混淆字符串**：硬编码密文（可直接定位）+ 栈字符串（stack string，运行时拼装）
- **反汇编器 API 工作流**：找解密函数交叉引用 → 找密文参数 → Python 复现算法 → 注释 / 覆盖
- **为什么静态复现会翻车**：编译器会把 `lea+shl` 优化成 `imul`，不同样本常数不同
- **Capstone vs Unicorn**：静态反汇编 vs CPU 仿真
- **自动化流水线**：用字节特征定位解密例程 → 定位首个栈字节 → 裁剪代码块 → Unicorn 仿真还原
- **实战 Python 脚本骨架**

---

## 一、两类被混淆的字符串

字符串混淆的目的通常是隐藏敏感字面量（URL、命令、密钥、错误信息），让静态 `strings` 直接看不到。常见两类：

1. **硬编码密文**：密文字节以数据形式躺在 `.data`/`.rodata` 段，运行时由某个解密函数还原。可以搜数据段找到密文，再回溯定位解密函数。
2. **栈字符串（stack string）**：不是一段连续密文，而是代码里用一连串 `MOV` 把单字节逐个搬进栈地址，再调用解密例程。对这种，**没法在数据段搜到完整密文**，只能顺着代码找「大量向栈地址写数据的 MOV 指令」。

> 注意：如果字符串是**动态拼接**（而不是一次性硬编码），分析者需要先把这些片段找齐、拼好，再解密。

---

## 二、反汇编器 API 工作流（最简单情形）

如果你用的反汇编器（IDA / Ghidra / radare2 等）提供了脚本 API，最省事的做法是：

1. **找到字符串解密函数的所有交叉引用（xref）**。
2. **找到作为参数传给该函数的密文字节**。
3. **在 Python 里复现解密算法**，把密文解出来。
4. **加注释，或直接覆盖**原密文字节为明文。

这套思路对「硬编码密文 + 简单算法」非常高效，是手工还原的首选。

---

## 三、为什么静态复现会翻车

很多样本里同一算法会有多个变体。例如一段 x86 解密循环，反编译出来可能是：

```c
for (i = 0; i < 0x1A; ++i)
    v[i] = (23 * (49 - (unsigned char)v[i]) % 127 + 127) % 127;
```

但换一个同家族样本，常数变了：

```c
for (i = 0; i < 0x1A; ++i)
    v[i] = (24 * (78 - (unsigned char)v[i]) % 127 + 127) % 127;
```

更麻烦的是，看汇编会发现第二个样本里**没有 `imul`**，而是：

```nasm
lea     eax, [ecx+ecx*2]   ; *3
shl     eax, 3             ; *8  => 共 *24
```

也就是说 **IDA 把 `lea+shl` 优化显示成了 `imul 24`**。这意味着你没法简单地用正则抓「乘法常数」——加减乘的编码方式五花八门。

结论：当算法在不同样本间有变体、且编译器做了指令化简时，**纯静态 + 正则提取常数**会很脆弱。这也是为什么更稳的方案是**直接用 Unicorn 仿真执行**那段解密代码，而不是在 Python 里重写算法。

---

## 四、Capstone 与 Unicorn 的区别

| 工具 | 本质 | 用途 |
|------|------|------|
| **Capstone** | 轻量多平台、多架构**反汇编框架** | 把机器码变成汇编指令列表（静态） |
| **Unicorn** | 轻量多平台、多架构 **CPU 仿真框架** | 在 Python 里直接**执行**一段机器码（像调试器） |

- 想在 Python 里执行一小段汇编 → 用 **Unicorn**。
- 想静态分析指令流 → 用 **Capstone**。
- **Qiling** 站在 Unicorn 之上，多了 OS 概念（ELF/PE/MachO 加载、动态链接、syscall、IO），能跑完整二进制；而 Unicorn 只认裸机器指令，没有 OS 上下文。批量还原字符串通常只需要 Unicorn 级别的裸指令仿真即可。

---

## 五、自动化流水线（以 x86 栈字符串为例）

下面是一套「不依赖具体常数、靠代码结构定位」的通用思路（源自公开逆向教程，已抽象掉样本细节）。

### 步骤 1：用字节特征定位解密例程

在 IDA 里用 `Search → Sequence of Bytes`，把会变的地方用 `??` 通配。比如观察到每个解密块里 `esi` 作计数器、和长度比较：

```nasm
inc     esi
cmp     esi, 1Ah     ; 长度可能变化，用 ?? 通配
jb      short ...
```

字节序列：`46 83 FE ?? 72`。但 `esi` 不一定总作计数器，更稳的特征是解密里必然出现的「取加密字节到 AL」指令（`8A 44 ...` / `8A 84 ...`），以及后面的除法：

```nasm
cdq
idiv    ebx
lea     eax, [edx+7Fh]
cdq
idiv    ebx
```

> 核心思路：**找解密例程里「不变的量」**（比如这里的除法模式、`0x7F` 取模），而不是去抓会变的计算常数。

用 Capstone + 正则统计命中：

```python
import re
from capstone import *

md = Cs(CS_ARCH_X86, CS_MODE_32)
md.detail = True
md.skipdata = True

data = open("file.bin", "rb").read()
rule = re.compile(b"\x8A\x44.{2,3}|\x8A\x84.{2,6}")
print(len(list(rule.finditer(data))))   # 命中数量
```

> 这里 `.{2,3}` / `.{2,6}` 是为了把 `8A 44`/`8A 84` 后面的操作数一并匹配进来，避免只抓到 2 字节导致反汇编失败。

### 步骤 2：定位「第一个被搬上栈的加密字节」

对每个命中，向前回溯 500 字节反汇编，逆序扫描，找到向**与命中点相同栈偏移**写数据的 `MOV`（即栈字符串的构造起点）：

```python
for m in rule.finditer(data):
    string = data[m.start():m.end()]
    disasm = list(md.disasm(string, 0, len(string)))
    offset = disasm[0].operands[1].value.mem.disp   # 命中点引用的栈偏移

    data_block = data[m.start()-500:m.end()]
    disasm_list = list(md.disasm(data_block, 0, len(data_block)))

    for i in reversed(disasm_list):
        if i.mnemonic == "mov" and i.operands[0].type == 3:   # 写内存（栈）
            if i.operands[0].value.mem.disp == offset:
                print("found stack string creation >", hex(i.address), offset)
```

> `operands[0].type == 3` 对应 `CS_OP_MEM`（内存操作数）。这一步是为了把回溯窗口里「构造栈字符串」的真正起点找出来，避免把无关的前 450 字节也送进仿真。

### 步骤 3：裁剪出完整解密代码块

从构造起点，到解密循环的结尾（`jb` 之类回跳指令）为止，截出恰好包含解密逻辑的最小字节块：

```python
smaller_block = data[(m.start()-500 + i.address):m.end()+75]
for y in md.disasm(smaller_block, 0, len(smaller_block)):
    if y.mnemonic == "jb":                 # 解密循环回跳
        smaller_block = smaller_block[:y.address + y.size]
        break
```

> 末尾多取一些字节是为了把循环体本身也包含进来；再用 `jb` 精确截断循环结束位置。

### 步骤 4：Unicorn 仿真还原

把裁剪好的代码块写进 Unicorn 的内存，设好相关寄存器（注意：除法用到的常数，如 `0x7F`，必须先在对应寄存器里初始化好，否则会抛 `UC_ERR_EXCEPTION`），跑完后再从栈上读回解密后的字符串：

```python
from unicorn import *
from unicorn.x86_const import *

def unicorn_block(block):
    mu = Uc(UC_ARCH_X86, UC_MODE_32)
    ADDRESS = 0x1000000
    mu.mem_map(ADDRESS, 4 * 1024 * 1024)
    mu.mem_write(ADDRESS, block)

    # 按样本把用到的寄存器初始化好（含除法常数 0x7F）
    mu.reg_write(UC_X86_REG_ESI, 0x7f)
    mu.reg_write(UC_X86_REG_EDI, 0x7f)
    mu.reg_write(UC_X86_REG_EBX, 0x7f)
    mu.reg_write(UC_X86_REG_ECX, 0x7f)
    mu.reg_write(UC_X86_REG_ESP, ADDRESS + 0x100000)
    mu.reg_write(UC_X86_REG_EBP, ADDRESS + 0x200000)

    try:
        mu.emu_start(ADDRESS, ADDRESS + len(block))
    except Exception as E:
        print(E)

    ebp = mu.reg_read(UC_X86_REG_EBP)
    data = mu.mem_read(ebp - 0x100000, 0x100000).decode("utf-8", "ignore")
    print(data)
```

把步骤 2~4 串起来，就能批量还原样本里成百上千个被混淆的字符串。

---

## 六、常见坑

- **回溯窗口把指令「拦腰截断」**：`-500` 偏移可能正好切在一条多字节指令中间，导致 Capstone 反汇编失败。解决：用循环把起始偏移一点点往前提，直到能反汇编出足够多的有效指令（如 `len(disasm_list) >= 10`）。
- **漏掉除法常数初始化**：Unicorn 仿真前务必把 `idiv` 用到的寄存器设好初值，否则一执行除法就异常。
- **误报**：字节特征可能命中非解密代码，导致仿真读不到字符串或乱码。需要结合长度、栈偏移等做二次过滤。
- **超长字符串**：只回看固定窗口（如 500 字节）会截断很长的栈字符串（如勒索信），需要动态扩大窗口。

---

## 七、小结

字符串解密还原的通用要点：

1. **定位**解密代码（字节特征 / 除法模式 / 栈写入模式）。
2. **批量**找出所有同类解密代码段。
3. **仿真**执行（Unicorn）而非手写算法，避开编译器化简与变体常数。
4. **处理**无关指令导致的反汇编 / 仿真报错。

这套方法对恶意代码 IOC 提取、受保护程序分析、以及固件里的字符串混淆都适用。把它当成「让静态工具看不清的字面量重新显形」的通用手段即可。

---

## 参考

- Capstone 引擎：https://www.capstone-engine.org/
- Unicorn 引擎：https://www.unicorn-engine.org/
- Qiling 框架：https://github.com/qilingframework/qiling
- 逆向工程：用 Capstone 解析栈字符串（0ffset.net）：https://www.0ffset.net/reverse-engineering/capstone-resolving-stack-strings/
- 用 Capstone 识别交叉引用（0ffset.net）：https://www.0ffset.net/reverse-engineering/identifying-xrefs-with-capstone/
