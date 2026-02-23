import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { PageViewMode } from '../utils/constants';

export async function togglePageView(
    configService: ConfigService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const currentMode = configService.getPageViewMode();
    const newMode: PageViewMode = currentMode === 'flat' ? 'tree' : 'flat';
    await configService.setPageViewMode(newMode);
    pageTreeProvider.refresh();
    const message = newMode === 'flat' ? '已切换为平铺视图' : '已切换为树形视图';
    vscode.window.showInformationMessage(message);
}
