---
title: Markdown-Quartz Rendering Consistency Cheatsheet
lang: en
translations:
  cn: tech/markdown-quartz-rendering-cheatsheet.cn
tags:
  - workflow
  - knowledge-management
---

> Errors are inevitable — read critically.

## Contents

- **Why it looks fine in Obsidian but breaks on the web**: Live Preview vs. standard rendering.
- **Three ways to break a line**: Blank line, double-space + Enter, single Enter — table + demo.
- **Image syntax**: From Obsidian paste to production-ready path.
- **File path & URL (slug)**: How file naming determines the access URL.
- **Pre-publish checklist**: Quick verification before deploying.

---

## I. Obsidian and Quartz Handle Markdown Differently

Obsidian's Live Preview renders a single Enter as a line break for writing convenience. Quartz's remark renderer follows the CommonMark specification — a single Enter within a paragraph is treated as a space. **You must leave a blank line (two Enters) to create a new paragraph.**

**Verification trick**: In Obsidian, press `Ctrl+E` to switch to Reading Mode. Reading Mode ≈ Quartz's web rendering. Check it before publishing.

---

## II. Three Ways to Break a Line

| Method | Rendered result | When to use |
|--------|----------------|-------------|
| Blank line (two Enters) | Large paragraph spacing | Formal paragraph breaks |
| Two spaces at end of line + Enter | Tight line break, no spacing | Consecutive points, definition lists |
| Single Enter (no blank line) | **No break**, lines merge | Don't use this |

```markdown
Paragraph one.

Paragraph two. (Blank line above → spacing rendered)

This line has two spaces at the end··
This line uses a tight break.

No blank line, no double spaces: merged into one paragraph.
```

Rendered:

1. With blank line:
Paragraph one.

Paragraph two.

2. With two spaces:  
This line has two spaces at the end  
This line uses a tight break.

3. Single Enter: No blank line, no double spaces: merged into one paragraph.

---

## III. Image Syntax

```markdown
![[Pasted image 20260703.png]]    ← Obsidian paste (doesn't work in Quartz)
![](../assets/descriptive-name.webp)     ← Quartz-compatible (use this)
```

Rule: paste images in Obsidian, then convert to WebP and move to `assets/`. Use descriptive names like `pcb-dram-length-matched-traces.webp`.

---

## IV. File Path & URL (Slug)

The slug is Quartz's routing identifier for each page, auto-generated from the file path. `index.md` is a special name — its slug points to the parent directory.

```markdown
File                              Slug              URL
03-wiki/index.md               →  index           →  /
03-wiki/ideas/test.md           →  ideas/test      →  /ideas/test
03-wiki/tech/index.md           →  tech/index      →  /tech/
03-wiki/tech/pcb-guide.cn.md    →  tech/pcb-guide.cn →  /tech/pcb-guide.cn
```

Rules:
- Filename without `.md` = last segment of the slug.
- `index.md` means "this directory's home page" — slug stops at the directory name.
- `.cn.md` suffix = Chinese version, slug naturally distinguishes languages.

---

## Pre-Publish Checklist

1. `Ctrl+E` into Obsidian Reading Mode, scan every section.
2. Q&A, definition lists, short sentences — ensure nothing is stuck together.
3. Image path: `../assets/descriptive-name.webp`, no Obsidian `![[]]` syntax.
4. `npm run build && npm run dev`, browser check.
5. Bilingual frontmatter `translations` cross-reference each other correctly.
