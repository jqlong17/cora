# Cora

A Notion-inspired knowledge management plugin for VS Code

## Why Cora?

VS Code and Cursor's interfaces are designed for programming—file tree on the left, editor in the middle, AI chat on the right. This layout works well for coding, but it's not ideal for knowledge management.ΩΩ

Notion excels at knowledge management: hierarchical pages, document outlines, full-text search. But it lacks VS Code's powerful editing capabilities and AI integration.

Cora combines both:

* 📁 **Page Tree** — Intuitive hierarchical organization like Notion

* 📋 **Outline View** — One-click navigation through document structure with collapsible headings

* 🔍 **Full-text Search** — Multi-keyword search with intelligent fallback

* 📝 **Seamless Editing** — Edit/preview toggle while keeping VS Code's native experience

## Who is it for?

* **Developers who are also knowledge workers** — One tool for both code and notes

* **Non-technical knowledge workers** — Leverage AI-powered programming for more efficient knowledge management

## Use Cases

| Scenario                 | Traditional Way         | Cora Way                                             |
| ------------------------ | ----------------------- | ---------------------------------------------------- |
| Organizing project docs  | Nested folder chaos     | Hierarchical page tree at a glance                   |
| Reading long documents   | Scroll to find content  | Outline navigation, jump to target section instantly |
| Finding notes            | Open files one by one   | Full-text search with keyword highlighting           |
| Switching coding/writing | Two apps back and forth | One VS Code, two modes                               |

## Core Design Philosophy

Keep VS Code's editing power, add Notion's organizational capabilities.

* Add knowledge base view to the left panel, easily switch back to native file tree

* Middle area still uses VS Code editor, preview/edit with one click

* Right AI chat stays unchanged, seamlessly integrated with knowledge base

## Features

### 📄 Page Tree

* **Flat/Tree Toggle**: By default, files are shown in a folder hierarchy tree; you can switch to a flat list sorted by modification time (newest first)

* **File Tree View**: In tree mode, display complete file hierarchy from workspace root

* **Smart Filtering**: In tree mode, toggle between \[All Files] and \[Markdown Only]

* **Quick Actions**: New note, new folder, rename, delete

* **File Operations**: Reveal in Finder, copy path, copy file

* **Expand/Collapse**: Expand all, collapse all

### 📋 Outline

* **Real-time Following**: Automatically follow the active editor/preview; outline updates as you edit (including Cora edit mode)

* **Tree Hierarchy**: H1→H2→H3 auto-builds parent-child relationships, expanded by default

* **Quick Jump**: Click outline item to jump to position (works in both preview and edit mode)

* **Level Labels**: H1, H2, H3 text labels for heading levels, clean and clear

### 🔍 Search

* **Full-text Search**: Search content across all Markdown files in workspace

* **Multi-keyword**: Support `A B` format to search files containing all keywords

* **Smart Fallback**: When AND search has no results, automatically fallback to OR search

* **Match Statistics**: Show match count and preview text for each file

* **Result Sorting**: Automatically sort by match count

### 📝 Edit and Preview

* **Preview by Default**: Click Markdown file to open in preview mode, read rendered content directly

* **One-click Toggle**: Preview/Markdown button in editor top-right to switch modes

* **Outline Sync**: Outline remains visible and functional in preview mode

**Cursor vs VS Code**: In Cursor you get inline Preview/Markdown toggle buttons. In VS Code, if those buttons don’t appear, use `Cmd+Shift+V` (preview) and `Cmd+E` (edit), or the icons in the editor title bar.

## Quick Start

### Installation

1. Search for "Cora" in VS Code/Cursor extension marketplace
2. Click Install
3. After installation, the 📖 **Cora** icon appears in the left activity bar

### Usage Guide

1. **Open Cora Panel**

* Click the 📖 Cora icon in the left activity bar

* Or use shortcut `Cmd+Shift+P` and type "Cora"

1. **Browse Files (Page Tree)**

* In the [Pages] tab, the default **tree** view shows folder hierarchy; you can switch to flat view sorted by modification time

* Toolbar: **New note**, **New folder**; “Toggle flat/tree” to switch view; in tree view use \[All/Markdown] filter

* Right-click files for various operations

1. **View Document Structure (Outline)**

* Open any Markdown file

* Switch to \[Outline] tab to view document heading structure

* Click heading items to jump to corresponding positions

* Support expand/collapse subheadings

1. **Search Notes**

* Switch to \[Search] tab

* Click 🔍 **Search Notes** button

* Enter keywords, support multi-keyword (space separated)

* View search results and click to open files

1. **Edit and Preview**

* Click Markdown file → Opens in preview mode by default

* **Cursor**: Use the **Markdown** / **Preview** buttons in the editor area

* **VS Code**: If no inline buttons, use `Cmd+Shift+V` (preview), `Cmd+E` (edit), or the title bar icons

## Keyboard Shortcuts

| Action                        | Shortcut      |
| ----------------------------- | ------------- |
| Open Markdown Preview         | `Cmd+Shift+V` |
| Return to Editor from Preview | `Cmd+E`       |

## Context Menu Features

Right-click on files or folders in the page tree:

* **New Note** - Create new Markdown file in current directory

* **New Folder** - Create new folder in current directory

* **Rename** - Rename file/folder

* **Delete** - Delete file/folder

* **Reveal in Finder** - Open system file manager

* **Copy Absolute Path** - Copy full file path

* **Copy Relative Path** - Copy path relative to workspace

* **Copy File** - Create file copy (auto-named)

## Search Tips

| Input                           | Description         | Result                                     |
| ------------------------------- | ------------------- | ------------------------------------------ |
| `project`                       | Single keyword      | All notes containing "project"             |
| `project plan`                  | Multi-keyword (AND) | Notes containing both "project" and "plan" |
| `project plan` (no AND results) | Smart fallback (OR) | Notes containing "project" or "plan"       |

## Configuration

Search for "knowledgeBase" in VS Code settings to configure:

| Config                             | Type    | Default                        | Description                                             |
| ---------------------------------- | ------- | ------------------------------ | ------------------------------------------------------- |
| `knowledgeBase.filterMode`         | string  | `"markdown"`                   | Page tree file filter mode (tree view)                  |
| `knowledgeBase.pageViewMode`       | string  | `"tree"`                       | Page view mode: `tree` (hierarchy) or `flat` (by mtime) |
| `knowledgeBase.markdownExtensions` | array   | `[".md", ".markdown", ".mdx"]` | Recognized Markdown file extensions                     |
| `knowledgeBase.autoReveal`         | boolean | `true`                         | Auto reveal current file in page tree                   |

## Roadmap

Planned features to be implemented by priority.

### Basic Features

* **Flat view**: Page module will support a flat view of all Markdown files, sorted by modification time (newest first), for quick browsing and navigation

* **MD normalization**: One-click Markdown standardization to fix common format issues in LLM-generated content, e.g.:

  * Spacing around emphasis (bold/italic) markers

  * Table separator rows and alignment

  * Mermaid code block syntax errors

### AI Features

* **Skill generation**: Use AI to analyze the whole repo or selected code and produce reproducible Skill documentation

* **Architecture diagram**: Use AI to analyze repo code architecture and generate architecture diagrams (e.g. Mermaid)

## Languages

* [简体中文](./README.md)

* [English](./README_EN.md)

## License

MIT

Cora — Making knowledge management as efficient as coding.
