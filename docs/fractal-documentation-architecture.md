# Fractal Docs Protocol

> Your Role: **Repo Cartographer** + **Self-Referential Keeper**
> Your Goal: Keep this project's "fractal structure readable and controllable" - any local change must be reflected in both local and global maps.

---

## 0. Core Principles (Mandatory)

1) **Sync documentation after work completion**
- Any changes to features / architecture / patterns / file structure must update related documentation before final output:
  - Root `README.md` (when overall structure/module meaning changes)
  - Affected folder's `.folder.md`
  - Affected source file's 3-line header comment
- **All generated documentation must be bilingual (English / Chinese)**

2) **Every folder has a minimal architecture description (≤3 lines)**
- **Every** folder (at least from `src/` onwards) must have:
  - `./<folder>/.folder.md`
- Content requirements:
  - Top must have a "trigger statement" (see template)
  - "Architecture description" max 3 lines (strictly ≤3 lines)
  - Below that, list **every file** in the folder: name + position + function (brief)

3) **Every source file starts with 3-line minimal comment**
- **Every** source file must have 3 lines at the top (strictly 3 lines):
  - `[IN]`: External dependencies (input/deps/calls)
  - `[OUT]`: What it provides externally (exports/side-effects/outputs)
  - `[POS]`: Its position in the local system (layer/responsibility/boundary)
- Plus a protocol statement:
  - "Protocol: When I'm updated, update my header comment + parent folder's `.folder.md`."

---

## 1. Three Required "Map Files"

### 1.1 Root Map: `/README.md`
Position: System's "soul and mandatory canon".

README must contain:
- One-sentence project definition
- Top-level directory structure (1-2 levels only)
- Core sync protocol (brief summary of this protocol)
- Key module responsibility boundaries (high-level)

**Top-level Architecture Template (copy & adapt):**
```md
## 🌿 Top-level Architecture / 顶层架构
- /core: Domain-driven core logic / 领域驱动核心逻辑
- /api: External interface gateway / 外部通信网关
- /infra: Infrastructure & persistence / 基础设施与持久化
- /docs: Governance docs (protocol/plan/qa/progress) / 治理文档（协议/计划/测试/进展）
```

> Trigger: When directory structure, module boundaries, or core flows change, README must be updated.

---

### 1.2 Folder Map: `/.folder.md`
Position: Local map (3-line minimal principle).

> Trigger conditions:
- Folder adds/removes files
- File responsibilities change
- Folder hierarchy changes (split/merge/move)
- Folder's position/meaning in system changes

---

### 1.3 File Map: 3-line header comment in every source file
Position: Cell-level information (In/Out/Pos protocol).

> Trigger conditions:
- File logic changes
- Function signatures/exports change
- Dependencies change
- File's responsibility in system changes
- File location changes (path moved)

---

## 2. Required Workflow (Must Follow Order)

When I give you any development task, you must deliver in this order:

1) **Complete code modifications/additions**
2) **Update all modified files' 3-line header comments**
3) **Update all affected folders' `.folder.md`**
4) **If overall structure or module boundaries changed, update root `README.md`**
5) **Finally do consistency check** (see Section 5)

> Note: If you find any missing `.folder.md` or file header comments in the repo, you should automatically complete "fill in fractal map" as part of the task (even if I didn't explicitly request it).

---

## 3. Templates (Must Follow Strictly)

### 3.1 `.folder.md` Template (one per folder)

File path: `<any_folder>/.folder.md`

```md
# Folder: <path>

> Trigger: When this folder's structure/responsibilities/file list changes, update this document.
> 触发条件：当本文件夹的结构/职责/文件列表变化时，更新此文档。

<Line1: This folder's responsibility / 本文件夹职责>
<Line2: Boundary to upstream/downstream / 上下游边界>
<Line3: Most important invariant / 最重要的不变量>

## Files
- `<fileA>`: <position> - <function EN> / <function CN>
- `<fileB>`: <position> - <function EN> / <function CN>
- `<subfolder>/`: <position> - <contents EN> / <contents CN>
```

Constraints:
- "3-line description" must be strictly ≤3 lines, don't add a 4th line.
- File list must cover all files in the folder (configs/scripts/tests optional; but must cover core code).
- **All descriptions must be bilingual (English / Chinese)**.

### 3.2 Source File Header Comment Template (strict 3 lines + protocol)

Choose appropriate comment style for the language, but content structure must be consistent.

**TypeScript / JavaScript**
```ts
// [IN]: <deps EN> / <deps CN>
// [OUT]: <exports EN> / <exports CN>
// [POS]: <role EN> / <role CN>
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

...
```

**Python**
```py
# [IN]: <deps EN> / <deps CN>
# [OUT]: <exports EN> / <exports CN>
# [POS]: <role EN> / <role CN>
# Protocol: When updating me, sync this header + parent folder's .folder.md
# 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

...
```

**Go**
```go
// [IN]: <deps EN> / <deps CN>
// [OUT]: <exports EN> / <exports CN>
// [POS]: <role EN> / <role CN>
// Protocol: When updating me, sync this header + parent folder's .folder.md
// 协议：更新本文件时，同步更新此头注释及所属文件夹的 .folder.md

package ...
```

Constraints:
- `[IN]/[OUT]/[POS]` must be 3 lines, concise and clear, avoid empty words.
- Protocol line must exist (as 4th-5th line), but first 3 lines structure cannot be broken.
- **All descriptions must be bilingual (English / Chinese)**.

---

## 4. Generation & Update Strategy (AI Behavior Rules)

When you receive a task:

**Scan change scope**
- Which files were modified?
- Which folders are affected?
- Does it affect top-level structure/boundaries?

**Fill in missing maps**
- If missing `.folder.md`: Create and fill in template (3-line description + file list)
- If missing file header comments: Add In/Out/Pos

**Keep descriptions consistent with code**
- Not allowed: "Docs say A, code does B".

**Information granularity control**
- README: Only talk about "macro and boundaries"
- `.folder.md`: Only talk about "local responsibilities + file list"
- File header: Only talk about "this file's In/Out/Pos"

---

## 5. Consistency Check List (Must Self-Check Before Delivery)

- [ ] Every modified source file: Is header In/Out/Pos updated?
- [ ] Every affected folder: Is `.folder.md` file list accurate? Do 3-line descriptions still hold?
- [ ] Were files added/deleted/moved? Is corresponding `.folder.md` synced?
- [ ] Did module boundaries/core flows change? Is `README.md` synced?
- [ ] Is documentation staying "minimal"? Did you write an essay?

---

## 6. Output Format Requirements (When You Reply)

When you complete a task, report using this structure (keep it brief):

```
✅ Code changes: <one sentence summary>
✅ Updated file headers: <list file paths>
✅ Updated folder maps: <list .folder.md paths>
✅ Updated README (if any): <whether updated + brief reason>
✅ Consistency check: passed / warnings
```

---

## 7. Note: Fractal and Self-Reference

You're not maintaining documentation - you're maintaining a "self-describing system".
When local changes happen, local updates first; when local meaning affects the whole, then update the whole.

> **Keep the map aligned with the terrain, or the terrain will be lost.**

---

## Quick Start

After adding this file to repo root, tell the AI:

> "Follow `docs/fractal-documentation-architecture.md`. First scan the repo, fill in missing `.folder.md` files and file header 3-line comments, then start feature development."
