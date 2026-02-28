import * as vscode from 'vscode';
import type { ConfigService } from '../services/configService';
import { CONTEXT_PAGE_TREE_VIEW_LAYOUT } from './constants';

/** 同步页面树「树状/平铺」状态，供 view/title 切换按钮显示对应图标。 */
export function syncPageTreeViewLayoutContext(configService: ConfigService): void {
    const mode = configService.getPageViewMode();
    const layout = mode === 'flat' ? 'flat' : 'tree';
    void vscode.commands.executeCommand('setContext', CONTEXT_PAGE_TREE_VIEW_LAYOUT, layout);
}
