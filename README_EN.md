# Cora

A Notion-inspired knowledge management plugin for VS Code

## Why Cora?

VS Code and Cursor's interfaces are designed for programming—file tree on the left, editor in the middle, AI chat on the right. This layout works well for coding, but it's not ideal for knowledge management.

Notion excels at knowledge management: hierarchical pages, document outlines, database views. But it lacks VS Code's powerful editing capabilities and AI integration.

Cora combines both:

- 📁 **Page Tree** — Intuitive hierarchical organization like Notion
- 📋 **Outline View** — One-click navigation through document structure
- 🗂️ **Database View** — Transform Markdown files into structured data
- 📝 **Seamless Editing** — Switch back to VS Code's native editor anytime

## Who is it for?

- **Developers who are also knowledge workers** — One tool for both code and notes
- **Non-technical knowledge workers** — Leverage AI-powered programming for more efficient knowledge management

## Use Cases

| Scenario | Traditional Way | Cora Way |
|----------|-----------------|----------|
| Organizing project docs | Nested folder chaos | Hierarchical page tree at a glance |
| Reading long documents | Scroll to find content | Outline navigation, jump to target section instantly |
| Managing knowledge base | Plain text, hard to search | Database view with property filtering |
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
- **Expand/Collapse**: Expand all, collapse all

### 📋 Outline
- **Real-time Following**: Automatically follow the active editor
- **Heading Levels**: Extract H1-H6 heading structure
- **Quick Jump**: Click outline item to jump to corresponding position
- **Hierarchical Indentation**: Clearly show document structure levels

### 🗄️ Database
- **MVP Placeholder**: Current version is a feature placeholder
- **Future Features**: Table/kanban views, frontmatter property management, filtering and sorting

## Quick Start

1. **Open Cora Panel**
   - Click the 📖 Cora icon in the left activity bar
   - Or use shortcut `Cmd+Shift+P` and type "Cora"

2. **Browse Files**
   - View workspace file tree in the [Pages] tab
   - Use top buttons to toggle [All/Markdown] filter mode

3. **Read/Edit Documents**
   - Click Markdown file → Open editor
   - Click the toggle button in editor top-right to enter preview
   - View [Outline] tab for document structure, click to jump

## Languages

- [简体中文](./README.md)
- [English](./README_EN.md)

## License

MIT

Cora — Making knowledge management as efficient as coding.
