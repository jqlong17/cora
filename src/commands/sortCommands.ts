import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { SortOrder } from '../utils/constants';

export async function setSortOrder(configService: ConfigService, pageTreeProvider: PageTreeProvider): Promise<void> {
    const currentOrder = configService.getSortOrder();

    const items: (vscode.QuickPickItem & { value: SortOrder })[] = [
        { label: '文件名 (A-Z)', value: 'nameAsc', picked: currentOrder === 'nameAsc' },
        { label: '文件名 (Z-A)', value: 'nameDesc', picked: currentOrder === 'nameDesc' },
        { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'nameAsc' },
        { label: '编辑时间 (从新到旧)', value: 'mtimeDesc', picked: currentOrder === 'mtimeDesc' },
        { label: '编辑时间 (从旧到新)', value: 'mtimeAsc', picked: currentOrder === 'mtimeAsc' },
        { label: '', kind: vscode.QuickPickItemKind.Separator, value: 'nameAsc' },
        { label: '创建时间 (从新到旧)', value: 'ctimeDesc', picked: currentOrder === 'ctimeDesc' },
        { label: '创建时间 (从旧到新)', value: 'ctimeAsc', picked: currentOrder === 'ctimeAsc' }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择排序方式',
        title: '排序'
    });

    if (selected) {
        await configService.setSortOrder(selected.value);
        pageTreeProvider.refresh();
    }
}
