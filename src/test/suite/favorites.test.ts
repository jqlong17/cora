import * as assert from 'assert';
import * as vscode from 'vscode';
import { FavoritesService } from '../../services/favoritesService';

function createMockMemento(): vscode.Memento {
    const store: Record<string, unknown> = {};
    return {
        get<T>(key: string, defaultValue?: T): T | undefined {
            if (key in store) {
                return store[key] as T;
            }
            return defaultValue;
        },
        update(key: string, value: unknown): Thenable<void> {
            store[key] = value;
            return Promise.resolve();
        },
        keys(): readonly string[] {
            return Object.keys(store);
        }
    };
}

suite('FavoritesService Unit Tests', () => {
    let service: FavoritesService;
    let memento: vscode.Memento;

    setup(() => {
        memento = createMockMemento();
        service = new FavoritesService(memento);
    });

    test('getFavorites returns empty array initially', () => {
        assert.deepStrictEqual(service.getFavorites(), []);
    });

    test('isFavorite returns false for any uri when empty', () => {
        const uri = vscode.Uri.file('/workspace/foo.md');
        assert.strictEqual(service.isFavorite(uri), false);
    });

    test('addFavorite adds uri and isFavorite returns true', async () => {
        const uri = vscode.Uri.file('/workspace/foo.md');
        await service.addFavorite(uri);
        assert.strictEqual(service.isFavorite(uri), true);
        assert.deepStrictEqual(service.getFavorites(), [uri.toString()]);
    });

    test('addFavorite is idempotent', async () => {
        const uri = vscode.Uri.file('/workspace/foo.md');
        await service.addFavorite(uri);
        await service.addFavorite(uri);
        assert.strictEqual(service.getFavorites().length, 1);
    });

    test('removeFavorite removes uri', async () => {
        const uri = vscode.Uri.file('/workspace/foo.md');
        await service.addFavorite(uri);
        await service.removeFavorite(uri);
        assert.strictEqual(service.isFavorite(uri), false);
        assert.deepStrictEqual(service.getFavorites(), []);
    });

    test('removeFavorite on non-favorite is no-op', async () => {
        const uri = vscode.Uri.file('/workspace/foo.md');
        await service.removeFavorite(uri);
        assert.deepStrictEqual(service.getFavorites(), []);
    });

    test('toggleFavorite adds when not favorite, returns true', async () => {
        const uri = vscode.Uri.file('/workspace/foo.md');
        const added = await service.toggleFavorite(uri);
        assert.strictEqual(added, true);
        assert.strictEqual(service.isFavorite(uri), true);
    });

    test('toggleFavorite removes when favorite, returns false', async () => {
        const uri = vscode.Uri.file('/workspace/foo.md');
        await service.addFavorite(uri);
        const added = await service.toggleFavorite(uri);
        assert.strictEqual(added, false);
        assert.strictEqual(service.isFavorite(uri), false);
    });

    test('persistence: new service instance with same memento sees same data', async () => {
        const uri = vscode.Uri.file('/workspace/bar.md');
        await service.addFavorite(uri);
        const service2 = new FavoritesService(memento);
        assert.strictEqual(service2.isFavorite(uri), true);
        assert.deepStrictEqual(service2.getFavorites(), [uri.toString()]);
    });
});
