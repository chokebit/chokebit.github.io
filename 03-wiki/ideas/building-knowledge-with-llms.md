---
title: Building a Knowledge System with LLMs in the AI Era
lang: en
translations:
  cn: ideas/building-knowledge-with-llms.cn
tags:
  - llm
  - knowledge-management
  - workflow
---

> Errors are inevitable — read critically.

## Contents

- **Why Traditional Note-Taking Is Failing**: Hoarding without reading, fragmentation, and garbage accumulation.
- **New Possibilities for Learning in the AI Era**: From passive accumulation to active reconstruction — AI amplifies your ability to organize.
- **What an LLM Actually Does**: Filter, merge, delete, link — four core capabilities.
- **My Workflow**: Batch input → AI proposal → human review → execute → human re-check → publish.
- **Lessons Learned**: Don't dump everything at once. Design your structure first. Bilingual support is harder than you think.
- **Sharing Is Learning, Altruism Is Self-Interest**: The philosophy behind this blog.

---

## I. Why Traditional Note-Taking Is Failing

We've all been there: bookmarks saved but never revisited, hundreds of Markdown notes in scattered folders, screenshots and PDFs piled up in a directory. And then we never open them again.

The problem isn't the tool. It's the accumulation method:

- **Collecting without reading**: Saving becomes a substitute for learning. Bookmarks are placebos for understanding.
- **Extreme fragmentation**: A single sentence saved as a standalone file. Six months later, you have no idea what the context was.
- **Garbage mixed in**: Error logs, copy-pasted web pages, screenshots of code — taking up disk space with zero reuse value.

The purpose of a note-taking system isn't hoarding — it's **being rediscoverable and usable**. If it can't do that, all those notes are just digital waste.

---

## II. New Possibilities for Learning in the AI Era

Traditional note-taking is one-directional: you write, it stores. AI turns this into a two-way loop:

1. **You provide raw material** (scattered notes, old files, web clippings).
2. **AI organizes it** (filters valuable content, merges related pieces, generates structured text).
3. **You review and decide** (confirm, modify, delete, supplement).
4. **The finished product is published** — indexable by search engines, citable by yourself and others.

AI doesn't replace your thinking. It **amplifies your organizational ability**. Instead of manually sifting through hundreds of messy notes, AI handles the first pass of filtering and categorization. You focus on what matters most: judgment and decision.

Your learning records transform from private notes into **publishable knowledge assets**. AI wakes up the knowledge gathering dust in your bookmarks folder, shifting your brain from "hoarding mode" to "reconstruction and absorption mode".

---

## III. What an LLM Actually Does

In this blog's workflow, the LLM performs four core tasks:

**Filter**: From a batch of notes, identify what's worth keeping and what's pure junk. Criteria include: timeliness, reuse value, and whether the content stands alone as a complete piece.

**Merge**: Find fragmented notes on the same topic or technology stack and fuse them into one deep, well-structured article. For example, three scattered Docker-related notes become a single comprehensive Docker practice guide.

**Delete**: Thoroughly remove expired error logs, meaningless web page copies, and space-wasting code screenshots. Free up disk space while making the remaining content more focused.

**Link**: Scan article content and automatically identify mentioned concepts, then build inter-page connections using Obsidian wikilink syntax `[[concept-name]]`.

---

## IV. My Workflow

This process has been refined through multiple iterations:

1. **Batch input**: Pick up to 5 related notes from history and place them in the processing directory. Two reasons not to dump everything at once — AI context limits, and manageable human review granularity.
2. **AI scan & proposal**: AI reads the entire batch and outputs a table marking each file's recommended action (keep, merge, delete) and target category.
3. **Human review**: Confirm or adjust each proposal item by item. This step cannot be skipped — AI judgment needs human oversight.
4. **AI execution**: Based on confirmed decisions, execute merges, deletions, write new articles, and update indexes and logs.
5. **Human re-check**: Manual quality check — ensure content accuracy, formatting consistency, and valid links.
6. **Publish**: Git commit → push → GitHub Actions auto-deploy.

To summarize the workflow: **the human is the editor; the AI is the assistant**.

---

## V. Lessons Learned

**Don't dump everything in at once.** When the volume is high, AI proposals become coarse and the review burden multiplies. Process in batches, each kept to a manageable size.

**Design the directory structure before writing content.** Figure out your category system, multilingual scheme, and naming conventions first. The pain of restructuring directories mid-project far outweighs the cost of upfront design.

**Bilingual support is far more complex than expected.** Language switching, file naming, sidebar directory filtering, folder naming — every seemingly simple requirement can become a rabbit hole in implementation. If you need bilingual support, start with the simplest possible approach and resist the urge to stack workarounds.

---

## VI. Sharing Is Learning, Altruism Is Self-Interest

**The spirit of the Internet**: Countless times I've combed through blog after blog, chasing a single clue to answer one question. The words left behind by strangers — authors I've never met — solved problem after problem for me. Now it's my turn to leave something behind. Even if it helps just one person, it matters. The most precious thing about the Internet is this unpaid, unconditional transmission of knowledge.

**Condensing a book into a page**: Publishing your notes forces you to write them so that **someone else can understand**. That process of "making it understandable to others" is itself a second pass of digestion and deeper comprehension. Many things you thought you understood — halfway through writing, you realize you didn't. Writing for others is the most honest test of your own understanding.

**Being open means being corrected**: Errors hidden in private notebooks are never discovered. Put them in the open and they have a chance to be fixed. The earliest drafts of articles, the initial site layout — all improved only after publishing and receiving feedback. This is the fastest learning loop: you share, others correct, you improve.

---

*This blog is powered by Quartz + Obsidian. All content is open source on GitHub. Feedback and corrections are welcome.*

> **Inspiration**: This blog's LLM Wiki workflow is inspired by [Andrej Karpathy's gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) — using an LLM as a knowledge base maintainer, incrementally building a structured wiki from raw documents, with the human serving as curator and decision-maker.
