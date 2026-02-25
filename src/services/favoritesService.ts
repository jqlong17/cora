import * as vscode from 'vscode';
import { WORKSPACE_STATE_KEYS } from '../utils/constants';

/**
 * 管理当前工作区的收藏 MD 文件列表，持久化到 workspaceState。
 * 增删后调用方需自行调用 pageTreeProvider.refresh() 以实时刷新界面。
 */
export class FavoritesService {
    constructor(private readonly workspaceState: vscode.Memento) {}

    private getStorageKey(): string {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            return WORKSPACE_STATE_KEYS.FAVORITES;
        }
        return `${WORKSPACE_STATE_KEYS.FAVORITES}:${folder.uri.toString()}`;
    }

    private getList(): string[] {
        const key = this.getStorageKey();
        const raw = this.workspaceState.get<string[]>(key);
        return Array.isArray(raw) ? raw : [];
    }

    private async setList(uris: string[]): Promise<void> {
        await this.workspaceState.update(this.getStorageKey(), uris);
    }

    isFavorite(uri: vscode.Uri): boolean {
        const normalized = uri.toString();
        return this.getList().includes(normalized);
    }

    getFavorites(): string[] {
        return [...this.getList()];
    }

    async addFavorite(uri: vscode.Uri): Promise<void> {
        const normalized = uri.toString();
        const list = this.getList();
        if (list.includes(normalized)) {
            return;
        }
        list.push(normalized);
        await this.setList(list);
    }

    async removeFavorite(uri: vscode.Uri): Promise<void> {
        const normalized = uri.toString();
        const list = this.getList().filter(s => s !== normalized);
        await this.setList(list);
    }

    async toggleFavorite(uri: vscode.Uri): Promise<boolean> {
        if (this.isFavorite(uri)) {
            await this.removeFavorite(uri);
            return false;
        }
        await this.addFavorite(uri);
        return true;
    }
}
