---
title: IDAPython 开发环境搭建
lang: cn
description: 搭建 IDAPython 的 PyCharm 远程调试与交互式分析环境，并整理常用脚本骨架。
created: 2026-08-24
modified: 2026-09-24
tags:
  - ida
  - idapython
  - reverse-engineering
  - tooling
---

> 整理自个人 IDAPython 环境搭建笔记（参考 Hex-Rays 官方文档、SomersetRecon、看雪社区等）。本文仅用于授权环境下的脚本开发与逆向研究；文中的 `<IDA安装目录>`、`<用户名>` 等为脱敏占位符，请替换为你本机实际路径。原草稿中的 Yuque 截图因含第三方账号信息已全部省略。

# IDAPython 开发环境搭建

## 1. 两种调试方案对比

| 特点 | PyDevD 远程调试（原理一） | ipyida Kernel（原理二） |
| :--- | :--- | :--- |
| 用途 | 断点调试复杂的 `.py` 脚本文件 | 交互式分析与实时 API 调用 |
| 连接文件 | 无需；依赖 IP 和 Port | 依赖 `.json` 连接文件 |
| 启动方式 | 脚本中调用 `settrace()`，**主动**连接 | IDA 调用 `start_kernel()`，**被动**等待连接 |
| 适用场景 | 编写插件或复杂分析脚本 | 临时测试 API、反汇编时即时执行操作 |

官方 API 指导：<https://docs.hex-rays.com/developer-guide/idapython/idapython-examples>

## 2. PyDevD 远程调试（原理一）

环境示例：PyCharm 2023.3.7 (Professional)、IDA 8.3、pydevd-pycharm。

原理：

```text
PyCharm  → server 端（调试服务器）
pydevd   → 调试桥梁
IDA      → client 端
```

补充：

1. PyCharm 解释器最好用 venv 隔离安装依赖。
2. 可能需要手动安装依赖：`python.exe -m pip install pydevd-pycharm`。
3. 检查解释器路径：`python` 中 `print(sys.executable)`。

### 2.1 配置 PyCharm Debug Server

新建 `Python Debug Server` 配置（填 IP/端口，如 `localhost:50000`），直接启动即可作为 server 监听 IDA 连接，无需加载任何文件。

### 2.2 IDA 侧加载连接脚本

在 IDA 中（`Alt+F7`）加载下面的 `ida_connect_wrapper.py`，它会请求 PyCharm server；加载完成会断在第 20 行的 `print` 处，之后可正常 `F8` 单步。

```python
# ida_connect_wrapper.py
import sys

# 将 pydevd 库路径加入 IDA 的 Python 搜索路径
# 替换为你的 venv site-packages 路径
sys.path.append(r"<IDA安装目录>\IDAPycharm\venv\Lib\site-packages")

import pydevd_pycharm
import time

# 替换为你设置的 IP 和 Port
# suspend=True 会让 IDA 连接成功后立即暂停，等待你在 PyCharm 中下断点
pydevd_pycharm.settrace('localhost', port=50000, suspend=True)

print("[*] PyCharm connection established. Running main script...")

# 导入并运行你的主逻辑脚本
import main   # 把你真正要调试的代码放在 main.py

# 关键清理：结束前尽量断开，避免递归错误
try:
    if hasattr(pydevd_pycharm, 'stoptrace'):
        pydevd_pycharm.stoptrace()
    time.sleep(0.5)
    if hasattr(pydevd_pycharm, 'disable_tracing'):
        pydevd_pycharm.disable_tracing()
except Exception as e:
    print(f"[*] Warning: Cleanup failed: {e}")

print("[*] Script finished.")
```

说明：真正要调试的代码写在 `main.py`，由 `ida_connect_wrapper.py` 里的 `import main` 拉起执行。也可合并为单文件，但拆分后职责更清晰。

### 2.3 被调试的 main.py 示例（导出导入表）

```python
import idaapi
import idautils
import ida_segment

print("[*] Listing all imported functions (IAT / PLT / external)...\n")

nimps = idaapi.get_import_module_qty()
for i in range(nimps):
    module_name = idaapi.get_import_module_name(i)
    print(f"Module: {module_name}")
    def cb(ea, name, ordinal):
        if not name:
            name = f"<ordinal_{ordinal}>"
        print(f"[IAT/PLT] 0x{ea:08X} {name}")
        return True
    idaapi.enum_import_names(i, cb)

print("\n[*] Listing all external symbols (includes .plt, .got, etc.)\n")
for ea, name in idautils.Names():
    seg = ida_segment.getseg(ea)
    seg_name = ida_segment.get_segm_name(seg) if seg else "UNKNOWN"
    print(f"[EXTERN] 0x{ea:08X} {name} in segment {seg_name}")
```

输出会打印在 IDA 窗口中。

### 2.4 缺陷（不影响正常调试）

1. 每次调试完建议重启 IDA 再加载 binary，否则可能出现：

   ```text
   AttributeError: 'NoneType' object has no attribute 'set_trace_for_frame_and_parents'
   ```

   原因是上一次调试会话结束后，IDA 进程内 pydevd 客户端的全局状态未完全清除。**完全重启 IDA 是最推荐的解决方式。**

2. 「找不到源码」提示：在 Remote Debug 配置里设置 Path Mapping，或下载远程源码即可继续调试（功能不受影响）。

## 3. ipyida + PyDevD（可运行但断点难命中）

原理：走 IDA 的 ipyida kernel 做交互。参考 <https://github.com/overfl0/IDAPython-pycharm-setup>。

把下面脚本设为 PyCharm 运行/调试配置的 **interpreter options**，这样你执行的文件都会经由 ipyida 的 jupyter kernel 在 IDA 内运行：

```python
# pycharm_wrapper.py
import argparse
import textwrap
import jupyter_client
from jupyter_client.manager import KernelManager

parser = argparse.ArgumentParser(description='Execute a file inside a running ipython kernel')
parser.add_argument('path', type=str, help='path to the file being executed')
parser.add_argument('rest', nargs=argparse.REMAINDER)
args = parser.parse_args()

def escape_string(txt):
    return txt.replace('\\', '\\\\').replace('"', '\\"')

command = f'%run -G -e "{escape_string(args.path)}" ' + ' '.join(args.rest)
print(f"Connecting to ipython's kernel and executing {command}...")

connection_file = jupyter_client.connect.find_connection_file()
manager = KernelManager(connection_file=connection_file)
manager.load_connection_file()
client = manager.client()
client.execute_interactive(f'%reset -f --aggressive', store_history=False)

# 若调用的是 PyCharm 的 pydevd，移除 debugpy 自带的 pydevd 避免冲突
if 'helpers/pydev/pydevd.py' in args.path:
    remove_debugpy_pydevd = textwrap.dedent("""\
        import sys, os
        __blacklisted_path = f'{os.sep}debugpy{os.sep}_vendored{os.sep}'
        for name in sys.modules.copy():
            if 'pydev' in name and __blacklisted_path in getattr(sys.modules[name], '__file__', ''):
                del sys.modules[name]
        """)
    client.execute_interactive(remove_debugpy_pydevd, store_history=True, allow_stdin=True)

client.execute_interactive(command, store_history=True, allow_stdin=True)
```

配置方式：

- Interpreter options：`pycharm_wrapper.py`
- Script：你的 IDA Python 代码（如 `main.py`）
- 解释器可用 IDA 自带或本机 Python，只要都装了 ipyida 环境。

## 4. IDA 脚本示例

### 4.1 统一导出 IAT 导入函数

```python
import idaapi, idautils, idc, ida_segment, json

def get_integrated_imports():
    print("[*] Starting unified import analysis...")
    import_map = {}

    # 1) 通过 IAT/Import Directory 枚举所有导入
    nimps = idaapi.get_import_module_qty()
    if nimps == 0:
        print("[!] No import modules found via standard IDA API.")
    for i in range(nimps):
        module_name = idaapi.get_import_module_name(i)
        def cb(ea, name, ordinal):
            resolved_name = idc.get_name(ea)
            final_name = resolved_name or name or f"<ordinal_{ordinal}>"
            if ea != idc.BADADDR:
                if ea not in import_map:
                    import_map[ea] = final_name
                elif len(final_name) > len(import_map[ea]) and 'ordinal' not in final_name:
                    import_map[ea] = final_name
            return True
        idaapi.enum_import_names(i, cb)

    # 2) 兜底：扫描 external 段（静态链接 / 非常规 ELF 的稀疏 IAT）
    for ea, name in idautils.Names():
        seg = ida_segment.getseg(ea)
        if seg and seg.type == ida_segment.SEG_XTRN and ea not in import_map:
            import_map[ea] = name

    print(f"\n[+] Total {len(import_map)} unique import entries found.")
    return import_map

if __name__ == "__main__":
    idaapi.auto_wait()
    integrated_imports = get_integrated_imports()
    print("\n--- Final Integrated Import List ---")
    for ea, name in sorted(integrated_imports.items(), key=lambda x: x[0]):
        seg = ida_segment.getseg(ea)
        seg_name = ida_segment.get_segm_name(seg) if seg else "UNKNOWN_SEG"
        print(f"0x{ea:08X} | {name.ljust(35)} | Segment: {seg_name}")
    # with open("integrated_imports.json", "w") as f:
    #     json.dump(integrated_imports, f, indent=2)
```

### 4.2 angr + IDA 联合分析（静态调用链 + 动态污点）

| 步骤 | 工具 | 目的 / 产出 | 解决的问题 |
| :--- | :--- | :--- | :--- |
| Step 1 | IDA Pro（静态映射） | 生成 Sink 地址映射表：导出所有危险函数（Sink）名称及其在二进制中的实际 PLT/GOT 地址 | angr 启动时的地址不确定性 |
| Step 2 | IDA Pro（静态链条） | 生成 Library 静态调用链：以被污染的 PLT/GOT 接口为 lib 侧污染输入源，追踪到 Sink | 跨库漏洞静态上下文、间接调用问题 |
| Step 3 | Angr（动态验证） | 动态污点传递验证：从 Source（如 `CGI_Find_Parameter`）出发符号化追踪，验证符号数据能否到达 Step 1 给出的 Sink 地址 | 跨函数数据流、可控参数识别 |

- 阶段 I（目标文件 / Angr）：找到主程序所有被污染的导入函数调用，作为库的污染输入源。
- 阶段 II（库文件 / IDA 静态）：找出库内从污染入口到危险 Sink 的静态调用链。
- 阶段 III（合并验证）：将 Angr 验证的污染入口与 IDA 梳理的静态调用链比对，确认真正可利用的间接调用污染链。

## 5. 参考

- IDAPython 漏洞狩猎入门：<https://www.somersetrecon.com/blog/2018/7/6/introduction-to-idapython-for-vulnerability-hunting>
- 交叉引用图绘制：<https://bbs.kanxue.com/thread-276867.htm>
- IDA 7.4 Automation 分析指南：<https://www.anquanke.com/post/id/207021>
- 远程调用 IDA Python API（ida-rpyc）：<https://github.com/HyperSine/ida-rpyc>
- PyCharm 配置 Python3 的 IDAPython 环境：<https://blog.csdn.net/StepTp/article/details/136243615>
- 三端环境（win/mac/linux）配置：<https://bbs.kanxue.com/thread-279793-1.htm>
- IDAPython 学习：<https://oacia.dev/idapython-learning/>
- VSCode + debugpy：<https://fjqisba.github.io/2024/11/15/2024/IDAPython%E5%BC%80%E5%8F%91%E7%8E%AF%E5%A2%83%E6%90%AD%E5%BB%BA/>
