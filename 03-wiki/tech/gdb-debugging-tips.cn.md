---
title: GDB 调试技巧速查
lang: cn
description: 汇总 GDB 的启动、断点、观察点、线程、内存、信号和远程调试常用技巧。
created: 2026-08-24
modified: 2026-09-24
tags:
  - debugging
  - gdb
  - reverse-engineering
  - tooling
---

> 内容基于公开 GDB 技巧整理（参考 100-gdb-tips、evilpan 等），难免有误，请带着辩证视角阅读；本文仅用于授权环境下的程序调试、逆向分析与防护加固。
>
> 约定：`(gdb)` 为 GDB 提示符；`i` 是 `info` 的缩写，`p` 是 `print`、`b` 是 `break`、`n` 是 `next`、`s` 是 `step`、`c` 是 `continue` 的缩写；示例中的 `/path/to/test` 为示意路径，请替换为你的实际路径。

# GDB 调试技巧速查

## 1. 启动与显示设置

### 1.1 启动时不显示版权提示

```bash
gdb -q ./a.out
# 或在 ~/.bashrc 加 alias gdb="gdb -q"
```

### 1.2 退出时不提示确认

```text
(gdb) set confirm off
# 也可写入 .gdbinit
```

### 1.3 输出信息多时不暂停（关闭分页）

GDB 输出较长时会提示 `--Type <return> to continue--`。关闭：

```text
(gdb) set pagination off
# 或
(gdb) set height 0
```

若是 `--pager` 强制分页导致失效，可在 `.gdbinit` 加 `set startup-with-shell off`。信号类噪音可加 `handle SIGPIPE nostop noprint nopass`。

## 2. 函数与栈帧

### 2.1 列出函数名（支持正则）

```text
(gdb) info functions
(gdb) info functions thre*     # 列出名字匹配的函数
```

### 2.2 step / next

- `s`（step）：进入**有调试信息**的函数。
- `n`（next）：单步但不进入函数。

### 2.3 进入不带调试信息的函数

默认情况下 `s` 会跳过无调试信息的函数。强制进入：

```text
(gdb) set step-mode on
(gdb) s
```

### 2.4 退出正在调试的函数：finish / return

```text
(gdb) finish              # 执行完当前函数并打印返回值后停下
(gdb) return 40           # 直接返回，且把返回值设为 40（不执行剩余语句）
```

### 2.5 直接执行函数：call / print

```text
(gdb) call func()
(gdb) print func()        # 二者都会真正执行函数，结果存入 $1/$2
```

### 2.6 打印栈帧 / 寄存器 / 反汇编

```text
(gdb) i frame             # 当前栈帧：返回地址、参数地址、局部变量地址
(gdb) i registers         # 通用寄存器
(gdb) disassemble func    # 反汇编函数
```

### 2.7 选择 / 切换栈帧

```text
(gdb) frame 2             # 切到第 2 层栈帧（0 为最内层）
(gdb) up 1                # 向外（调用者）移动 1 层
(gdb) down 2              # 向内（被调用者）移动 2 层
(gdb) up-silently / down-silently   # 切换但不打印
(gdb) bt                  # 查看调用栈（#0 为最内层）
```

## 3. 断点 Breakpoint

### 3.1 匿名命名空间函数

```text
(gdb) b Foo::foo
(gdb) b (anonymous namespace)::bar
```

### 3.2 地址上下断点

```text
(gdb) b *0x12345678
```

### 3.3 无调试信息时：在程序入口断下（注意 PIE 基址）

对剥离符号的程序，`start` 会失败，可在入口断下。`readelf -h` 或 `info files` 给出的 `Entry point address` 需**加上运行时基址**：

```text
(gdb) info files
# Entry point: 0x1050  （文件内偏移）
(gdb) info proc mappings
# 0x555555554000 ... /path/to/test   ← 基址
(gdb) b *0x555555555050             # 基址 + 0x1050
```

> PIE（Position-Independent Executable）每次加载基址不同；关 ASLR 后仍要以实际映射基址为准。

### 3.4 文件行号

```text
(gdb) b 10
(gdb) b test.c:10
(gdb) b a/test.c:10        # 用路径区分同名文件
```

> 按行号断点的弊端：改源码后旧断点可能错位。

### 3.5 保存 / 批量加载断点

```text
(gdb) save breakpoints bp.txt
(gdb) source bp.txt
```

### 3.6 临时断点（命中一次即删）

```text
(gdb) tbreak 15
(gdb) tb test.c:15
```

### 3.7 条件断点

```text
(gdb) b 10 if i == 101    # 只有 i==101 才断下
```

### 3.8 忽略前 N 次

```text
(gdb) ignore 1 5          # 忽略断点 1 的前 5 次，第 6 次才停
(gdb) ignore 1 0          # 恢复：下次即生效
```

### 3.9 捕捉「最后一次」触发

不确定断点会触发几次、想停在最后一次时，用状态变量记录：

```text
(gdb) set $last = 0
(gdb) b *0xaddr
(gdb) commands
> silent
> set $last = $pc
> continue
> end
```

## 4. 观察点 Watchpoint（读写断点）

> 观察点有软件与硬件两种实现；硬件观察点（标记为 `Hardware watchpoint`）更快。想强制软件实现：`set can-use-hw-watchpoints 0`。

### 4.1 watch（写时断下）

```text
(gdb) watch a
(gdb) watch *(int *)0x555555558024     # 用地址也行
```

### 4.2 观察点只对特定线程生效

```text
(gdb) watch a thread 2    # 仅线程 2 修改 a 时才断（仅硬件观察点支持）
```

### 4.3 rwatch（读时断下，仅硬件）

```text
(gdb) rwatch a
(gdb) rw *(int *)0x55555555802c
```

### 4.4 awatch（读写都断，仅硬件）

```text
(gdb) awatch a
```

## 5. 捕获点 Catchpoint

捕获 fork / exec / 系统调用等事件，而非普通代码行。

### 5.1 只触发一次：tcatch

```text
(gdb) tcatch fork         # 只在第一次 fork 时停下
```

### 5.2 catch fork / vfork

```text
(gdb) catch fork
(gdb) catch vfork
# 注意：目前主要 HP-UX 与 GNU/Linux 支持
```

### 5.3 catch exec

```text
(gdb) catch exec
```

### 5.4 catch syscall（按名或编号）

```text
(gdb) catch syscall mmap
(gdb) catch syscall 9          # 等效
(gdb) catch syscall             # 所有系统调用
# 系统调用号映射见 /usr/share/gdb/syscalls/<arch>-linux.xml
```

### 5.5 破解 ptrace 反调试

部分程序用 `ptrace(PTRACE_TRACEME, ...)` 检测调试器，失败即退出。通过捕获 `ptrace` 系统调用并改返回值绕过：

```text
(gdb) catch syscall ptrace
(gdb) r
Catchpoint 1 (call to syscall ptrace) ...
(gdb) c
Catchpoint 1 (returned from syscall ptrace) ...
(gdb) set $rax = 0             # 伪造返回值=成功
(gdb) c
No debugger, continuing
```

> 仅用于授权/自己编写的样本做反反调试研究。

## 6. 打印 Print

### 6.1 打印 ASCII / 宽字符字符串

```text
(gdb) x/s str1           # ASCII 字符串
(gdb) x/ws str2          # 4 字节宽字符（wchar_t）；2 字节用 x/hs
```

### 6.2 大数组：取消元素数量限制

```text
(gdb) set print elements 0          # 或 unlimited，默认最多 200 个
```

### 6.3 打印任意连续元素

```text
(gdb) p array[60]@10     # 从第 60 个起，连续 10 个
(gdb) p *array@10        # 从开头起 10 个
```

### 6.4 显示数组索引

```text
(gdb) set print array-indexes on
(gdb) p num
$2 = {[0] = 1, [1] = 2, ...}
```

### 6.5 结构体每行一个成员

```text
(gdb) set print pretty on
(gdb) p st
```

### 6.6 函数局部变量

```text
(gdb) bt full            # 所有栈帧的局部变量
(gdb) bt full 2          # 从内向外 2 层
(gdb) bt full -2         # 从外向内 2 层
(gdb) info locals        # 仅当前函数局部变量
```

### 6.7 进程内存信息

```text
(gdb) i proc mappings    # 内存映射（基址、段权限、objfile）
(gdb) i files            # 更详细，含动态库节区
(gdb) i target           # 同上
```

### 6.8 静态变量（同名冲突）

```text
(gdb) p var              # 可能拿到错误的那个
(gdb) p 'static-1.c'::var   # 用文件名限定
(gdb) p 'static-2.c'::var
```

### 6.9 类型与定义位置

```text
(gdb) whatis he          # 类型名
(gdb) ptype he           # 详细类型结构
(gdb) i variables he     # 所在文件
(gdb) i variables ^he$   # 完全匹配
```

### 6.10 打印内存：x/nfu

格式 `x/nfu addr`：`n`=单元个数，`f`=格式（x 十六进制 / o 八进制 / s 字符串 / i 指令 …），`u`=单元长度（b 字节 / h 半字 / w 字 / g 八字）。

```text
(gdb) x/16xb a           # 16 个字节，十六进制
(gdb) x/4i $pc           # 4 条指令
```

### 6.11 打印源代码

```text
(gdb) list              # 或 l
(gdb) l 24
(gdb) l main
(gdb) l -               # 向前
(gdb) l +               # 向后
(gdb) l 1,10            # 范围
```

### 6.12 便捷变量 `$_` 与 `$__`

`x` 命令把**最后检查的内存地址**存入 `$_`，把该地址内容存入 `$__`：

```text
(gdb) x/16xb a
(gdb) p $_
$1 = (int8_t *) 0x7fffffffe2df
(gdb) p $__
$2 = 15
```

### 6.13 打印动态分配内存信息（mallocinfo）

在脚本里定义（`-x script` 加载）：

```text
define mallocinfo
  set $__f = fopen("/dev/tty", "w")
  call malloc_info(0, $__f)
  call fclose($__f)
end
```

### 6.14 不切换栈帧打印变量

```text
(gdb) p func2::b         # 直接打印 func2 帧里的 b
(gdb) p '(anonymous namespace)::SSAA::handleStore'::n->pi->inst->dump()
```

## 7. 多进程与多线程

### 7.1 调试已运行进程

```bash
gdb -p <pid>
# 或
gdb attach <pid>
```

嫌 `ps` 麻烦可用脚本 `xgdb.sh`：

```bash
#!/bin/bash
prog_bin=$1
running_name=$(basename "$prog_bin")
pid=$(/sbin/pidof "$running_name")
gdb attach "$pid"
```

### 7.2 调试子进程：follow-fork-mode

```text
(gdb) set follow-fork-mode child     # 默认追踪父进程
(gdb) set follow-fork-mode parent
```

### 7.3 同时调试父子进程

```text
(gdb) set detach-on-fork off         # 子进程不脱离 GDB（挂起）
(gdb) set schedule-multiple on       # 父子可同时运行
(gdb) i inferiors                    # 查看被调试的进程
(gdb) inferior 2                     # 切换到进程 2
```

### 7.4 查看 / 切换线程

```text
(gdb) i threads                     # 列出所有线程（* 为当前线程）
(gdb) thread 2                      # 切到线程 2
(gdb) thread apply all bt           # 所有线程的调用栈
(gdb) thread apply 1-2 bt          # 指定线程范围
```

### 7.5 关闭线程启动/退出噪音

```text
(gdb) set print thread-events off
```

### 7.6 单步时锁定调度（scheduler-locking）

默认 `off`：调试一个线程时其它线程也在跑。`on` 则只跑当前线程；`step` 模式仅 `step` 时锁定。

```text
(gdb) set scheduler-locking on
(gdb) set scheduler-locking step
(gdb) set scheduler-locking off
```

> 实测并非所有场景都生效，依赖具体 OS 调度策略（GDB 手册 All-Stop Mode）。

### 7.7 在断点命令里取线程号：$_thread

```text
(gdb) wa a
(gdb) command 1
> printf "thread id=%d\n", $_thread
> end
```

### 7.8 一个会话调试多个程序

```text
(gdb) add-inferior -copies 2 -exec b     # 加载可执行文件 b
(gdb) i inferiors
(gdb) inferior 2                         # 切换到 inferior 2
(gdb) clone-inferior -copies 1           # 克隆当前 inferior
```

### 7.9 查看所有 program-spaces

```text
(gdb) maint info program-spaces
```

### 7.10 程序退出码：$_exitcode

```text
(gdb) p $_exitcode
```

## 8. Core Dump

### 8.1 运行中生成 core

```text
(gdb) generate-core-file          # 或 gcore
Saved corefile core.<pid>
```

### 8.2 加载 core 分析

```bash
gdb ./test ./core.1139029        # 方式一
# 方式二（GDB 启动后）
(gdb) file ./test
(gdb) core ./core.1139029
```

### 8.3 开启系统 core dump

```bash
ulimit -c unlimited                          # 当前终端
echo 1 > /proc/sys/kernel/core_uses_pid      # 文件名带 pid
echo /tmp/core-%e-%p-%t > /proc/sys/kernel/core_pattern
# 永久：/etc/security/limits.conf 加 * soft core unlimited
# 非 root 进程还需：sysctl -w fs.suid_dumpable=1
```

## 9. 汇编

### 9.1 设置反汇编格式

```text
(gdb) set disassembly-flavor intel    # 默认 AT&T；仅 x86，取值 intel/att
(gdb) disassemble main
```

### 9.2 函数第一条指令断下：`b *func`

```text
(gdb) b main        # 停在 C 语句层（函数体第一条语句）
(gdb) b *main       # 停在汇编层第一条指令（push rbp）
```

### 9.3 自动反汇编将执行的指令

```text
(gdb) set disassemble-next-line on     # 反汇编接下来要执行的代码
(gdb) set disassemble-next-line auto   # 无源码时才反汇编
(gdb) set disassemble-next-line off
```

### 9.4 源码与汇编映射

```text
(gdb) disas /m main        # 每条 C 语句下面对应汇编
(gdb) i line 13            # 某行对应的地址范围
(gdb) disassemble 0x115d,0x1182
```

### 9.5 显示将执行的指令

```text
(gdb) display /i $pc           # 当前要执行的指令
(gdb) display /3i $pc         # 一次显示 3 条
(gdb) undisplay
```

### 9.6 打印寄存器

```text
(gdb) i registers             # 通用寄存器
(gdb) i all-registers         # 含浮点 / 向量
(gdb) i registers eax
(gdb) p $eax
```

### 9.7 显示原始机器码

```text
(gdb) disassemble /r main
(gdb) disassemble /r 0x113d,+4
```

## 10. 改变程序执行

### 10.1 改字符串值

```text
(gdb) set main::p1 = "Jil"
(gdb) set main::p2 = "Bill"
(gdb) set {char [4]}0x7fffffffe334 = "ACE"   # 通过地址改（注意越界）
```

### 10.2 改变量 / 地址 / 寄存器

```text
(gdb) set var i = 8
(gdb) set {int}0x7fffffffe31c = 8
(gdb) set var $eax = 8          # 改返回值寄存器
```

### 10.3 改 PC 改变流程

```text
(gdb) info line 6
(gdb) p $pc
(gdb) set var $pc = 0x...14c    # 跳过某条语句
```

### 10.4 跳转到指定位置：jump

```text
(gdb) b 15
(gdb) j 15                      # 跳到 15 行（仅改 PC）
```

> `jump` 只改 PC，变量状态不会自动同步；通常配合（临时）断点使用，否则跳过去后不会停。

### 10.5 用断点命令改执行

```text
(gdb) b drawing
(gdb) command 1
> silent
> set variable n = 0
> continue
> end
```

适合「不想重编译、先在 GDB 里试改」的场景（如调试编译器 bug）。

### 10.6 改写二进制（-write patch）

```text
gdb -write ./a.out        # 以可写方式加载
(gdb) set write on
(gdb) file ./a.out        # 重新加载
# 之后可用 set {unsigned char}0xADDR = 0xEB 等把 je 改成 jmp
```

> 改的是磁盘文件，操作前务必备份。

## 11. 信号

### 11.1 查看信号处理设置

```text
(gdb) i signals
# Stop：是否暂停；Print：是否打印；Pass：是否发给程序
```

### 11.2 发给程序一个信号

```text
(gdb) signal SIGHUP        # 程序停下后，继续并发送信号给它
(gdb) signal 0             # 继续但不发送任何信号
```

> `signal` 直接把信号发给进程；`kill`（shell）则受 GDB 当前设置约束，两者行为不同。

### 11.3 信号发生时是否暂停：handle stop / nostop

```text
(gdb) handle SIGHUP nostop
```

### 11.4 是否打印：handle print / noprint

```text
(gdb) handle SIGHUP noprint    # 设 noprint 会同时设 nostop
```

### 11.5 是否交给程序：handle pass / nopass

```text
(gdb) handle SIGHUP nopass     # GDB 不把信号交给程序
```

### 11.6 读取信号信息：$_siginfo

```text
(gdb) ptype $_siginfo
(gdb) p $_siginfo._sifields._sigfault.si_addr
```

## 12. 共享库

### 12.1 显示已加载的共享库

```text
(gdb) info sharedlibrary          # 或 i sharedlibrary
(gdb) i sharedlibrary hiredi*     # 正则过滤；带 * 表示缺调试信息
```

## 13. 脚本与配置

### 13.1 .gdbinit 常用配置

```text
# 打印 STL（需 libstdc++ pretty-printer 路径）
python
import sys
sys.path.insert(0, "/path/to/libstdc++-v3/python")
from libstdcxx.v6.printers import register_libstdcxx_printers
register_libstdcxx_printers(None)
end

set history filename ~/.gdb_history
set history save on
set confirm off
set print object on
set print array-indexes on
set print pretty on
```

### 13.2 脚本解析方式：script-extension

```text
(gdb) set script-extension off    # 全部按 GDB 命令解析
(gdb) set script-extension soft   # 按扩展名（默认）：py 用 python 解析
(gdb) set script-extension strict # 不支持的语言直接不解析
```

### 13.3 历史命令

```text
(gdb) set history save on
(gdb) set history filename fname
```

### 13.4 -x 加载脚本

```bash
gdb -x script.gdb ./a.out
(gdb) source script.gdb
```

## 14. 源文件

### 14.1 设置源码查找路径

```text
(gdb) directory ../ki/     # 或 dir
(gdb) gdb -q a.out -d /search/code/some
```

### 14.2 替换源码目录

```text
(gdb) set substitute-path /home/nan /home/ki
```

## 15. TUI 图形界面

### 15.1 进入 / 退出

```bash
gdb -tui ./a.out
# 运行中：Ctrl+X A 切换
```

### 15.2 汇编 / 分屏窗口

```text
layout asm       # 汇编窗口
layout split     # 源码 + 汇编
layout src       # 源码
layout next / prev
Ctrl+L 刷新；Ctrl+X 1 / 2 单/双窗口；Ctrl+X A 退出
```

### 15.3 寄存器窗口

```text
layout regs
tui reg float        # 浮点寄存器
tui reg system       # 系统寄存器
tui reg general      # 回到通用寄存器
```

### 15.4 调整窗口大小

```text
winheight src -5     # 或 win src -5
winheight src +5
```

## 16. 其他实用技巧

### 16.1 宏支持

```bash
gcc -g3 -o test test.c     # -g 不含宏，-g3 才含
```
```text
(gdb) p NAME
(gdb) macro expand Len(a)
(gdb) info macro PARRS
```

### 16.2 保留未使用类型

```bash
gcc -g -fno-eliminate-unused-debug-types -o test test.c
(gdb) p sizeof(union Type)
```

### 16.3 在 GDB 里跑 shell / make

```text
(gdb) shell ls        # 或 !ls
(gdb) make CFLAGS="-g -O0"
```

### 16.4 设置被调试程序的环境变量

```text
(gdb) set env LD_PRELOAD=/lib/x86_64-linux-gnu/libpthread.so.0
(gdb) show env
```

### 16.5 记录调试过程（logging）

```text
(gdb) set logging file log.txt
(gdb) set logging enabled on      # 旧写法 set logging on
... 操作 ...
(gdb) set logging enabled off
# set logging overwrite on 覆盖；set logging redirect on 不回显终端
```

### 16.6 内存中搜索：find

```text
(gdb) find 0x7f3272a1030d,0x7f3272a10a0d,0x796e6161786e6161
# find 起始,结束,要找的内存值
```

### 16.7 bt 中地址的含义

`bt` 显示的地址（如 `#1 0x... in je_calloc`）是被调用者**返回后**的地址（即调用点）。

## 17. 进阶

### 17.1 反向调试

```text
(gdb) record                       # 记录执行状态
(gdb) set exec-direction reverse   # 之后 next/step/continue 都反向
(gdb) record goto start
(gdb) record save file.rec         # 保存历史
(gdb) record restore file.rec
```

### 17.2 hook 危险函数（安全研究用）

对 `system/execve/strcpy/...` 下断点，自动打印参数（GDB Python 脚本，支持 x86_64/arm/mips/i386）：

```python
import gdb

DANGEROUS = {
    "system": ["char *"],
    "execve": ["char *", "char **", "char **"],
    "strcpy": ["char *", "char *"],
    "popen":  ["char *", "char *"],
}

def read_string(addr):
    try:
        return gdb.parse_and_eval(f'(char*)({addr})').string()
    except Exception:
        return "<invalid>"

class Hook(gdb.Breakpoint):
    def __init__(self, name, argc):
        super().__init__(name, gdb.BP_BREAKPOINT)
        self.name, self.argc, self.silent = name, argc, True
    def stop(self):
        for i in range(self.argc):
            try:
                v = gdb.parse_and_eval(f'${["rdi","rsi","rdx","rcx","r8","r9"][i]}')
                print(f"  Arg{i}: {v} -> \"{read_string(v)}\"")
            except Exception:
                pass
        return False

for fn, args in DANGEROUS.items():
    Hook(fn, len(args))
# (gdb) source hook_danger.py
```

### 17.3 把运行中进程移入终端

```bash
reptyr <PID>                              # 直接接管
tmux new -d -s s gdb ./init -x dbg3       # 后台开 tmux 会话运行 gdb
tmux attach -t s                          # 接管
screen -dmS s gdb ./init -x dbg3          # 或用 screen
screen -r s
# 自动化防重复：先 if ! tmux has-session -t s 再创建
```

### 17.4 远程调试前置：先 file 再 target remote

`target remote` 只提供内存与寄存器；`file binary` 提供符号、函数名、行号。不先 `file`，GDB 无法正确设断点（地址对不上）。

```text
(gdb) file ./usr/sbin/lighttpd
(gdb) target remote 192.168.50.1:1234
(gdb) info symbol 0x402816f0
(gdb) info files
(gdb) set environment LD_BIND_NOW=1     # 启动即绑定所有动态库地址
```

## 参考

- GDB 官方手册：<https://sourceware.org/gdb/onlinedocs/gdb/>
- 100-gdb-tips（中文）：<https://github.com/wonderfullook/100-gdb-tips>
- evilpan《GDB 的那些奇淫技巧》：<https://evilpan.com/2020/09/13/gdb-tips/>
