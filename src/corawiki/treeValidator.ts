import type { CodeNode } from './types';

export interface TreeValidationIssue {
    nodeId: string;
    path: string;
    message: string;
}

export interface TreeValidationResult {
    ok: boolean;
    issues: TreeValidationIssue[];
}

function visit(node: CodeNode, fn: (node: CodeNode) => void): void {
    fn(node);
    for (const child of node.children) {
        visit(child, fn);
    }
}

export function verifyTree(tree: CodeNode): TreeValidationResult {
    const issues: TreeValidationIssue[] = [];
    const nodeIds = new Set<string>();

    visit(tree, (node) => {
        if (!node.nodeId) {
            issues.push({ nodeId: '', path: node.path, message: 'missing nodeId' });
        } else if (nodeIds.has(node.nodeId)) {
            issues.push({ nodeId: node.nodeId, path: node.path, message: 'duplicate nodeId' });
        } else {
            nodeIds.add(node.nodeId);
        }

        if (!node.path) {
            issues.push({ nodeId: node.nodeId, path: '', message: 'missing path' });
        }
        if (!node.name) {
            issues.push({ nodeId: node.nodeId, path: node.path, message: 'missing name' });
        }
        if (node.type === 'file' && !node.hash) {
            issues.push({ nodeId: node.nodeId, path: node.path, message: 'file node missing hash' });
        }
    });

    return { ok: issues.length === 0, issues };
}

export function repairTree(tree: CodeNode): CodeNode {
    let idx = 0;
    const seen = new Set<string>();

    function repairNode(node: CodeNode): CodeNode {
        idx += 1;
        const fallbackId = `repair_${String(idx).padStart(6, '0')}`;
        const nodeId = node.nodeId && !seen.has(node.nodeId) ? node.nodeId : fallbackId;
        seen.add(nodeId);

        const repaired: CodeNode = {
            ...node,
            nodeId,
            name: node.name || node.path || `node-${idx}`,
            path: node.path || '',
            hash: node.type === 'file' ? node.hash ?? 'unknown' : node.hash,
            children: node.children.map(repairNode)
        };
        return repaired;
    }

    return repairNode(tree);
}

