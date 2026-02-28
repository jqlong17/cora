import { ConfigService } from '../services/configService';
import { PageTreeProvider } from '../providers/pageTreeProvider';
import { FilterMode } from '../utils/constants';
import { syncPageTreeViewLayoutContext } from '../utils/pageTreeContext';

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
    // 若当前在收藏视图，先切回树状视图，否则仅改 filter 不会生效（getChildren 仍走 favorites 分支）
    const pageViewMode = configService.getPageViewMode();
    if (pageViewMode === 'favorites') {
        await configService.setPageViewMode('tree');
        syncPageTreeViewLayoutContext(configService);
    }
    await configService.setFilterMode(mode);
    pageTreeProvider.refresh();
}
