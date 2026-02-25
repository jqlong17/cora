import * as vscode from 'vscode';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { ConfigService } from '../services/configService';
import { PageViewMode } from '../utils/constants';

export async function setPageViewMode(
    mode: PageViewMode,
    configService: ConfigService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    await configService.setPageViewMode(mode);
    pageTreeProvider.refresh();
}
