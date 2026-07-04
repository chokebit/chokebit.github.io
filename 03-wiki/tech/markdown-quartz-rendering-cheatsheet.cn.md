---
title: Markdown-Quartz 渲染一致性速查表
lang: cn
translations:
  en: tech/markdown-quartz-rendering-cheatsheet
tags:
  - workflow
  - knowledge-management
---

> 内容难免有误，请带着辩证视角阅读。

## 本文内容

- **为什么 Obsidian 里好好的，Web 上就乱了**：实时预览 vs 标准渲染。
- **换行三型法**：空行、双空格+回车、单回车，各自的效果和适用场景。
- **图片语法**：从 Obsidian 粘贴到生产就绪路径。
- **文件路径与 URL**：slug 是什么，文件命名如何决定访问地址。
- **发布前验证**：Obsidian 阅读模式 = Quartz 渲染结果。

---

## 一、Obsidian 和 Quartz 对 Markdown 的处理不同

Obsidian 的实时预览（Live Preview）为了写作体验更流畅，**单回车就换行**。但 Quartz 使用的 remark 渲染器遵循 CommonMark 规范——段落内单个回车会被当作空格，**必须空一行（两个回车）才能产生新段落**。

这就是为什么你在 Obsidian 里看着排版正常，发布到 Web 上却挤成一团。

**验证技巧**：在 Obsidian 里按 `Ctrl+E` 切换到阅读模式。阅读模式的渲染结果 ≈ Quartz 的 Web 渲染。发布前先切过去看一眼。

---

## 二、换行三型法

| 写法 | 渲染效果 | 什么时候用 |
|------|---------|-----------|
| 空一行（两个回车） | 段落大间距 | 正式分段 |
| 行末两个空格 + 回车 | 紧贴换行，无间距 | 连续要点、定义列表 |
| 单回车（不空行） | **不换行**，合并为同一段 | 不要这么写 |

### 示例

```markdown
段落一。

段落二。（与段落一之间有空行 → 渲染出间距）

段落一和段落二之间  
没有空行但行末有两个空格 → 渲染紧贴换行，无间距。

没有空行也没有双空格，渲染时合并。
```

实际渲染：
1.演示1
段落一。

段落二。

2.演示2
段落一和段落二之间  
没有空行但行末有两个空格 → 渲染紧贴换行，无间距。

3.演示3
没有空行也没有双空格，渲染时合并。

---

## 三、图片语法

```markdown
![[Pasted image 20260703.png]]    ← Obsidian 粘贴（Quartz 不识别）
![](../assets/描述性名称.webp)     ← Quartz 可用（必须用这个）
```

规则：Obsidian 粘贴图片后，转换为 WebP 放 `assets/`，用描述性命名如 `pcb-dram-length-matched-traces.webp`。

---

## 四、文件路径与 URL（slug）

slug 是 Quartz 里每个页面的路由标识，由文件路径自动生成。`index.md` 是特殊名——slug 指向父目录。

```markdown
文件                               slug              访问 URL
03-wiki/index.md               →  index            →  /
03-wiki/ideas/test.md           →  ideas/test       →  /ideas/test
03-wiki/tech/index.md           →  tech/index       →  /tech/
03-wiki/tech/pcb-guide.cn.md    →  tech/pcb-guide.cn →  /tech/pcb-guide.cn
```

规则：
- 文件名 = slug 最后一段，去掉 `.md`。
- `index.md` 表示"这个目录的首页"，slug 只到目录名。
- `.cn.md` 后缀表示中文版，slug 天然区分中英文。

---

## 发布前检查清单

1. `Ctrl+E` 切到 Obsidian 阅读模式，逐段扫一遍。
2. Q&A、定义列表、短句——确认没有粘在一起。
3. 图片路径确认指向 `../assets/`。
4. `npm run build && npm run dev`，浏览器最终确认。
5. 中英双版 frontmatter 的 `translations` 互相指向正确。

