---
title: IDA Pro 使用技巧速查
lang: cn
description: 汇总 IDA Pro 导航、类型恢复、交叉引用、反编译与 IDAPython 自动化的实用技巧。
created: 2026-08-24
modified: 2026-09-24
tags:
  - ida
  - reverse-engineering
  - tooling
  - disassembly
---

> 内容基于公开 IDA Pro 技巧与个人实践整理（参考 firmianay/ida-pro-tips、Hex-Rays 官方博客、各大安全社区），难免有误，请带着辩证视角阅读；本文仅用于授权环境下的程序分析、逆向研究与防护加固。
>
> 约定：文中快捷键以 Windows 布局为准；示例中的 `<IDA安装目录>`、`<用户名>`、`<代理IP>`、`<回连IP>` 等为脱敏占位符，请替换为你的实际环境；原草稿中的 Yuque 截图因含第三方账号信息已全部省略。

# IDA Pro 使用技巧速查

## 1. 界面基础与导航

### 1.1 说明与常用操作

- 栈偏移内容：`+` 为参数，`-` 为局部变量。
- 数据转换快捷键（光标处）：
  - `C` 解析为代码（code），常用于把数据区的 shellcode 转成汇编。
  - `P` 在函数的起始地址处，把当前地址解析成函数。
  - `D` 解析为数据（data），并在字节/字/双字之间循环切换。
  - `A` 解析为 ASCII 字符串。
  - `U` 解析为未定义（unDefined）。
- 查看引用：`X`（jump to xref）。
- 重命名：`N`。
- 搜索地址或符号：`G`。
- 退到上一个操作地址：`ESC`；前进到下一个：`Ctrl+Enter`。
- 反汇编窗口在「文本视图 / 图形视图」间切换：空格键。

### 1.2 注释

| 位置 | 快捷键 | 说明 |
| :--- | :--- | :--- |
| 汇编代码窗口 | 冒号 `:` | 普通注释 |
| 汇编代码窗口 | 分号 `;` | 可重复注释，引用处也会显示该注释 |
| 伪代码窗口 | `/` | 注释 |

> 习惯写法：`shift+;` 普通注释，`;` 重复注释（repeater comment）。

### 1.3 标签（书签）

- 添加标签：`ALT+M`
- 列出所有标签：`CTRL+M`

### 1.4 段与数据转换

- 打开二进制段列表（查看各段的开始/结束地址）：`CTRL+S`
- 设置指令分析格式（如切换 ARM/Thumb、64/32 位）：`ALT+G`
- 导出反编译结果：`Ctrl+F5`（注意：导出内容容易出错，见「常见问题」）
- 导出反汇编结果：`Alt+F10`

## 2. 搜索与定位关键代码

| 目标 | 快捷键 |
| :--- | :--- |
| 程序里的字符串（Strings 窗口） | `Shift+F12` |
| 文本搜索 | `ALT+T` |
| 16 进制（二进制字节序列）搜索 | `ALT+B` |
| 函数搜索 | `CTRL+F` |
| 重复上一个搜索 | `CTRL+T`（文本）/ `CTRL+B`（二进制） |

定位关键代码的典型思路：

```text
搜索特征字符串：
  ① Ctrl+S 打开段选择对话框 → 双击 Strings 跳到字符串段
     → 菜单 Search → Text
  ② 或直接 Alt+T，在对话框中输入要找的字符串，OK 即可
```

匹配括号（找对应的 `{` / `}`）：`%`（即 `Shift+5`）。

## 3. 快捷键速查

### 3.1 调试快捷键

| 快捷键 | 功能 |
| :--- | :--- |
| `F7` | 单步步进（step into） |
| `F8` | 单步步过（step over） |
| `F9` | 继续运行 |
| `F4` | 运行到光标所在行 |
| `Ctrl+F7` | 直到当前函数返回才停止 |
| `Ctrl+F2` | 终止正在运行的进程 |
| `F2` | 设置断点 |
| `Ctrl+Alt+B` | 打开断点列表 |

### 3.2 导航与寄存器

- 快速导航菜单：按住 `Alt` 同时按带下划线的字母（加速器 accelerator）。
- 快速搜索下一个：在列表/窗口中 `Alt+上/下`。
- 跳转到上一个 / 下一个函数（IDA 7.2+）：`Ctrl+Shift+Up` / `Ctrl+Shift+Down`。
- 快速定位寄存器的「定义（写入）」与「使用（读取）」位置（IDA 7.5+，目前对 x86/x64、ARM、MIPS 支持）：
  - `Shift+Alt+Up`：查找选定寄存器的前一个被定义位置。
  - `Shift+Alt+Down`：查找选定寄存器的下一个被使用位置。
  - 在以高优化级别编译的大型函数中尤其有用。

### 3.3 杂项清单

```text
ESC              返回
Ctrl+Enter       进入
F12              获得执行流程图
idagui.cfg       快捷键配置文件
shift+;          普通注释
;                重复注释（引用处出现）
ALT+M            添加书签
CTRL+M           显示所有书签
xref[p/j/o]      p=procedure, j=jump, o=offset
ALT+P            编辑函数（查看所属函数、起止地址）
C                数据变汇编
D                数据类型转换（字节/字/双字间切换）
ALT+T / CTRL+T   搜索字符串 / 重复
ALT+B / CTRL+B   二进制字节序列搜索 / 重复
```

## 4. 栈帧、参数与变量识别

核心规则：**参数用加法（`+`），局部变量用减法（`-`）**。

```text
envp
-----ebp +0x10   ; and esp, 0FFFFFFF0h
argc
-----ebp+8
argv
-----ebp+4
ret
-----
ebp              ; push ebp
-----ebp         ; mov ebp, esp
局部变量
----
```

以 64 位 ARM 为例（`fpd=0x30`）：

```text
var_30 = -0x30   ; 栈顶
var_1C = -0x1C
var_18 = -0x18
...
STR W0, [X29,#0x30+var_14]   ; 距 ebp 实际为 0x30-0x18 = 0x18
```

栈偏移数据转换（`K` / `Q`）：

```text
[SP,#0x70+var_50]   按 Q 转成下面的模式
[SP,#0x20]          按 K 转成上面的模式
```

> `K` 会显示变量名（红色，已识别），未显示的需计算（如 `-0x50+0x40=-0x10`，位于 ebp 下方，绿色）。
> 其他架构同理：以 `sp` 为参照基准，通过加减分配参数与局部变量。

## 5. 反编译与函数识别

- **IDA 没能识别出函数**：跳到该地址，按 `P`（或右键 `Create function`）新建函数，再 `F5`。
- **修正函数声明 / 参数**：在伪代码窗口选中函数名，按 `y` 修改类型声明。
- **F5 的坑**：
  1. F5 还原的代码需要自己比对汇编修正，否则容易出错。
  2. `Ctrl+F5` 导出的反编译内容经常不准。
  - 解决：建议比对汇编手动整理，或用 `Shift+E` 导出原始数据。
- **处理 `sp-analysis failed` / too big function**：见「常见问题」与「逆向经验」。

## 6. 结构体与类型

### 6.1 三种创建方式

**0x01 在 IDA 中手动创建**

1. 打开结构体子视图：`View → Open Subview → Structures`（`Shift+F9`）。
2. 按 `I` 弹出创建窗口，输入结构体名。
3. 在 `ends` 行按 `d` 创建成员；继续按 `d` 修改数据类型（`db`/`dw`/`dd`/`dq`）；右键选 `Array` 可建数组。
4. 按 `y` 把成员类型改为结构体名。
5. 给局部变量指定结构体：快捷键 `t`。
   - 若成员本身是结构体：按 `Alt+Q` 选择已存在的结构体变量。
- 缺点：只能逐个字段手动添加。

**0x02 通过头文件创建**

1. 打开 `Local Types` 子视图：`View → Open Subviews → Local Types`（`Shift+F1`）→ `Insert`。
2. 输入结构体定义（如 `struct student { char name[16]; int age; };`）。
3. 按 `y` 修改变量的 Type 即可。

**0x03 导入标准结构体**

创建结构体时按 `I`，在弹出的库类型列表里直接选择 IDA 自带的标准结构体（如 `sockaddr`、`FILE` 等）。

> 逆向分析的本质：取名字 —— 还原结构体、函数名、全局变量类型、参数类型等。

### 6.2 数据 + 结构体重建

- 参考 6.1 创建结构体后，在 `IDA View` 中把数据修复为结构体成员（用 `t` 指定），才能在伪代码中显示子成员。
- 注意：若只做整体重命名（如 `v35 = off_171D4`），子成员不会展开；必须在 `IDA View` 中按结构体字段修复。

## 7. 常用插件

| 插件 | 用途 |
| :--- | :--- |
| [LazyIDA](https://github.com/L4ys/LazyIDA) | 快速转换、解码、批量操作等 |
| [VulFi](https://github.com/Accenture/VulFi) | 漏洞候选函数扫描 |
| [blc](https://github.com/cseagle/blc) | 把 Ghidra 的反编译器作为 IDA 插件集成 |
| [ida-pro-mcp](https://github.com/mrexodia/ida-pro-mcp) | 让 IDA 暴露 MCP 接口，供 AI 客户端调用 |

**ida-pro-mcp 安装要点**（脱敏）：

```text
pip install git+https://github.com/mrexodia/ida-pro-mcp
ida-pro-mcp --install      # 自动写入各客户端（Cline/Roo/Claude/Cursor）的 json 配置
```

> 原草稿里的代理与用户目录路径（`http://<代理IP>:<端口>`、`C:\Users\<用户名>\...`）已脱敏；实际安装请以你本机环境为准。

## 8. IDAPython 常用脚本

### 8.1 批量修正数据类型 / 宽度

```python
import idaapi

start_address = 0x000000041EABB84
end_address   = 0x000000041EAC0F0

address = start_address
while address <= end_address:
    idaapi.create_data(address, idaapi.FF_DWORD, 4, idaapi.BADADDR)
    address += 4
```

### 8.2 获取导入表与交叉引用

```python
# IDA 7.7 验证
import idaapi, idautils, idc, ida_segment

# 1) 遍历导入模块
nimps = idaapi.get_import_module_qty()
for i in range(nimps):
    print("Module:", idaapi.get_import_module_name(i))
    def cb(ea, name, ord):
        print(" ", hex(ea), name)
        return True
    idaapi.enum_import_names(i, cb)

# 2) 遍历指向某 PLT stub 的所有调用者
plt_ea = 0xA2B0
callers = []
for xref in idautils.XrefsTo(plt_ea):
    caller = xref.frm
    if idc.is_code(idc.get_full_flags(caller)):
        func_start = idc.get_func_attr(caller, idc.FUNCATTR_START)
        offset = caller - func_start if func_start != idc.BADADDR else 0
        callers.append(f"0x{func_start:X}+{offset:X}")
print(f"[0x{plt_ea:X}] callers:")
for c in callers:
    print(" ", c)

# 3) 按名过滤导入表 / external 符号
target_func = "Get_NAS_Group_List_Of_User_Ex"
for i in range(nimps):
    def cb2(ea, name, ordinal):
        if name == target_func or (name and target_func in name):
            print(f"[IAT/PLT] {name} at 0x{ea:08X}")
        return True
    idaapi.enum_import_names(i, cb2)

for ea, name in idautils.Names():
    if name == target_func or (name and target_func in name):
        seg = ida_segment.getseg(ea)
        seg_name = ida_segment.get_segm_name(seg) if seg else "UNKNOWN"
        print(f"[EXTERN] {name} at 0x{ea:08X} in segment {seg_name}")
```

> 重点理解：**PLT 存根函数的入口地址**与**指向 IAT 条目的指令地址**不一样。
> 例如 `.plt:0000A2B0` 是 `Get_NAS_Group_List_Of_User_Ex` 的入口，所有外部调用都引用它；
> 而包含 `LDR PC, [...]` 跳转到导入地址的指令在 `.plt:0000A2B8`。
> `XrefsTo(import_ea)` 报告的 `frm` 是使用该导入的**指令**地址（即 `0xA2B8`），
> 所以正确的 xref 应该用 `0x0000A2B0`（入口）去统计。

### 8.3 字符串识别

可借助栈字符串识别插件（如 bingghost 的 IDA 插件）或社区脚本批量将字节序列转为字符串；也可参考 CSDN/博客园的「IDA 转字符串技巧」。

## 9. IDA API 速查（IDAPython）

### 9.1 基本信息获取

| 功能 | API 示例 |
| :--- | :--- |
| 获取当前光标地址 | `idc.here()` / `idc.get_screen_ea()` |
| 获取函数名 | `idc.get_func_name(ea)` |
| 获取指令操作码（助记符） | `idc.print_insn_mnem(ea)` |
| 获取操作数原始数值 | `idc.get_operand_value(ea, n)` |
| 获取操作数字符串表示 | `idc.print_operand(ea, n)` |

```python
import idc
ea = idc.here()
mnem  = idc.print_insn_mnem(ea)
op0   = idc.print_operand(ea, 0)
op1_v = idc.get_operand_value(ea, 1)
print(f"{hex(ea)}: {mnem} {op0}, {hex(op1_v)}")
# 示例 0x41f52c: li $t8, 0x3e8
```

### 9.2 函数与段信息

| 功能 | API |
| :--- | :--- |
| 遍历所有函数 | `idautils.Functions()` |
| 遍历函数内所有指令 | `idautils.FuncItems(func_ea)` |
| 获取函数属性 | `idc.get_func_attr(ea, idc.FUNCATTR_FLAGS)` |
| 判断是否为库函数 | `flags & idc.FUNC_LIB != 0` |

常用属性：`FUNCATTR_START` / `FUNCATTR_END` / `FUNCATTR_FLAGS`，配合 `FUNC_LIB` 位运算。

### 9.3 交叉引用（Xrefs）

| 功能 | API |
| :--- | :--- |
| 某地址被谁引用 | `idautils.XrefsTo(ea)` |
| 某地址引用到哪 | `idautils.XrefsFrom(ea)` |

```python
import idautils, idc
for func_ea in idautils.Functions():
    name = idc.get_func_name(func_ea)
    print(f"Function: {name}")
    for ref in idautils.XrefsTo(func_ea):
        print(f"  Called from: {idc.get_func_name(ref.frm)}")
```

### 9.4 字符串与结构体

| 功能 | API |
| :--- | :--- |
| 枚举字符串 | `idautils.Strings()` |
| 获取结构体 ID | `idc.get_struc_id("my_struct")` |
| 读取结构体大小 | `idc.get_struc_size(id)` |
| 添加结构体成员 | `idc.add_struc_member(...)` |

### 9.5 设置 / 修改信息

| 功能 | API |
| :--- | :--- |
| 重命名地址 | `idc.set_name(ea, "new_name")` |
| 添加注释 | `idc.set_cmt(ea, "comment", 0)` |
| 设置数据类型 | `idc.create_struct(ea, size, "struct_name")` |
| 设置字符串 | `idc.create_strlit(ea, length)` |

### 9.6 导出 / 自动化

| 功能 | API |
| :--- | :--- |
| 导出伪代码（需 Hex-Rays） | `ida_hexrays.decompile(func_ea)` |
| 当前文件路径 | `ida_nalt.get_input_file_path()` |
| 根文件名 | `ida_nalt.get_root_filename()` |
| 执行外部脚本 | `exec(open("script.py").read())` |

## 10. 常见问题

### 10.1 `got SIGTRAP signal (Trace/breakpoint trap)`

断点陷阱只是表示处理器遇到了断点。可能原因：初始化代码被反复命中（CPU 复位）、或断点映射到的代码/执行路径不清晰（激进优化时尤甚）。
解决：换用 GDB 调试，或在 IDA 中调整断点位置。

### 10.2 F5 导出 / 反编译不准

见 5 节。结论：F5 代码需人工比对汇编；`Ctrl+F5` 导出易错；优先 `Shift+E` 导出原始数据后手工整理。

### 10.3 字符串在 Strings 窗口看不到，但 Alt+T 搜得到

常见原因：

- 段类型未正确识别为可读字符串区域（段属性未标记为可读/数据段）。
- 数据类型未定义（字符串未以 NUL 结尾，或加密/压缩数据）。
- IDA 自动分析范围未覆盖该段（部分被标记为未定义）。
- 自定义加密/编码，手动搜得到但 IDA 无法自动识别。

### 10.4 识别回连端口 / IP

看 `connect` 的参数；结合 `gethostbyname("...")` 找到域名，再在汇编里看端口。注意：被优化后端口可能以常量内联形式散落在指令中，需对照汇编还原 `ip:port`。

### 10.5 字符串找不到交叉引用

可能是反汇编引擎没把这段数据正确识别为代码/数据，IDA 因此没标记 xref；Ghidra 有时能补上。可尝试在 `IDA View` 中手动按 `A`/`C` 修复，或刷新分析。

### 10.6 `sp-analysis failed` / F5 失败

- `sp` 问题：函数栈指针分析失败，常见原因是代码混淆、手动 patch 或调用约定异常；可参考 CSDN 相关文章手动修正 `sp`。
- `too big function`：函数过大导致反编译器放弃。局部可用 `Edit → Plugins → Hex-Rays Decompiler → Options → Analysis Options 3`；全局改 `hexrays.cfg` 的 `MAX_FUNCSIZE`。
- `Cannot continue after an internal error`：本草稿未解决，可尝试重启 IDA 重建数据库。

### 10.7 符号表被删，IDA 为何还能识别导入函数名

即使 `.symtab` 被 strip，导入函数名通常仍保留在导入表（`.dynsym` / `.dynstr`）中：

```text
ELF：DT_NEEDED / DT_SYMTAB / DT_STRTAB 动态段保留 printf、memcpy 等；
     IDA 解析 .plt + .got，结合 .dynsym 还原导入函数。
PE ：IAT / INT 中保留 kernel32.dll!CreateFileA 等名称。
```

此外，IDA 的 **FLIRT**（Fast Library Identification and Recognition Technology）通过二进制特征识别库函数；并且 `BL printf` 这类调用会经 `.plt → .got → .dynsym+.dynstr` 反查到名字。

```text
BL 0x4005f0
   └─▶ .plt entry (printf@plt)
         └─▶ .rel.plt entry ─▶ .dynsym[idx] ─▶ name: "printf" (from .dynstr)
```

> 注意：**动态链接的 ELF 无法完全去除 `.dynsym/.dynstr`**，否则运行时找不到库函数。

### 10.8 `.rel.plt` 与 `.rela.plt` 的区别

| 类型 | 架构 | 特点 |
| :--- | :--- | :--- |
| `.rel.plt` | ARM、x86 | 不带显式 addend |
| `.rela.plt` | x86_64、AArch64 | 带 addend 字段 |

- `addend` 是参与地址重定位计算的常量。
- `.rel` 把 addend 写在目标内存位置（间接）；`.rela` 把 addend 显式写在重定位表里。

```text
一条 .rel.plt 表项示例：
Offset     Info    Type           Sym.Value  Sym.Name
0804a00c   00000707 R_ARM_JUMP_SLOT 00000000   printf
  Offset  → 指向 .got 中的某一项（函数指针位置）
  Info    → 编码符号索引 + 重定位类型（07 = JUMP_SLOT）
  Sym.Name→ .dynsym 中对应符号名
```

## 11. 逆向经验与调试思路

### 11.1 调试定位「出发点」

- 先确定数据读入位置，单步执行，及时观察触发结果（构造一个容易观察的触发，例如执行了某命令就会生成标记文件）。
- 因为有些 `system` 执行不打印输出，需要时刻盯着构造的命令是否产生了预期副作用。
- 多个程序关联触发时，必须先理清各自功能与触发关系。

### 11.2 代码还原思路

1. 确定被比较的值 `cmp_value` 如何生成：回溯追踪。
2. 分析它需要哪些参数、变量、常量，经过什么算法。
3. 若提取代码与动态调试结果不同：先确认逻辑，再重点检查「输入点数据」（影响结果的是变量），可用二分法排查。

### 11.3 实战经验条目（节选）

```text
1) IDA 7.7 识别错误坑：
   value = (int)&v1[v5 + v199[0] + 123]
   实际应为 value = v1 + v5 + v199[0] + 123
   （不是 (v5+v199[0]+123)*4 + &v1）

2) F5 两数相加的 bug：红色为错、绿色为对，最终以汇编为准。

4) 代码还原：ida 调试输出数据 → 编译提取代码调试对比数据；
   逻辑是前提，变量是结果的关键。

6) 修复字符串：统一修复只能靠 API；原因之一可能是 IDA 架构/位数选错。

7) Hex View 导出大量数据：选中开始地址，ALT+L 锁定光标，
   G 跳到目的地址，右键保存；或 API：
     data = ida_bytes.get_bytes(start, end-start)
     open("dumped.bin","wb").write(data)

8) Strings 窗口看不到 .data 字符：段类型/数据类型/分析范围/自加密。

11) 指针识别：*(_DWORD*)(unsigned int)(0x12345678) 与
    *(unsigned int*)0x12345678 结果相同，都是解引用该地址。

12) 识别回连端口：看 connect 参数，结合 gethostbyname；ip:port 在汇编里。

14) 抽取代码还原：F5 代码多为 Windows 标准 API/调用约定，
    移植到 Linux 需改调用约定（__fastcall→GCC 属性）、
    类型（_BYTE=char, BOOL=bool）、宏（LOBYTE 自行实现）。

15) 修正函数声明：快捷键 y。

17) 判断 F5 伪代码变量类型的“宽度”可看汇编，但有无符号不能准确判断，
    需结合有符号指令或动态调试看符号标志位。

18) 符号表删除后 IDA 仍能识别导入函数：见 10.7。

21) 寻找相同偏移猜测引用变量：不同代码块中数据输入/输出点，
    观察相同规律后搜索偏移（如搜字节序列 8c 00 00 00）。

24) 结构体字段全局引用显示不全：F5 进一个函数才多显示一行，
    用 Ctrl+Alt+X 弹出全局交叉引用列表，首次可能为空，
    右键或 Ctrl+U 刷新（会反编译全部函数并缓存）。

27) 数据 + 结构体重建：必须先在 IDA View 修复成员，才能展开子成员。

29) 字符串找不到引用/实际已引用：可试改基址显示字符串，
    但仍可能看不到 xref；原因多为反汇编引擎未识别为代码。

31) 源码编译程序制作 FLIRT/Rizzo 符号：
    FLIRT 只适合静态编译的 .lib/.o（pelf → sigmake）；
    IoT 固件用 IDB2PAT（flare-ida）从 .idb 生成 .pat；
    另有 Rizzo、Karta（开源代码搜索）等。

32) 字符串 grep 不到但 F5 能看到：编译器优化把字符串内联进指令，
    按 R 键可将立即数转字符显示。
```

## 12. C++ 与虚表（vtable）

**non-virtual thunk / virtual thunk** 是编译器自动生成的小函数（几行汇编），用于调整 `this` 指针后再调用真正的目标函数，常见于多重继承 / 虚继承。

```text
unsigned int __cdecl `non-virtual thunk to'IftTlsTransport::onIftTlsIpcMessage(
        IftTlsTransport *this, char *a2,
        const IftTlsHeader *IFT_hdr, __guard *a4)
{
  return IftTlsTransport::onIftTlsIpcMessage(
        (IftTlsTransport *)((char *)this - 56), a2, IFT_hdr, a4);
}
```

- `non-virtual thunk`：用于非虚函数 / 虚表中非动态分发的函数。
- `virtual thunk`：用于虚函数调用（出现在虚表中）。

多重继承下，每个基类子对象起始地址不同，调用前需调整 `this` 指向正确子对象。在 IDA 中从 thunk 的 xref 往上追，可找到调用方或主类的虚表。

> 识别 C++ 符号：虚表（`_ZTV15IftTlsTransport`）在 `.data.rel.ro` 段，结合 `_ZThn48_...`、`offset to this`（负值，如 `-48`/`-56`）可还原继承偏移。

## 13. Python 环境适配

- `idapyswitch.exe` 负责切换 IDA 使用的 Python 版本。
- 主机有多个 Python 时，用对应版本的 `python.exe -m pip` 安装包，避免版本冲突：

```text
# 用哪个 Python 运行安装脚本，pip 就关联到哪个版本
D:\<IDA安装目录>\python311> python.exe get-pip.py
D:\<IDA安装目录>\python311> ./python.exe -m pip install --upgrade pip
```

## 14. 配置与参考

- 配置文件目录：`%IDADIR%\cfg`；用户级扩展可通过 `IDAUSR` 环境变量指定。
- IDA 官方博客（Igor Tip of the Week 系列）：<https://hex-rays.com/blog>
- IDA Pro 技巧参考：<https://firmianay.gitbook.io/ida-pro-tips>
- ELF 文件结构：<https://chuquan.me/2018/05/21/elf-introduce/>
- C++ 虚函数表逆向：<https://rioasmara.com/2020/08/23/ida-pro-c-vtable/>、<https://mez.one/2021/03/09/2021-03-09-CPP-virtual/>
- angr + IDA 联合分析（Sink 地址映射、静态调用链、动态污点验证）可作为进阶工作流。
