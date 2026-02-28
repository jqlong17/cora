import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigService } from '../../services/configService';
import { CONFIG_KEYS } from '../../utils/constants';
suite('ConfigService page tree Test Suite', () => {
    test('getPageViewMode returns tree, flat, or favorites', async () => {
        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const original = config.get<string>(CONFIG_KEYS.PAGE_VIEW_MODE);
        try {
            const service = new ConfigService();
            await config.update(CONFIG_KEYS.PAGE_VIEW_MODE, 'tree', true);
            service.reload();
            assert.strictEqual(service.getPageViewMode(), 'tree');
            await config.update(CONFIG_KEYS.PAGE_VIEW_MODE, 'flat', true);
            service.reload();
            assert.strictEqual(service.getPageViewMode(), 'flat');
            await config.update(CONFIG_KEYS.PAGE_VIEW_MODE, 'favorites', true);
            service.reload();
            assert.strictEqual(service.getPageViewMode(), 'favorites');
        } finally {
            if (original !== undefined) {
                await config.update(CONFIG_KEYS.PAGE_VIEW_MODE, original, true);
            }
        }
    });

    test('setPageViewMode accepts tree, flat, or favorites', async () => {
        const config = vscode.workspace.getConfiguration('knowledgeBase');
        const original = config.get<string>(CONFIG_KEYS.PAGE_VIEW_MODE);
        try {
            const service = new ConfigService();
            await service.setPageViewMode('tree');
            service.reload();
            assert.strictEqual(service.getPageViewMode(), 'tree');
            await service.setPageViewMode('flat');
            service.reload();
            assert.strictEqual(service.getPageViewMode(), 'flat');
            await service.setPageViewMode('favorites');
            service.reload();
            assert.strictEqual(service.getPageViewMode(), 'favorites');
        } finally {
            if (original !== undefined) {
                await config.update(CONFIG_KEYS.PAGE_VIEW_MODE, original, true);
            }
        }
    });
});
