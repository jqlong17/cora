import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { FilterMode } from '../utils/constants';

export async function toggleFilter(
    configService: ConfigService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const currentMode = configService.getFilterMode();
    const newMode: FilterMode = currentMode === 'all' ? 'markdown' : 'all';

    await setFilterMode(newMode, configService, pageTreeProvider);
}

export async function setFilterMode(
    mode: FilterMode,
    configService: ConfigService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    await configService.setFilterMode(mode);
    pageTreeProvider.refresh();

    const message = mode === 'all' ? '已切换为显示全部文件' : '已切换为仅显示 Markdown 文件';
    vscode.window.showInformationMessage(message);
}
