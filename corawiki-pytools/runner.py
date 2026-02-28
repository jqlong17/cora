#!/usr/bin/env python3
"""
CoraWiki Python tools runner.
Reads one JSON object from stdin: { "tool": "<name>", "args": {...}, "workspacePath": "..." }
Writes one JSON object to stdout: { "ok": true, "result": ... } or { "ok": false, "error": "..." }
"""
import json
import os
import re
import sys
import ast as py_ast
from pathlib import Path


def _read_stdin():
    raw = sys.stdin.read()
    return json.loads(raw) if raw.strip() else {}


def _write_stdout(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def extract_import_graph(file_paths: list, workspace_path: str) -> list:
    """Extract imports from files; classify as local (under workspace) or external."""
    workspace = Path(workspace_path).resolve()
    results = []
    for fp in file_paths:
        path = Path(fp).resolve()
        if not path.exists() or not path.is_file():
            results.append({
                "filePath": fp,
                "imports": [],
                "localDeps": [],
                "externalDeps": [],
                "error": "file not found"
            })
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            results.append({
                "filePath": fp,
                "imports": [],
                "localDeps": [],
                "externalDeps": [],
                "error": str(e)
            })
            continue
        imports = []
        suffix = path.suffix.lower()
        if suffix == ".py":
            imports = _imports_python(text)
        elif suffix in (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"):
            imports = _imports_js_ts(text)
        else:
            results.append({
                "filePath": fp,
                "imports": [],
                "localDeps": [],
                "externalDeps": []
            })
            continue
        local = []
        external = []
        for imp in imports:
            if _is_local_import(imp, path, workspace):
                local.append(imp)
            else:
                external.append(imp)
        results.append({
            "filePath": str(path),
            "imports": imports,
            "localDeps": local,
            "externalDeps": external
        })
    return results


def _imports_python(text: str) -> list:
    out = []
    try:
        tree = py_ast.parse(text)
        for node in py_ast.walk(tree):
            if isinstance(node, py_ast.Import):
                for alias in node.names:
                    out.append(alias.name)
            elif isinstance(node, py_ast.ImportFrom):
                if node.module:
                    out.append(node.module)
    except py_ast.SyntaxError:
        # Fallback: simple regex for "import x" / "from x import"
        for m in re.finditer(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", text, re.MULTILINE):
            out.append(m.group(1) or m.group(2))
    return list(dict.fromkeys(out))


def _imports_js_ts(text: str) -> list:
    out = []
    # require("...") and require('...')
    for m in re.finditer(r'require\s*\(\s*["\']([^"\']+)["\']', text):
        out.append(m.group(1))
    # import x from "..." / import "..." / import { x } from "..."
    for m in re.finditer(r'import\s+.*?\s+from\s+["\']([^"\']+)["\']', text):
        out.append(m.group(1))
    for m in re.finditer(r'import\s+["\']([^"\']+)["\']', text):
        out.append(m.group(1))
    return list(dict.fromkeys(out))


def _is_local_import(imp: str, file_path: Path, workspace: Path) -> bool:
    # Relative-like (starts with . or ..) or under workspace as path
    if imp.startswith(".") or imp.startswith(".."):
        return True
    # Resolve as path under workspace (e.g. "src/foo" -> workspace/src/foo)
    candidate = workspace / imp.replace("/", os.sep)
    if candidate.exists():
        return True
    # With extensions
    for ext in (".ts", ".tsx", ".js", ".jsx", ".py", "/index.ts", "/index.js"):
        if (workspace / (imp + ext)).exists():
            return True
    return False


def analyze_complexity(file_paths: list, workspace_path: str) -> list:
    """Cyclomatic complexity and optional maintainability; Python only with radon if available."""
    results = []
    try:
        from radon.complexity import cc_visit
        from radon.metrics import mi_visit
        has_radon = True
    except ImportError:
        has_radon = False
    for fp in file_paths:
        path = Path(fp).resolve()
        if not path.exists() or not path.is_file():
            results.append({"filePath": fp, "complexity": [], "maintainability_index": None, "error": "file not found"})
            continue
        suffix = path.suffix.lower()
        if suffix != ".py":
            results.append({
                "filePath": str(path),
                "complexity": [],
                "maintainability_index": None,
                "note": "complexity only supported for Python files"
            })
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            results.append({"filePath": fp, "complexity": [], "maintainability_index": None, "error": str(e)})
            continue
        if has_radon:
            try:
                blocks = cc_visit(text)
                complexity = [{"name": b.name, "complexity": b.complexity, "line": b.lineno} for b in blocks]
                mi = mi_visit(text, True)
                results.append({
                    "filePath": str(path),
                    "complexity": complexity,
                    "maintainability_index": round(mi, 2)
                })
            except Exception as e:
                results.append({"filePath": str(path), "complexity": [], "maintainability_index": None, "error": str(e)})
        else:
            # Fallback: rough cyclomatic count (if/elif/else/for/while/and/or/try/except/with)
            rough = _rough_cyclomatic(text)
            results.append({
                "filePath": str(path),
                "complexity": [{"name": "(file)", "complexity": rough, "line": 1}],
                "maintainability_index": None,
                "note": "install radon for full metrics"
            })
    return results


def _rough_cyclomatic(text: str) -> int:
    count = 1
    count += len(re.findall(r"\b(?:if|elif|else|for|while|with)\b", text))
    count += len(re.findall(r"\b(?:and|or)\b", text))
    count += len(re.findall(r"\btry\b|\bexcept\b", text))
    return count


def main():
    try:
        payload = _read_stdin()
        tool = payload.get("tool")
        args = payload.get("args") or {}
        workspace_path = payload.get("workspacePath") or os.getcwd()
        if not tool:
            _write_stdout({"ok": False, "error": "missing tool"})
            return
        if tool == "extract_import_graph":
            file_paths = args.get("filePaths") or []
            result = extract_import_graph(file_paths, workspace_path)
            _write_stdout({"ok": True, "result": result})
        elif tool == "analyze_complexity":
            file_paths = args.get("filePaths") or []
            result = analyze_complexity(file_paths, workspace_path)
            _write_stdout({"ok": True, "result": result})
        else:
            _write_stdout({"ok": False, "error": f"unknown tool: {tool}"})
    except Exception as e:
        _write_stdout({"ok": False, "error": str(e)})
        sys.exit(1)


if __name__ == "__main__":
    main()
