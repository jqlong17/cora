# Cora

A Notion-inspired knowledge management extension for VS Code and Cursor, and a companion for AI-assisted coding: it improves how you read, find, understand, and plan—with project-level code understanding (CoraWiki, experimental) and structured plan writing (Plan enhancement, experimental, optional).

## Why Cora?

VS Code and Cursor are built for programming—file tree on the left, editor in the middle, AI chat on the right. That layout works well for code, but not for knowledge management.

Notion excels at knowledge management: hierarchical pages, document outlines, full-text search. But it lacks VS Code’s editing power and AI integration.

Cora brings both together. When used in Cursor, Cora also helps the AI understand your project and write actionable plans.

* 📁 **Page Tree** — Hierarchical knowledge organization as intuitive as Notion

* 📋 **Outline View** — Navigate document structure at a glance, with collapsible headings

* 🔍 **Full-text Search** — Multi-keyword search with smart fallback

* 📝 **Seamless Editing** — One-click switch between edit and preview, same VS Code experience

## Who is it for?

* **Developers who are also knowledge workers** — One tool for code and notes

* **Developers using Cursor for AI-assisted coding** — Better doc reading, project understanding, and plan discipline

* **Non-technical knowledge workers** — Use AI-assisted workflows to manage knowledge more efficiently

## Use Cases

| Scenario                 | Traditional way        | With Cora                                  |
| ------------------------ | ---------------------- | ------------------------------------------ |
| Organizing project docs  | Messy nested folders   | Clear hierarchical page tree                |
| Reading long documents   | Endless scrolling      | Outline navigation, jump to any section     |
| Finding notes            | Open files one by one  | Full-text search with highlighted matches   |
| Switching code / writing | Toggling between apps  | One VS Code, two modes                      |

## Core design

Keep VS Code’s editing, add Notion-style organization.

* Left panel gets a knowledge-base view; you can switch back to the default file tree anytime

* Center stays the VS Code editor, with one-click preview/edit

* Right-hand AI chat is unchanged and works with the knowledge base

## Cora and AI-assisted coding

Cora gives Cursor / AI-assisted coding four capabilities so you and the AI work better in one workspace:

| Capability | In Cora | Value for AI programming / Cursor |
|------------|---------|-----------------------------------|
| **Read** | Page tree, Outline | Better MD/Plan reading and navigation; clear structure when the AI references docs. |
| **Find** | Full-text search | Quick file and snippet lookup; groundwork for “find by description” for the AI. |
| **Understand** | CoraWiki (experimental) | Repo-wide code understanding and architecture reports; future MCP for deeper context. |
| **Plan** | Plan writing constraints (experimental, optional) | Structured, checkable plans; tests and features developed in sync, each module requires unit + e2e tests, tasks updated only after tests pass; AI reads constraints first for more consistent output. |

## Product features

Below are Cora’s main workflows and UI, ordered from overview to core experience to nice-to-haves.

### 1. Overall layout

Left: knowledge panel (**Page** tree, **Outline**, **Search**). Center: Markdown editing and preview. Right: AI chat. One workspace for organizing, reading, searching, and AI collaboration.

![Cora overall layout](docs/product-features/00-overview.png)

* **Left**: Page tree (tree / flat / favorites), document outline, full-text search

* **Center**: Preview and Markdown modes, with tables, external images, etc.

* **Right**: AI chat and history, in sync with the current document

### 2. Edit in preview (WYSIWYG)

Edit content directly in **Preview** mode—no need to switch to source. Change text, select passages, or send selections to AI, all in the same view (Typora-style).

![Edit in preview](docs/product-features/07-preview-edit.png)

* **Edit in preview**: Tab shows “(Edit)”; you can edit body text in the preview

* **One-click switch**: Use **Preview** / **Markdown** to toggle between rendered view and source

### 3. Add to Chat from selection

In preview or Markdown mode, **select text** and click **Add to Chat** (or `⌘L`) to send that range as a “file + lines” reference into the right-hand AI chat—no copy-paste.

![Add to Chat from selection](docs/product-features/04-add-to-chat.png)

* **Select and send**: After Add to Chat, the conversation shows something like “project-plan.md (lines 6–8)”

* **Focused context**: The AI only sees the selected fragment, so questions and answers stay on topic

### 4. Multi-select and AI

In the page tree, **Shift / Command** to select multiple files; right-click to **copy absolute or relative paths** in bulk. Selected paths can be used as context in AI chat so the AI can read several notes at once.

![Multi-select and AI](docs/product-features/01-multi-select-chat.png)

* **Multi-select and paths**: In tree or flat view, multi-select and copy paths; AI can reference multiple files

* **Multi-doc workflow**: Select several documents for comparison, summarization, or cross-doc analysis

### 5. Live outline

The **Outline** panel on the left **parses** the current document’s headings (H1–H4) in real time and shows them in a tree you can expand/collapse. It updates when you switch documents or edit, so you can jump around long docs quickly.

![Live outline](docs/product-features/05-outline-realtime.png)

* **Level labels**: H1, H3, H4, etc., so structure is clear

* **Click to jump**: Click an outline item to go to that position; stays in sync in both preview and edit

### 6. Multi-keyword search

The **Search** panel supports **multiple keywords** (space-separated). Press Enter to find Markdown files that **contain all** of them; if there are no AND results, it falls back to OR automatically.

![Multi-keyword search](docs/product-features/08-multi-keyword-search.png)

* **AND search**: e.g. “risk company” shows only notes that contain both

* **Match info**: Result list shows match count and a short preview for quick scanning

### 7. CoraWiki: workspace architecture analysis (experimental)

**CoraWiki** is an experimental feature. The panel runs **architecture analysis** on the current workspace and produces a structured report (overview, module roles, key flows, risks, references). In Cursor, the report gives the AI project-level context; we plan to expose deeper context via MCP so AI coding gets more support.

* **One-click analysis**: In the Cora panel, choose “Start architecture analysis for current workspace”, then open the report when done

* **Report and references**: Click file references in the report to jump to code for you or the AI

### 8. Plan writing constraints (experimental, optional)

**Plan enhancement** is an experimental feature. Cora provides **Plan writing constraints and templates** so you and the AI can write clear, checkable plans. The constraints require **tests and features to be developed in sync**; every module must have **unit tests and e2e tests**; **tasks may only be marked complete after all tests pass**—updating task status before tests pass is disallowed. In Cursor you can combine them with workspace rules so that “read constraints before writing a plan” is automatic, and AI-generated plans are more consistent and actionable. Later versions may add commands like “Open plan constraints” or “New plan from template”.

### 9. Favorites

**Favorite** frequently used documents from the page tree; the toolbar has a **Favorites** view. In tree or flat view, hover or right-click to add/remove favorites; favorited items show a star.

![Favorites](docs/product-features/03-favorites.png)

* **Toolbar star**: One click to switch to Favorites view (only favorited files)

* **Star on items**: Favorited MD/HTML files show a star in the list; you can unfavorite anytime

### 10. Mermaid in preview

In preview mode, **Mermaid** code blocks in Markdown are rendered as sequence diagrams, flowcharts, etc.—no need to export images.

![Mermaid rendering](docs/product-features/02-mermaid-rendering.png)

* **Sequence / flow**: e.g. login flow, exception branches; edits update the diagram

* **One-click switch**: Toggle between Preview and Markdown to compare code and diagram

### 11. Typography

Preview and editor both support configurable **fonts** with clear mixed Latin/CJK. You can choose Cascadia Mono, Google Sans, IBM Plex Mono, Noto Sans SC, etc. in settings.

![Font preview](docs/product-features/06-font-preview.png)

* **Mixed script**: Poems, notes, etc. get consistent spacing and weight

* **Configurable**: `knowledgeBase.fontFamily`, size, etc. in VS Code settings

***

<br />

## Quick start

### Install

1. Search for “Cora” in the VS Code/Cursor extension marketplace  
2. Click **Install**  
3. After install, the 📖 **Cora** icon appears in the left activity bar  

### Usage

1. **Open the Cora panel**

   * Click the 📖 Cora icon in the left activity bar  

   * Or `Cmd+Shift+P` and type “Cora”  

2. **Browse files (page tree)**

   * In the **Pages** tab you see the workspace file tree: **Tree** (folder hierarchy), **Flat** (by modification time), or **Favorites** (favorited files only)  

   * Toolbar left to right: Tree, Flat, Favorites, Sort, Filter, Refresh, New note, New folder. In tree mode you can filter by [All] or [Markdown only].  

   * Hover or right-click an MD file to Favorite/Unfavorite; favorited items show a star.  

   * Right-click for more actions.  

3. **Document structure (outline)**

   * Open any Markdown file.  

   * Switch to the **Outline** tab to see heading structure.  

   * Click a heading to jump to that position.  

   * Headings can be expanded/collapsed.  

4. **Search notes**

   * Switch to the **Search** tab.  

   * Click 🔍 **Search notes**.  

   * Enter keywords (space-separated for multiple).  

   * Open a result by clicking it.  

5. **Edit and preview**

   * Click a Markdown file → it opens in preview by default.  

   * **Cursor**: Use **Markdown** / **Preview** at the top-right of the content area to switch.  

   * **VS Code**: If those buttons aren’t there, use `Cmd+Shift+V` (preview), `Cmd+E` (edit), or the title bar icons.  

## Context menu

Right-click a file or folder in the page tree:

* **New note** — New Markdown file in the current directory  

* **New folder** — New folder in the current directory  

* **Favorite** / **Unfavorite** — Add or remove from favorites (or use the star on hover)  

* **Rename** — Rename file or folder  

* **Delete** — Delete file or folder  

* **Reveal in Finder** — Open in system file manager  

* **Copy absolute path** — Copy full path  

* **Copy relative path** — Copy path relative to workspace  

* **Copy file** — Duplicate file (auto-named)  

## Search tips

| Input                | Meaning          | Result                                      |
| -------------------- | ---------------- | ------------------------------------------- |
| `project`            | Single keyword  | All notes containing “project”              |
| `project plan`       | Multi (AND)     | Notes containing both “project” and “plan”  |
| `project plan` (no AND hits) | Fallback (OR) | Notes containing “project” or “plan”       |

## Configuration

In VS Code settings, search for “knowledgeBase”:

| Setting                             | Type    | Default                          | Description                                                                 |
| ----------------------------------- | ------- | -------------------------------- | --------------------------------------------------------------------------- |
| `knowledgeBase.filterMode`          | string  | `"markdown"`                     | File filter in page tree (tree view)                                        |
| `knowledgeBase.pageViewMode`        | string  | `"tree"`                         | Page view: `tree`, `flat` (by mtime), or `favorites`                        |
| `knowledgeBase.markdownExtensions` | array   | `[".md", ".markdown", ".mdx"]`    | Treated as Markdown                                                         |
| `knowledgeBase.autoReveal`          | boolean | `true`                           | Reveal the current file in the page tree when opening                       |

## Roadmap

Planned work, in rough priority order.

### Current / ongoing (including experimental)

* **CoraWiki** (experimental): Workspace architecture analysis is available; we keep improving report quality and multi-step research.

* **Plan enhancement** (experimental): Plan writing constraints and templates as a product capability (tests and features in sync, unit + e2e per module, tasks updated only after tests pass); we may add an “Open plan constraints” command or “New plan from template” later.

### Basic

* **MD normalization**: One-click cleanup of Markdown (e.g. spacing around bold/italic, table alignment, Mermaid syntax) for LLM-generated content.  

### AI and integration

* **MCP**: Expose project understanding, plan constraints, etc. to Cursor so AI coding gets deeper context.

* **Skill generation**: Use AI to analyze a repo or selected code and produce reproducible Skill docs.  

* **Architecture diagrams**: Together with CoraWiki, use AI to summarize repo structure and output diagrams (e.g. Mermaid).  

## Languages / Changelog

* [简体中文](./README.md) · [更新日志](./CHANGELOG.md)

* [English](./README_EN.md) · [Changelog](./CHANGELOG_EN.md)  

## License

MIT  

Cora — Knowledge management and AI-assisted coding in one workspace; read, find, understand, and plan better in Cursor.
