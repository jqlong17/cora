#!/usr/bin/env node
/**
 * 将 .cursor/plans 与 .cursor/rules 中的约束文档同步到 resources/plan/，
 * 以便打包/发布时扩展内嵌的约束与产品能力描述为最新。
 * 更新约束后请执行: npm run sync-plan
 */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pairs = [
    [path.join(root, '.cursor', 'plans', '00-PLAN-CONSTRAINTS.md'), path.join(root, 'resources', 'plan', '00-PLAN-CONSTRAINTS.md')],
    [path.join(root, '.cursor', 'rules', 'plan-creation.mdc'), path.join(root, 'resources', 'plan', 'plan-creation.mdc')],
];

for (const [src, dest] of pairs) {
    if (!fs.existsSync(src)) {
        console.warn('skip (missing):', src);
        continue;
    }
    fs.copyFileSync(src, dest);
    console.log('synced:', path.relative(root, src), '->', path.relative(root, dest));
}

console.log('done. resources/plan/ is up to date with .cursor/plans and .cursor/rules.');
