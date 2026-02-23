# Cora

A Notion-inspired knowledge management plugin for VS Code

## Why Cora?

VS Code and Cursor's interfaces are designed for programming—file tree on the left, editor in the middle, AI chat on the right. This layout works well for coding, but it's not ideal for knowledge management.

Notion excels at knowledge management: hierarchical pages, document outlines, full-text search. But it lacks VS Code's powerful editing capabilities and AI integration.

Cora combines both:

- 📁 **Page Tree** — Intuitive hierarchical organization like Notion
- 📋 **Outline View** — One-click navigation through document structure with collapsible headings
- 🔍 **Full-text Search** — Multi-keyword search with intelligent fallback
- 📝 **Seamless Editing** — Edit/preview toggle while keeping VS Code's native experience

## Who is it for?

- **Developers who are also knowledge workers** — One tool for both code and notes
- **Non-technical knowledge workers** — Leverage AI-powered programming for more efficient knowledge management

## Use Cases

| Scenario | Traditional Way | Cora Way |
|----------|-----------------|----------|
| Organizing project docs | Nested folder chaos | Hierarchical page tree at a glance |
| Reading long documents | Scroll to find content | Outline navigation, jump to target section instantly |
| Finding notes | Open files one by one | Full-text search with keyword highlighting |
| Switching coding/writing | Two apps back and forth | One VS Code, two modes |

## Core Design Philosophy

Keep VS Code's editing power, add Notion's organizational capabilities.

- Add knowledge base view to the left panel, easily switch back to native file tree
- Middle area still uses VS Code editor, preview/edit with one click
- Right AI chat stays unchanged, seamlessly integrated with knowledge base

## Features

### 📄 Page Tree
- **File Tree View**: Display complete file hierarchy from workspace root
- **Smart Filtering**: Toggle between [All Files] and [Markdown Only]
- **Quick Actions**: New note, new folder, rename, delete
- **File Operations**: Reveal in Finder, copy path, copy file
- **Expand/Collapse**: Expand all, collapse all

### 📋 Outline
- **Real-time Following**: Automatically follow the active editor/preview
- **Tree Hierarchy**: H1→H2→H3 auto-builds parent-child relationships, expanded by default
- **Quick Jump**: Click outline item to jump to position (auto-switches to edit mode from preview)
- **Level Icons**: Different icons for different levels, clear visual hierarchy

### 🔍 Search
- **Full-text Search**: Search content across all Markdown files in workspace
- **Multi-keyword**: Support `A B` format to search files containing all keywords
- **Smart Fallback**: When AND search has no results, automatically fallback to OR search
- **Match Statistics**: Show match count and preview text for each file
- **Result Sorting**: Automatically sort by match count

### 📝 Edit and Preview
- **Preview by Default**: Click Markdown file to open in preview mode, read rendered content directly
- **One-click Toggle**: Preview/Markdown button in editor top-right to switch modes
- **Outline Sync**: Outline remains visible and functional in preview mode

## Quick Start

### Installation

1. Search for "Cora" in VS Code/Cursor extension marketplace
2. Click Install
3. After installation, the 📖 **Cora** icon appears in the left activity bar

### Usage Guide

1. **Open Cora Panel**
   - Click the 📖 Cora icon in the left activity bar
   - Or use shortcut `Cmd+Shift+P` and type "Cora"

2. **Browse Files (Page Tree)**
   - View workspace file tree in the [Pages] tab
   - Use top buttons to toggle [All/Markdown] filter mode
   - Right-click files for various operations

3. **View Document Structure (Outline)**
   - Open any Markdown file
   - Switch to [Outline] tab to view document heading structure
   - Click heading items to jump to corresponding positions
   - Support expand/collapse subheadings

4. **Search Notes**
   - Switch to [Search] tab
   - Click 🔍 **Search Notes** button
   - Enter keywords, support multi-keyword (space separated)
   - View search results and click to open files

5. **Edit and Preview**
   - Click Markdown file → Opens in preview mode by default
   - Click **Markdown** button in top-right to switch to edit mode
   - Click **Preview** button in top-right to switch back to preview

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Markdown Preview | `Cmd+Shift+V` |
| Return to Editor from Preview | `Cmd+E` |

## Context Menu Features

Right-click on files or folders in the page tree:

- **New Note** - Create new Markdown file in current directory
- **New Folder** - Create new folder in current directory
- **Rename** - Rename file/folder
- **Delete** - Delete file/folder
- **Reveal in Finder** - Open system file manager
- **Copy Absolute Path** - Copy full file path
- **Copy Relative Path** - Copy path relative to workspace
- **Copy File** - Create file copy (auto-named)

## Search Tips

| Input | Description | Result |
|-------|-------------|--------|
| `project` | Single keyword | All notes containing "project" |
| `project plan` | Multi-keyword (AND) | Notes containing both "project" and "plan" |
| `project plan` (no AND results) | Smart fallback (OR) | Notes containing "project" or "plan" |

## Configuration

Search for "knowledgeBase" in VS Code settings to configure:

| Config | Type | Default | Description |
|--------|------|---------|-------------|
| `knowledgeBase.filterMode` | string | `"markdown"` | Page tree file filter mode |
| `knowledgeBase.markdownExtensions` | array | `[".md", ".markdown", ".mdx"]` | Recognized Markdown file extensions |
| `knowledgeBase.autoReveal` | boolean | `true` | Auto reveal current file in page tree |

## Languages

- [简体中文](./README.md)
- [English](./README_EN.md)

## License

MIT

Cora — Making knowledge management as efficient as coding.
