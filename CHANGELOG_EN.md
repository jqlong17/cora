# Changelog

## \[0.2.0] - 2026-03-01

### Added (experimental)

* **CoraWiki**: Uses AI to analyze the workspace directory and produce structured architecture reports. One-click “Start architecture analysis for current workspace”; file references in reports are clickable to jump to code. Supports OpenAI, Minimax, Kimi, OpenRouter; configure Provider, Model, and API key env in Settings. View includes a usage entry and empty-state intro.

* **CoraPlan**: Constrained Plan-writing methodology (DDD/TDD, completion criteria and acceptance up front) to reduce hallucination and human acceptance overhead via tests. “Set up CoraPlan in this workspace” injects constraints and templates into `.cursor/plans`; recommended to have AI generate and run plans from constraints in Agent mode. View offers open constraints, README registry, and usage entry; empty-state copy is read dynamically from the constraints doc.

## \[0.1.11] - 2026-02-26

### Documentation

* **Product positioning update**: Cora is now described as a “read, find, understand, plan” companion for Cursor / AI-assisted coding. README and extension description updated with Cora and AI-assisted coding, CoraWiki, and Plan writing constraints; closing slogan and Roadmap aligned.

### Added

* **Markdown opens with Cora preview by default**: When “Open preview when clicking a file” is enabled, opening `.md` / `.markdown` / `.mdx` from Cursor chat links or the file explorer uses Cora preview instead of the built-in editor. Implemented via Custom Editor registration and syncing `workbench.editorAssociations`; disabling the option restores the default editor.

### Improved

* **Page tree and flat view performance**: Tree expansion now uses `Promise.all` to stat directory entries in parallel, reducing sequential wait. Flat view caches the file list (key: workspace + sort + filter) with a 30s TTL; cache is cleared on refresh, config change, or file create/delete/rename. `.git` is skipped during recursive collect. List response is faster when switching flat/tree or refreshing, especially in large workspaces.

## \[0.1.10] - 2026-02-25

### Fixed

* **Mermaid in preview**: Mermaid code blocks (e.g. `sequenceDiagram`) that did not render as diagrams in preview mode are now fixed. Marked-only preview loads and renders Mermaid correctly, matching Milkdown edit mode. Language tag is case-insensitive (`mermaid` / `Mermaid` etc.).

### Improved

* **Language & Cursor**: UI language follows VS Code / Cursor; i18n comments note that Cursor uses the same `vscode.env.language` API for consistency.

## \[0.1.9] - 2026-02-25

### Added

* **Favorites**: Page tree supports favoriting Markdown files. In tree or flat view, hover or right-click to add/remove favorites; favorited items show a star. New **Favorites** view mode lists only favorited files; favorites are persisted per workspace.

### Improved

* **Page tree toolbar**: Replaced single “toggle flat/tree” with separate buttons, in order: Tree (default), Flat, Favorites, Sort, Filter, Refresh, New note, New folder. Flat uses a grid icon, Favorites uses a star.

* **Preview / Markdown active state**: Active tab background for **Preview** and **Markdown** at the top-right of the editor changed from purple to blue (#1a00ff) to match brand.

## \[0.1.5] - 2026-02-25

### Added

* **Multi-font system**: Four fonts available via the Aa icon or settings:

  * **Cascadia Mono** (default): Fast, clear monospace

  * **Google Sans**: Modern rounded sans-serif

  * **IBM Plex Mono**: Clear industrial monospace

  * **Noto Sans SC**: Elegant CJK body text

* **Editor font size**: 12px–30px in settings.

* **Unified navigation**: Outline and Search open in Cora’s dual-mode editor with line-based scroll.

* **Markdown · Add to Chat**: In source (Markdown) mode, selecting text shows “Add to Chat ⌘L”; sends file + line range to Cursor/VS Code chat (e.g. `plan.md (line 5)`, `plan.md (lines 3–5)`).

* **Display settings**: Font family, size, line height (preview / Markdown) in one list; `knowledgeBase.lineHeightPreview`, `knowledgeBase.lineHeightSource`.

### Improved

* **UI**: Title bar “Display settings” for font family, size, line height.

* **Editor**: Milkdown-based WYSIWYG; smoother mode switching and content sync.

## \[0.1.4] - 2026-02-24

### Improved

* **Outline**: H1/H2/H3 labels only; live update while editing; click-to-jump with fallbacks.

* **Preview/Edit**: Toolbar fixed top-right; default panel ratio 50% / 25% / 25%.

* **Page tree**: Default view `tree`; new note/folder with “Will be created at: path”; New folder in title bar.

### Fixed

* Outline not updating after edit; outline not refreshing after save.

### Testing

* E2E: outline refresh after save and live update after edit.

## \[0.1.3] - 2024-02-24

### Improved

* Search: softer “Start search” link; filter label “All files / MD only”; removed redundant expand/collapse in tree.

* New icon (white-style).

### Fixed

* Outline “Expand all” and duplicate “Collapse” button; E2E command and outline assertions.

## \[0.1.2] - 2024-02-24

### Added

* One-click publish to VS Code Marketplace and Open VSX Registry.

## \[0.1.1] - 2024-02-23

### Fixed

* Minor fixes and performance improvements.

## \[0.1.0] - 2024-02-23

### Added

* Cora panel (Activity Bar), page tree (filter, new note/folder, rename, delete, expand/collapse), outline (H1–H6, click to jump), database view placeholder, preview-first editing (Cmd+E edit, Cmd+Shift+V preview).
