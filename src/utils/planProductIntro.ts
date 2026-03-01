import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

const CONSTRAINTS_FILENAME = '00-PLAN-CONSTRAINTS.md';
const PRODUCT_INTRO_HEADING = '## 产品能力简述';

/**
 * 从约束文档中解析「产品能力简述」段落（从该标题到下一个 ## 或 --- 之前的内容）。
 * 优先读工作区 .cursor/plans/00-PLAN-CONSTRAINTS.md，不存在则读扩展内 resources/plan/00-PLAN-CONSTRAINTS.md。
 */
export async function getPlanProductIntro(
    extensionUri: vscode.Uri,
    workspacePath?: string
): Promise<string | undefined> {
    let raw: string;
    try {
        if (workspacePath) {
            const workspaceFile = path.join(workspacePath, '.cursor', 'plans', CONSTRAINTS_FILENAME);
            raw = await fs.readFile(workspaceFile, 'utf-8');
        } else {
            raw = '';
        }
    } catch {
        raw = '';
    }
    if (!raw.trim()) {
        try {
            const uri = vscode.Uri.joinPath(extensionUri, 'resources', 'plan', CONSTRAINTS_FILENAME);
            const buf = await vscode.workspace.fs.readFile(uri);
            raw = new TextDecoder().decode(buf);
        } catch {
            return undefined;
        }
    }
    return parseProductIntro(raw);
}

function parseProductIntro(content: string): string | undefined {
    const headingIndex = content.indexOf(PRODUCT_INTRO_HEADING);
    if (headingIndex === -1) {
        return undefined;
    }
    const afterHeading = content.slice(headingIndex + PRODUCT_INTRO_HEADING.length);
    const lines: string[] = [];
    for (const line of afterHeading.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith('## ') || trimmed.startsWith('---')) {
            break;
        }
        if (trimmed) {
            lines.push(trimmed);
        }
    }
    // 跳过「本段为…」等维护说明，只保留面向用户的能力文案（通常以 CoraPlan 开头）
    const displayLines = lines.filter(line => !line.startsWith('本段为'));
    const block = displayLines.join(' ').trim();
    return block || undefined;
}
