import * as path from 'path';

/** 解析 command:commandId?queryArgs 形式的链接，返回命令 id 与参数（用于单元测试与 preview 消息处理） */
export function parseCommandUri(href: string): { commandId: string; args: unknown[] } | null {
    const trimmed = href.trim();
    if (!trimmed.startsWith('command:')) return null;
    const rest = trimmed.slice(8);
    const q = rest.indexOf('?');
    const commandId = q >= 0 ? rest.slice(0, q).trim() : rest.trim();
    if (!commandId) return null;
    let args: unknown[] = [];
    if (q >= 0 && rest.length > q + 1) {
        try {
            const decoded = decodeURIComponent(rest.slice(q + 1));
            const parsed = JSON.parse(decoded);
            args = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
            args = [rest.slice(q + 1)];
        }
    }
    return { commandId, args };
}

const HASH_LINE_REGEX = /^#?L?(\d+)(?:-L?\d+)?$/i;

/** 从 href 的 hash 部分解析行号（#L5、#L5-L10、#5 等） */
export function parseLineFromHash(href: string): number | undefined {
    if (!href.includes('#')) return undefined;
    const hashPart = href.split('#')[1]?.trim() ?? '';
    const m = HASH_LINE_REGEX.exec(hashPart);
    return m ? parseInt(m[1], 10) : undefined;
}

/**
 * 解析 file:// 或相对路径的链接，得到绝对路径与可选行号。
 * baseDir 用于解析相对路径；file:// 时 baseDir 未使用。
 */
export function parseFileLink(
    href: string,
    baseDir: string
): { resolvedPath: string; line?: number } | null {
    const trimmed = href.trim();
    const isFile = trimmed.startsWith('file://');
    const isRelative =
        !/^[\w+.-]+:/.test(trimmed) && !trimmed.startsWith('//');
    if (!isFile && !isRelative) return null;

    let resolvedPath: string;
    if (isFile) {
        try {
            const u = new URL(trimmed);
            const decodedPath = decodeURIComponent(u.pathname);
            if (decodedPath.match(/^\/[A-Za-z]:/)) {
                resolvedPath = decodedPath.slice(1).replace(/\//g, path.sep);
            } else {
                resolvedPath = path.resolve(decodedPath);
            }
        } catch {
            return null;
        }
    } else {
        const [pathPart, _hashPart] = trimmed.split('#');
        resolvedPath = path.resolve(baseDir, pathPart || '.');
    }
    const line = parseLineFromHash(trimmed);
    return { resolvedPath, line: line != null && line > 0 ? line : undefined };
}

/**
 * Mermaid 弹窗“填满留边”的缩放比例（纯函数，便于单测）：
 * 内容区 (containerW x containerH)，当前内容 (contentW x contentH)，留边比例 marginRatio (默认 0.9)。
 */
export function computeMermaidFitScale(
    containerW: number,
    containerH: number,
    contentW: number,
    contentH: number,
    marginRatio: number = 0.9
): number {
    if (containerW <= 0 || containerH <= 0 || contentW <= 0 || contentH <= 0)
        return 1;
    const scale = Math.min(containerW / contentW, containerH / contentH) * marginRatio;
    return Math.max(0.25, Math.min(3, scale));
}

/**
 * 从 mermaidDownloadPng 消息的 dataUrl 中提取 base64 内容（用于写入前解码）。
 * 返回 null 表示无效或非 PNG base64。
 */
export function extractPngBase64FromDataUrl(dataUrl: string): string | null {
    if (typeof dataUrl !== 'string' || dataUrl.length < 100) return null;
    const replaced = dataUrl.replace(/^data:image\/png;base64,/i, '').replace(/\s/g, '');
    return replaced.length > 0 ? replaced : null;
}
