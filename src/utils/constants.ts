export const EXTENSION_NAME = 'knowledgeBase';

export const CONFIG_KEYS = {
    FILTER_MODE: 'filterMode',
    PAGE_VIEW_MODE: 'pageViewMode',
    MARKDOWN_EXTENSIONS: 'markdownExtensions',
    PREVIEW_ON_CLICK: 'previewOnClick',
    AUTO_REVEAL: 'autoReveal',
    SHOW_OUTLINE_FOR_NON_MARKDOWN: 'showOutlineForNonMarkdown',
    SORT_ORDER: 'sortOrder'
} as const;

export const WORKSPACE_STATE_KEYS = {
    FAVORITES: 'knowledgeBase.favorites', // string[] of URI strings
} as const;

export const COMMANDS = {
    REFRESH_PAGE_TREE: `${EXTENSION_NAME}.refreshPageTree`,
    TOGGLE_FILTER: `${EXTENSION_NAME}.toggleFilter`,
    TOGGLE_PAGE_VIEW: `${EXTENSION_NAME}.togglePageView`,
    SET_PAGE_VIEW_MODE: `${EXTENSION_NAME}.setPageViewMode`,
    TOGGLE_FAVORITE: `${EXTENSION_NAME}.toggleFavorite`,
    SET_SORT_ORDER: `${EXTENSION_NAME}.setSortOrder`,
    SHOW_ALL_FILES: `${EXTENSION_NAME}.showAllFiles`,
    SHOW_MARKDOWN_ONLY: `${EXTENSION_NAME}.showMarkdownOnly`,
    OPEN_PREVIEW: `${EXTENSION_NAME}.openPreview`,
    OPEN_EDITOR: `${EXTENSION_NAME}.openEditor`,
    NEW_NOTE: `${EXTENSION_NAME}.newNote`,
    NEW_FOLDER: `${EXTENSION_NAME}.newFolder`,
    DELETE_ITEM: `${EXTENSION_NAME}.deleteItem`,
    RENAME_ITEM: `${EXTENSION_NAME}.renameItem`,
    OUTLINE_COLLAPSE_ALL: `${EXTENSION_NAME}.outlineCollapseAll`,
    OUTLINE_EXPAND_ALL: `${EXTENSION_NAME}.outlineExpandAll`,
    GOTO_HEADING: `${EXTENSION_NAME}.gotoHeading`
} as const;

export const VIEWS = {
    PAGE_TREE: 'pageTree',
    OUTLINE: 'outline',
    DATABASE: 'database'
} as const;

export const DEFAULT_MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.mdx'];

export const HEADING_REGEX = /^(#{1,6})\s+(.+)$/gm;

export type FilterMode = 'all' | 'markdown';

export type PageViewMode = 'flat' | 'tree' | 'favorites';

export type SortOrder =
    | 'nameAsc'         // 文件名 (A-Z)
    | 'nameDesc'        // 文件名 (Z-A)
    | 'mtimeDesc'       // 编辑时间 (从新到旧)
    | 'mtimeAsc'        // 编辑时间 (从旧到新)
    | 'ctimeDesc'       // 创建时间 (从新到旧)
    | 'ctimeAsc';       // 创建时间 (从旧到新)

export interface Heading {
    level: number;
    text: string;
    line: number;
}
