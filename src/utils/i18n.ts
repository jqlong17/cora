import * as vscode from 'vscode';

/**
 * 界面语言：与 VS Code / Cursor 一致。
 * Cursor 基于 VS Code，使用同一套 API，语言由 vscode.env.language 决定（如 zh-cn、en）。
 * 若在非 VS Code 环境中运行，可在此处增加 fallback（如 process.env.VSCODE_NLS_CONFIG）。
 */
const lang = vscode.env.language;
export const isChinese = (): boolean =>
    lang === 'zh-cn' || lang === 'zh-tw';

export type Messages = Record<string, Record<string, string>>;

const zh: Messages = {
    common: {
        openPreview: '打开预览',
        openFile: '打开文件',
        copyPath: '复制绝对路径',
        copyRelativePath: '复制相对路径',
    },
    msg: {
        revealFailed: '无法在 Finder 中打开',
        copiedAbsolutePath: '已复制绝对路径到剪贴板',
        copiedAbsolutePathMulti: '已复制 {n} 个文件的绝对路径',
        copyPathFailed: '复制路径失败',
        copiedRelativePath: '已复制相对路径到剪贴板',
        copiedRelativePathMulti: '已复制 {n} 个文件的相对路径',
        copyRelativePathFailed: '复制相对路径失败',
        copyFileSuffix: '副本',
        copyFileSuffixWithNum: '副本 {n}',
        copiedFile: '已复制文件: {name}',
        copyFileFailed: '复制文件失败',
        noWorkspace: '请先打开一个工作区',
        noMatch: '未找到匹配的笔记',
        noMatchFallback: '未找到同时包含所有关键词的文件，显示包含任一关键词的 {n} 个结果',
        expandAllLater: '全部展开功能将在后续版本优化',
        noActiveEditor: '没有活动的编辑器',
        selectFileFirst: '请先选择一个文件',
        openFileFirst: '请先打开一个文件',
        unknownFile: '无法识别当前文件',
    },
    search: {
        prompt: '输入搜索关键词',
        placeHolder: '支持单个关键词或多个关键词（空格分隔）',
        cleared: '搜索结果已清空',
        matchCount: '匹配次数',
        matches: '{n} 处匹配',
    },
    sort: {
        title: '排序',
        placeHolder: '选择排序方式',
        nameAsc: '文件名 (A-Z)',
        nameDesc: '文件名 (Z-A)',
        mtimeDesc: '编辑时间 (从新到旧)',
        mtimeAsc: '编辑时间 (从旧到新)',
        ctimeDesc: '创建时间 (从新到旧)',
        ctimeAsc: '创建时间 (从旧到新)',
    },
    outline: {
        gotoHeading: '跳转到标题',
    },
    display: {
        fontFamily: '字体系列',
        fontSize: '字号',
        lineHeightPreview: '行间距（预览）',
        lineHeightSource: '行间距（Markdown）',
        current: '当前',
        selectOne: '选择一项即可生效',
        settingsTitle: '显示设置',
        compact: '紧凑',
        default: '默认',
        relaxed: '宽松',
        previewLabel: '预览',
        markdownLabel: 'Markdown',
        linePreset1_2: '1.2（紧凑）',
        linePreset1_35: '1.35',
        linePreset1_5: '1.5（默认）',
        linePreset1_6: '1.6',
        linePreset2: '2.0（宽松）',
    },
    preview: {
        tabPreview: '预览',
        tabMarkdown: 'Markdown',
        loadError: '无法加载编辑器资源',
        lineRefSingle: '第{n}行',
        lineRefRange: '第{start}-{end}行',
    },
    newNote: {
        untitledPrefix: '未命名笔记',
        prompt: '输入笔记文件名',
        createAt: '将创建于',
        nameRequired: '文件名不能为空',
        created: '已创建笔记',
        createFailed: '创建笔记失败',
    },
    newFolder: {
        prompt: '输入文件夹名称',
        createAt: '将创建于',
        nameRequired: '文件夹名称不能为空',
        created: '已创建文件夹',
        createFailed: '创建文件夹失败',
    },
    fileOp: {
        folder: '文件夹',
        file: '文件',
        deleteConfirm: '确定要删除{type} "{name}" 吗？',
        delete: '删除',
        deleted: '已删除{type}',
        deleteFailed: '删除{type}失败',
        renamePrompt: '重命名{type}',
        nameRequired: '名称不能为空',
        nameSame: '新名称不能与旧名称相同',
        renamed: '已重命名为',
        renameFailed: '重命名失败',
    },
};

const en: Messages = {
    common: {
        openPreview: 'Open Preview',
        openFile: 'Open File',
        copyPath: 'Copy Absolute Path',
        copyRelativePath: 'Copy Relative Path',
    },
    msg: {
        revealFailed: 'Failed to open in Finder',
        copiedAbsolutePath: 'Absolute path copied to clipboard',
        copiedAbsolutePathMulti: 'Copied absolute path of {n} file(s)',
        copyPathFailed: 'Failed to copy path',
        copiedRelativePath: 'Relative path copied to clipboard',
        copiedRelativePathMulti: 'Copied relative path of {n} file(s)',
        copyRelativePathFailed: 'Failed to copy relative path',
        copyFileSuffix: 'copy',
        copyFileSuffixWithNum: 'copy {n}',
        copiedFile: 'File copied: {name}',
        copyFileFailed: 'Failed to copy file',
        noWorkspace: 'Please open a workspace first',
        noMatch: 'No matching notes found',
        noMatchFallback: 'No files contain all keywords; showing {n} result(s) with any keyword',
        expandAllLater: 'Expand all will be improved in a later version',
        noActiveEditor: 'No active editor',
        selectFileFirst: 'Please select a file first',
        openFileFirst: 'Please open a file first',
        unknownFile: 'Cannot identify current file',
    },
    search: {
        prompt: 'Enter search keyword(s)',
        placeHolder: 'Single keyword or multiple keywords (space-separated)',
        cleared: 'Search results cleared',
        matchCount: 'Match count',
        matches: '{n} match(es)',
    },
    sort: {
        title: 'Sort',
        placeHolder: 'Choose sort order',
        nameAsc: 'Name (A-Z)',
        nameDesc: 'Name (Z-A)',
        mtimeDesc: 'Modified (newest first)',
        mtimeAsc: 'Modified (oldest first)',
        ctimeDesc: 'Created (newest first)',
        ctimeAsc: 'Created (oldest first)',
    },
    outline: {
        gotoHeading: 'Go to Heading',
    },
    display: {
        fontFamily: 'Font family',
        fontSize: 'Font size',
        lineHeightPreview: 'Line height (Preview)',
        lineHeightSource: 'Line height (Markdown)',
        current: 'Current',
        selectOne: 'Select one to apply',
        settingsTitle: 'Display settings',
        compact: 'Compact',
        default: 'Default',
        relaxed: 'Relaxed',
        previewLabel: 'Preview',
        markdownLabel: 'Markdown',
        linePreset1_2: '1.2 (Compact)',
        linePreset1_35: '1.35',
        linePreset1_5: '1.5 (Default)',
        linePreset1_6: '1.6',
        linePreset2: '2.0 (Relaxed)',
    },
    preview: {
        tabPreview: 'Preview',
        tabMarkdown: 'Markdown',
        loadError: 'Failed to load editor resources',
        lineRefSingle: 'line {n}',
        lineRefRange: 'lines {start}-{end}',
    },
    newNote: {
        untitledPrefix: 'Untitled note',
        prompt: 'Enter note filename',
        createAt: 'Will be created in',
        nameRequired: 'File name cannot be empty',
        created: 'Note created',
        createFailed: 'Failed to create note',
    },
    newFolder: {
        prompt: 'Enter folder name',
        createAt: 'Will be created in',
        nameRequired: 'Folder name cannot be empty',
        created: 'Folder created',
        createFailed: 'Failed to create folder',
    },
    fileOp: {
        folder: 'folder',
        file: 'file',
        deleteConfirm: 'Delete {type} "{name}"?',
        delete: 'Delete',
        deleted: 'Deleted {type}',
        deleteFailed: 'Failed to delete {type}',
        renamePrompt: 'Rename {type}',
        nameRequired: 'Name cannot be empty',
        nameSame: 'New name must be different',
        renamed: 'Renamed to',
        renameFailed: 'Rename failed',
    },
};

const messages: Messages = isChinese() ? zh : en;

function interpolate(s: string, vars: Record<string, string | number>): string {
    return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** Get a message by key path, e.g. t('msg.copiedAbsolutePath') or t('search.matches', { n: 3 }) */
export function t(key: string, vars?: Record<string, string | number>): string {
    const parts = key.split('.');
    let v: unknown = messages;
    for (const p of parts) {
        v = (v as Record<string, unknown>)?.[p];
    }
    const s = typeof v === 'string' ? v : key;
    return vars ? interpolate(s, vars) : s;
}

export { messages };
