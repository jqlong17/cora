import * as vscode from 'vscode';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { FavoritesService } from '../services/favoritesService';

export async function toggleFavorite(
    itemOrUri: vscode.TreeItem | vscode.Uri | undefined,
    favoritesService: FavoritesService,
    pageTreeProvider: PageTreeProvider
): Promise<void> {
    const uri = itemOrUri instanceof vscode.Uri
        ? itemOrUri
        : (itemOrUri as vscode.TreeItem | undefined)?.resourceUri;
    if (!uri) {
        return;
    }
    await favoritesService.toggleFavorite(uri);
    pageTreeProvider.refresh();
}
