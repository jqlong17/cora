# Changelog

## [0.1.10] - 2026-02-25

### Fixed

* **Mermaid in preview**: Mermaid code blocks (e.g. `sequenceDiagram`) that did not render as diagrams in preview mode are now fixed. Marked-only preview loads and renders Mermaid correctly, matching Milkdown edit mode. Language tag is case-insensitive (`mermaid` / `Mermaid` etc.).

### Improved

* **Language & Cursor**: UI language follows VS Code / Cursor; i18n comments note that Cursor uses the same `vscode.env.language` API for consistency.

## [0.1.9] - 2026-02-25

### Added

* **Favorites**: Page tree supports favoriting Markdown files. In tree or flat view, hover or right-click to add/remove favorites; favorited items show a star. New **Favorites** view mode lists only favorited files; favorites are persisted per workspace.

### Improved

* **Page tree toolbar**: Replaced single “toggle flat/tree” with separate buttons, in order: Tree (default), Flat, Favorites, Sort, Filter, Refresh, New note, New folder. Flat uses a grid icon, Favorites uses a star.
* **Preview / Markdown active state**: Active tab background for **Preview** and **Markdown** at the top-right of the editor changed from purple to blue (#1a00ff) to match brand.

## [0.1.5] - 2026-02-25

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

## [0.1.4] - 2026-02-24

### Improved

* **Outline**: H1/H2/H3 labels only; live update while editing; click-to-jump with fallbacks.
* **Preview/Edit**: Toolbar fixed top-right; default panel ratio 50% / 25% / 25%.
* **Page tree**: Default view `tree`; new note/folder with “Will be created at: path”; New folder in title bar.

### Fixed

* Outline not updating after edit; outline not refreshing after save.

### Testing

* E2E: outline refresh after save and live update after edit.

## [0.1.3] - 2024-02-24

### Improved

* Search: softer “Start search” link; filter label “All files / MD only”; removed redundant expand/collapse in tree.
* New icon (white-style).

### Fixed

* Outline “Expand all” and duplicate “Collapse” button; E2E command and outline assertions.

## [0.1.2] - 2024-02-24

### Added

* One-click publish to VS Code Marketplace and Open VSX Registry.

## [0.1.1] - 2024-02-23

### Fixed

* Minor fixes and performance improvements.

## [0.1.0] - 2024-02-23

### Added

* Cora panel (Activity Bar), page tree (filter, new note/folder, rename, delete, expand/collapse), outline (H1–H6, click to jump), database view placeholder, preview-first editing (Cmd+E edit, Cmd+Shift+V preview).
