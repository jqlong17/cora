import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { PageViewMode } from '../utils/constants';

export async function togglePageView(
    configService: ConfigService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const currentMode = configService.getPageViewMode();
    // 仅在树状/平铺间切换；当前为收藏时点击无效，避免误切到「全部文件」
    if (currentMode === 'favorites') {
        return;
    }
    const newMode: PageViewMode = currentMode === 'flat' ? 'tree' : 'flat';
    await configService.setPageViewMode(newMode);
    pageTreeProvider.refresh();
}
