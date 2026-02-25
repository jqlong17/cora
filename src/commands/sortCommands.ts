import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { SortOrder } from '../utils/constants';
import { t } from '../utils/i18n';

export async function setSortOrder(configService: ConfigService, pageTreeProvider: PageTreeProvider): Promise<void> {
    const currentOrder = configService.getSortOrder();

    const items: (vscode.QuickPickItem & { value: SortOrder })[] = [
        { label: t('sort.nameAsc'), value: 'nameAsc', picked: currentOrder === 'nameAsc' },
        { label: t('sort.nameDesc'), value: 'nameDesc', picked: currentOrder === 'nameDesc' },
        { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'nameAsc' },
        { label: t('sort.mtimeDesc'), value: 'mtimeDesc', picked: currentOrder === 'mtimeDesc' },
        { label: t('sort.mtimeAsc'), value: 'mtimeAsc', picked: currentOrder === 'mtimeAsc' },
        { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'nameAsc' },
        { label: t('sort.ctimeDesc'), value: 'ctimeDesc', picked: currentOrder === 'ctimeDesc' },
        { label: t('sort.ctimeAsc'), value: 'ctimeAsc', picked: currentOrder === 'ctimeAsc' }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: t('sort.placeHolder'),
        title: t('sort.title')
    });

    if (selected) {
        await configService.setSortOrder(selected.value);
        pageTreeProvider.refresh();
    }
}
