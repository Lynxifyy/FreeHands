#!/usr/bin/env python3
"""FreeHands coding-tools MCP server.

A dependency-light stdio MCP server that gives the agent real repository
inspection and delivery tools: git, tests/lint/build, dependency and secret
audits, code intelligence, file edits, HTTP/port probes, and Mobilebox phone
control with a live-view link.

The workspace is ``FREEFHANDS_WORKSPACE`` when set (the agent-server sets it
for the conversation), otherwise the process working directory. Every path is
confined to that root.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import socket
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastmcp import FastMCP

mcp = FastMCP("freehands-coding-tools")

SKIP_DIRS = {
    ".git", "node_modules", "build", "dist", ".venv", "venv", "__pycache__",
    ".mypy_cache", ".pytest_cache", ".ruff_cache", ".next", ".turbo", "target",
    "coverage", ".idea", ".vscode",
}
MAX_OUTPUT = 20_000
DEFAULT_TIMEOUT = 120
MOBILEBOX_API = "https://mobilebox.dev/v1"


# ── helpers ──────────────────────────────────────────────────────────────────

_WORKSPACE_OVERRIDE: Path | None = None


def _workspace() -> Path:
    """Resolve the workspace: explicit override > env > repo root > agent defaults."""
    if _WORKSPACE_OVERRIDE is not None:
        return _WORKSPACE_OVERRIDE
    env = os.environ.get("FREEFHANDS_WORKSPACE")
    if env:
        return Path(env).expanduser().resolve()
    here = Path(__file__).resolve().parent
    for parent in (here, *here.parents):
        if (parent / ".git").exists():
            return parent
    for candidate in ("/workspace/project", "/projects"):
        path = Path(candidate)
        if path.is_dir():
            return path
    return Path.cwd().resolve()


def _resolve(path: str, *, must_exist: bool = False) -> Path:
    root = _workspace()
    candidate = (
        (root / path).expanduser().resolve()
        if not Path(path).is_absolute()
        else Path(path).expanduser().resolve()
    )
    if candidate != root and root not in candidate.parents:
        raise ValueError(f"Path escapes the workspace: {path}")
    if must_exist and not candidate.exists():
        raise FileNotFoundError(path)
    return candidate


def _truncate(text: str, limit: int = MAX_OUTPUT) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + f"\n… truncated ({len(text) - limit} more characters)"


def _run(
    args: list[str] | str,
    *,
    cwd: Path | None = None,
    timeout: int = DEFAULT_TIMEOUT,
    shell: bool = False,
) -> dict[str, Any]:
    started = time.monotonic()
    try:
        completed = subprocess.run(
            args,
            cwd=str(cwd or _workspace()),
            capture_output=True,
            text=True,
            timeout=timeout,
            shell=shell,
        )
        return {
            "exit_code": completed.returncode,
            "stdout": _truncate(completed.stdout),
            "stderr": _truncate(completed.stderr),
            "duration_ms": int((time.monotonic() - started) * 1000),
        }
    except subprocess.TimeoutExpired as exc:
        return {
            "exit_code": -1,
            "stdout": _truncate(exc.stdout or ""),
            "stderr": f"Timed out after {timeout}s",
            "duration_ms": int((time.monotonic() - started) * 1000),
        }
    except FileNotFoundError as exc:
        return {"exit_code": 127, "stdout": "", "stderr": str(exc), "duration_ms": 0}


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _project_commands() -> dict[str, list[str]]:
    root = _workspace()
    commands: dict[str, list[str]] = {}

    pkg = root / "package.json"
    if pkg.exists():
        try:
            scripts = _read_json(pkg).get("scripts") or {}
        except Exception:
            scripts = {}
        for name in scripts:
            commands[f"npm:{name}"] = ["npm", "run", name]

    pyproject = root / "pyproject.toml"
    if pyproject.exists():
        text = pyproject.read_text(encoding="utf-8", errors="ignore")
        if "pytest" in text or (root / "tests").exists():
            commands.setdefault("python:test", ["pytest", "-q"])
        if "ruff" in text:
            commands.setdefault("python:lint", ["ruff", "check", "."])
        if "mypy" in text:
            commands.setdefault("python:typecheck", ["mypy", "."])
        if "black" in text:
            commands.setdefault("python:format:check", ["black", "--check", "."])

    if (root / "go.mod").exists():
        commands.setdefault("go:test", ["go", "test", "./..."])
        commands.setdefault("go:lint", ["go", "vet", "./..."])
        commands.setdefault("go:build", ["go", "build", "./..."])

    if (root / "Cargo.toml").exists():
        commands.setdefault("cargo:test", ["cargo", "test"])
        commands.setdefault("cargo:lint", ["cargo", "clippy", "--", "-D", "warnings"])
        commands.setdefault("cargo:build", ["cargo", "build"])

    makefile = root / "Makefile"
    if makefile.exists():
        for target in re.findall(
            r"^([A-Za-z0-9_.-]+):",
            makefile.read_text(encoding="utf-8", errors="ignore"),
            re.M,
        ):
            commands.setdefault(f"make:{target}", ["make", target])

    return commands


def _pick_command(*kinds: str) -> tuple[str, list[str]] | None:
    commands = _project_commands()
    for kind in kinds:
        for key, command in commands.items():
            if key.endswith(f":{kind}") or key == kind:
                return key, command
    return None


def _command_result(kind: str, *aliases: str) -> dict[str, Any]:
    picked = _pick_command(kind, *aliases)
    if not picked:
        return {
            "ok": False,
            "error": f"No {kind} command detected. Use list_project_commands.",
        }
    name, command = picked
    result = _run(command, timeout=600)
    result["command"] = name
    result["ok"] = result["exit_code"] == 0
    return result


def _walk_files(root: Path, limit: int = 5000) -> list[Path]:
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".git")
        ]
        for filename in filenames:
            files.append(Path(dirpath) / filename)
            if len(files) >= limit:
                return files
    return files


def _mobilebox_key() -> str:
    key = os.environ.get("MOBILESANDBOX_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "MOBILESANDBOX_API_KEY is not set. Add it to the agent-server "
            "environment (or the FreeHands cloud .env) to use the phone tools."
        )
    return key


def _mobilebox_request(
    method: str, path: str, payload: Any = None, timeout: int = 60
) -> Any:
    key = _mobilebox_key()
    data = None if payload is None else json.dumps(payload).encode()
    request = urllib.request.Request(
        f"{MOBILEBOX_API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {key}",
            "content-type": "application/json",
            "accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        raise RuntimeError(
            f"Mobilebox {method} {path} failed ({exc.code}): {detail}"
        ) from exc


@mcp.tool()
def workspace_info() -> dict[str, Any]:
    """Show the workspace the coding tools will operate on."""
    return {
        "workspace": str(_workspace()),
        "override": _WORKSPACE_OVERRIDE is not None,
        "env": os.environ.get("FREEFHANDS_WORKSPACE"),
    }


@mcp.tool()
def workspace_root(path: str) -> dict[str, Any]:
    """Point the coding tools at a different workspace directory."""
    global _WORKSPACE_OVERRIDE
    target = Path(path).expanduser().resolve()
    if not target.is_dir():
        return {"ok": False, "error": f"Not a directory: {path}"}
    _WORKSPACE_OVERRIDE = target
    return {"ok": True, "workspace": str(target)}


# ── git ─────────────────────────────────────────────────────────────────────

@mcp.tool()
def git_status() -> dict[str, Any]:
    """Show the branch, ahead/behind counts and the working-tree changes."""
    return _run(["git", "status", "--short", "--branch"])


@mcp.tool()
def git_diff(ref: str = "", path: str = "", stat: bool = False) -> dict[str, Any]:
    """Show a git diff, optionally for a ref/path or as a stat summary."""
    args = ["git", "diff"]
    if stat:
        args.append("--stat")
    if ref:
        args.append(ref)
    if path:
        args.extend(["--", path])
    return _run(args)


@mcp.tool()
def git_log(limit: int = 20, path: str = "") -> dict[str, Any]:
    """List recent commits, optionally scoped to a path."""
    args = ["git", "log", f"-{max(1, min(limit, 100))}", "--oneline", "--decorate"]
    if path:
        args.extend(["--", path])
    return _run(args)


@mcp.tool()
def git_show(ref: str = "HEAD", stat: bool = True) -> dict[str, Any]:
    """Show a commit (message and, by default, its file stats)."""
    args = ["git", "show", ref]
    if stat:
        args.append("--stat")
    return _run(args)


@mcp.tool()
def git_blame(path: str, start: int = 1, end: int = 80) -> dict[str, Any]:
    """Blame a line range of a file."""
    return _run(["git", "blame", "-L", f"{start},{end}", path])


@mcp.tool()
def git_branches(all_branches: bool = True) -> dict[str, Any]:
    """List local (and by default remote) branches with last-commit dates."""
    args = ["git", "branch", "-vv"]
    if all_branches:
        args.append("-a")
    return _run(args)


@mcp.tool()
def git_stash_list() -> dict[str, Any]:
    """List git stashes."""
    return _run(["git", "stash", "list"])


# ── project commands ────────────────────────────────────────────────────────

@mcp.tool()
def list_project_commands() -> dict[str, Any]:
    """List the detected test, lint, typecheck, build and Makefile commands."""
    return {"workspace": str(_workspace()), "commands": _project_commands()}


@mcp.tool()
def run_tests() -> dict[str, Any]:
    """Run the project's test command (npm/pytest/go/cargo/make)."""
    return _command_result("test")


@mcp.tool()
def run_lint() -> dict[str, Any]:
    """Run the project's lint command."""
    return _command_result("lint")


@mcp.tool()
def run_typecheck() -> dict[str, Any]:
    """Run the project's typecheck command."""
    return _command_result("typecheck")


@mcp.tool()
def run_build() -> dict[str, Any]:
    """Run the project's build command."""
    return _command_result("build")


@mcp.tool()
def run_format_check() -> dict[str, Any]:
    """Run the project's format check."""
    return _command_result("format:check", "format")


@mcp.tool()
def run_project_script(name: str, timeout: int = 300) -> dict[str, Any]:
    """Run a detected package.json script or Makefile target by name."""
    commands = _project_commands()
    command = commands.get(name)
    if not command:
        return {
            "ok": False,
            "error": f"Unknown script '{name}'",
            "available": sorted(commands),
        }
    result = _run(command, timeout=max(10, min(timeout, 1800)))
    result["command"] = name
    result["ok"] = result["exit_code"] == 0
    return result


# ── dependencies ────────────────────────────────────────────────────────────

@mcp.tool()
def dependency_audit() -> dict[str, Any]:
    """Run the ecosystem's vulnerability audit (npm/pip/cargo)."""
    root = _workspace()
    if (root / "package-lock.json").exists() and shutil.which("npm"):
        return _run(["npm", "audit", "--json"], timeout=300)
    if (root / "pyproject.toml").exists() and shutil.which("pip-audit"):
        return _run(["pip-audit", "--format", "json"], timeout=300)
    if (root / "Cargo.toml").exists() and shutil.which("cargo"):
        return _run(["cargo", "audit"], timeout=300)
    return {"ok": False, "error": "No supported audit tool found"}


@mcp.tool()
def outdated_dependencies() -> dict[str, Any]:
    """List outdated dependencies for the detected ecosystem."""
    root = _workspace()
    if (root / "package.json").exists() and shutil.which("npm"):
        return _run(["npm", "outdated", "--long"], timeout=180)
    if (root / "pyproject.toml").exists() and shutil.which("uv"):
        return _run(["uv", "pip", "list", "--outdated"], timeout=180)
    if (root / "go.mod").exists() and shutil.which("go"):
        return _run(["go", "list", "-u", "-m", "all"], timeout=180)
    if (root / "Cargo.toml").exists() and shutil.which("cargo"):
        return _run(["cargo", "outdated"], timeout=180)
    return {"ok": False, "error": "No supported dependency manager found"}


@mcp.tool()
def license_scan() -> dict[str, Any]:
    """Summarise dependency licenses from package-lock.json or Python metadata."""
    root = _workspace()
    counts: dict[str, int] = {}
    unknown: list[str] = []
    lock = root / "package-lock.json"
    if lock.exists():
        try:
            packages = _read_json(lock).get("packages") or {}
            for name, meta in packages.items():
                if not name or not isinstance(meta, dict):
                    continue
                license_name = meta.get("license")
                if isinstance(license_name, str) and license_name:
                    counts[license_name] = counts.get(license_name, 0) + 1
                elif name.startswith("node_modules/"):
                    unknown.append(name)
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
        return {
            "ok": True,
            "source": "package-lock.json",
            "licenses": counts,
            "unknown": unknown[:20],
        }
    try:
        import importlib.metadata as metadata

        for dist in metadata.distributions():
            license_name = dist.metadata.get("License") or ""
            if license_name:
                counts[license_name] = counts.get(license_name, 0) + 1
        return {"ok": True, "source": "python-metadata", "licenses": counts}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── code intelligence ───────────────────────────────────────────────────────

@mcp.tool()
def code_search(pattern: str, glob: str = "", limit: int = 100) -> dict[str, Any]:
    """Search file contents with a regular expression."""
    limit = max(1, min(limit, 500))
    if shutil.which("rg"):
        args = ["rg", "-n", "--no-heading", "--color", "never", "-m", str(limit), pattern]
        if glob:
            args.extend(["-g", glob])
        return _run(args, timeout=60)
    args = [
        "grep", "-rIn", "--exclude-dir=.git", "--exclude-dir=node_modules",
        "-m", str(limit), pattern, ".",
    ]
    return _run(args, timeout=60)


@mcp.tool()
def find_files(glob: str = "**/*", limit: int = 200) -> dict[str, Any]:
    """Find files by glob pattern, newest first."""
    limit = max(1, min(limit, 1000))
    matches = [p for p in _workspace().glob(glob) if p.is_file()]
    matches.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return {
        "count": len(matches),
        "files": [str(p.relative_to(_workspace())) for p in matches[:limit]],
    }


@mcp.tool()
def repo_map(max_depth: int = 3) -> dict[str, Any]:
    """Summarise the repository layout with per-directory file counts."""
    root = _workspace()
    max_depth = max(1, min(max_depth, 6))
    summary: dict[str, int] = {}
    total = 0
    for path in _walk_files(root, limit=20_000):
        total += 1
        rel = path.relative_to(root)
        if len(rel.parts) <= max_depth:
            key = "/".join(rel.parts[:-1]) or "."
            summary[key] = summary.get(key, 0) + 1
    top = sorted(summary.items(), key=lambda item: item[1], reverse=True)[:40]
    return {"workspace": str(root), "files": total, "directories": dict(top)}


@mcp.tool()
def file_outline(path: str, limit: int = 200) -> dict[str, Any]:
    """Extract functions, classes and types from a source file."""
    target = _resolve(path, must_exist=True)
    text = target.read_text(encoding="utf-8", errors="replace")
    patterns = [
        r"^\s*(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)",
        r"^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)",
        r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)",
        r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s*)?\(",
        r"^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_][A-Za-z0-9_]*)",
        r"^\s*(?:pub\s+)?(?:fn|struct|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)",
    ]
    symbols = []
    for number, line in enumerate(text.splitlines(), start=1):
        for pattern in patterns:
            match = re.match(pattern, line)
            if match:
                symbols.append(
                    {"line": number, "name": match.group(1), "text": line.strip()[:160]}
                )
                break
        if len(symbols) >= limit:
            break
    return {"path": path, "lines": len(text.splitlines()), "symbols": symbols}


@mcp.tool()
def read_file_range(path: str, start: int = 1, end: int = 200) -> dict[str, Any]:
    """Read a file with line numbers and a bounded range."""
    target = _resolve(path, must_exist=True)
    lines = target.read_text(encoding="utf-8", errors="replace").splitlines()
    start = max(1, start)
    end = min(len(lines), max(start, end))
    numbered = [f"{number:>6}  {lines[number - 1]}" for number in range(start, end + 1)]
    return {
        "path": path,
        "start": start,
        "end": end,
        "total_lines": len(lines),
        "content": _truncate("\n".join(numbered)),
    }


@mcp.tool()
def todo_scan(limit: int = 200) -> dict[str, Any]:
    """Find TODO, FIXME and HACK markers by file."""
    pattern = re.compile(r"\b(TODO|FIXME|HACK)\b")
    hits: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for path in _walk_files(_workspace()):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for number, line in enumerate(text.splitlines(), start=1):
            if pattern.search(line):
                rel = str(path.relative_to(_workspace()))
                counts[rel] = counts.get(rel, 0) + 1
                if len(hits) < limit:
                    hits.append(
                        {"path": rel, "line": number, "text": line.strip()[:180]}
                    )
    return {
        "total": sum(counts.values()),
        "by_file": dict(
            sorted(counts.items(), key=lambda item: item[1], reverse=True)[:30]
        ),
        "hits": hits,
    }


# ── file edits ──────────────────────────────────────────────────────────────

@mcp.tool()
def write_file(path: str, content: str, overwrite: bool = False) -> dict[str, Any]:
    """Write a workspace file. Existing files require overwrite=true."""
    target = _resolve(path)
    if target.exists() and not overwrite:
        return {
            "ok": False,
            "error": f"{path} exists; pass overwrite=true to replace it",
        }
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    return {"ok": True, "path": path, "bytes": len(content.encode())}


@mcp.tool()
def apply_patch(patch: str, apply: bool = False) -> dict[str, Any]:
    """Check (default) or apply a unified diff with git apply."""
    root = _workspace()
    patch_file = root / ".freehands-patch.diff"
    patch_file.write_text(patch, encoding="utf-8")
    try:
        check = _run(["git", "apply", "--check", str(patch_file)], cwd=root)
        if check["exit_code"] != 0 or not apply:
            return {"ok": check["exit_code"] == 0, "applied": False, **check}
        result = _run(["git", "apply", str(patch_file)], cwd=root)
        return {
            "ok": result["exit_code"] == 0,
            "applied": result["exit_code"] == 0,
            **result,
        }
    finally:
        patch_file.unlink(missing_ok=True)


# ── quality and security ────────────────────────────────────────────────────

SECRET_PATTERNS = [
    ("aws_access_key", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("github_token", re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}")),
    ("slack_token", re.compile(r"xox[baprs]-[A-Za-z0-9-]{10,}")),
    (
        "private_key",
        re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    ),
    (
        "generic_secret",
        re.compile(
            r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][^'\"]{8,}['\"]"
        ),
    ),
]


@mcp.tool()
def secret_scan(limit: int = 50) -> dict[str, Any]:
    """Scan for common secret patterns, returning redacted matches only."""
    hits: list[dict[str, Any]] = []
    for path in _walk_files(_workspace()):
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        for number, line in enumerate(text.splitlines(), start=1):
            for name, pattern in SECRET_PATTERNS:
                match = pattern.search(line)
                if not match:
                    continue
                value = match.group(0)
                redacted = value[:4] + "…" if len(value) > 4 else "…"
                hits.append(
                    {
                        "path": str(path.relative_to(_workspace())),
                        "line": number,
                        "kind": name,
                        "match": redacted,
                    }
                )
                break
            if len(hits) >= limit:
                return {"total": len(hits), "hits": hits, "truncated": True}
    return {"total": len(hits), "hits": hits}


@mcp.tool()
def complexity_report(limit: int = 20) -> dict[str, Any]:
    """Rank the largest source files by lines, functions and classes."""
    rows = []
    suffixes = {".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java", ".kt"}
    for path in _walk_files(_workspace()):
        if path.suffix.lower() not in suffixes:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        rows.append(
            {
                "path": str(path.relative_to(_workspace())),
                "lines": text.count("\n") + 1,
                "functions": len(re.findall(r"\b(def|function|func|fn)\b", text)),
                "classes": len(
                    re.findall(r"\b(class|struct|interface|trait)\b", text)
                ),
            }
        )
    rows.sort(key=lambda row: row["lines"], reverse=True)
    return {"files": len(rows), "largest": rows[: max(1, min(limit, 100))]}


@mcp.tool()
def test_coverage_summary() -> dict[str, Any]:
    """Read istanbul coverage-summary.json or coverage/lcov.info."""
    root = _workspace()
    summary = root / "coverage" / "coverage-summary.json"
    if summary.exists():
        try:
            total = _read_json(summary).get("total") or {}
            return {
                "source": "coverage-summary.json",
                "lines": (total.get("lines") or {}).get("pct"),
                "statements": (total.get("statements") or {}).get("pct"),
                "functions": (total.get("functions") or {}).get("pct"),
                "branches": (total.get("branches") or {}).get("pct"),
            }
        except Exception as exc:
            return {"ok": False, "error": str(exc)}
    lcov = root / "coverage" / "lcov.info"
    if lcov.exists():
        hit = found = 0
        for line in lcov.read_text(encoding="utf-8", errors="ignore").splitlines():
            if line.startswith("LH:"):
                hit += int(line[3:] or 0)
            elif line.startswith("LF:"):
                found += int(line[3:] or 0)
        pct = round(hit / found * 100, 2) if found else None
        return {
            "source": "lcov.info",
            "lines_hit": hit,
            "lines_found": found,
            "lines_pct": pct,
        }
    return {
        "ok": False,
        "error": "No coverage-summary.json or coverage/lcov.info found",
    }


@mcp.tool()
def regex_test(
    pattern: str, text: str = "", path: str = "", limit: int = 50
) -> dict[str, Any]:
    """Compile a regex and test it against a string or a file."""
    try:
        compiled = re.compile(pattern)
    except re.error as exc:
        return {"ok": False, "error": str(exc)}
    source = text
    if path:
        source = _resolve(path, must_exist=True).read_text(
            encoding="utf-8", errors="ignore"
        )
    matches = [
        match.group(0) for match in compiled.finditer(source)
    ][: max(1, min(limit, 500))]
    return {"ok": True, "matches": matches, "count": len(matches)}


# ── data and network ────────────────────────────────────────────────────────

@mcp.tool()
def json_validate(
    content: str = "", path: str = "", pretty: bool = False
) -> dict[str, Any]:
    """Validate JSON from a string or file, optionally pretty-printing it."""
    try:
        raw = (
            _resolve(path, must_exist=True).read_text(encoding="utf-8")
            if path
            else content
        )
        parsed = json.loads(raw)
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    return {
        "ok": True,
        "pretty": json.dumps(parsed, indent=2)[:MAX_OUTPUT] if pretty else None,
    }


@mcp.tool()
def yaml_validate(content: str = "", path: str = "") -> dict[str, Any]:
    """Validate YAML from a string or file (requires PyYAML)."""
    try:
        import yaml  # type: ignore
    except Exception:
        return {"ok": False, "error": "PyYAML is not installed in this environment"}
    try:
        raw = (
            _resolve(path, must_exist=True).read_text(encoding="utf-8")
            if path
            else content
        )
        yaml.safe_load(raw)
        return {"ok": True}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@mcp.tool()
def http_probe(url: str, method: str = "GET", timeout: int = 15) -> dict[str, Any]:
    """Probe an HTTP(S) URL and return status, headers, timing and a body preview."""
    if not re.match(r"^https?://", url):
        return {"ok": False, "error": "Only http:// and https:// URLs are supported"}
    method = method.upper()
    if method not in {"GET", "HEAD"}:
        return {"ok": False, "error": "Only GET and HEAD are supported"}
    request = urllib.request.Request(
        url, method=method, headers={"user-agent": "FreeHands-CodingTools/1.0"}
    )
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=max(1, min(timeout, 60))) as response:
            body = response.read(8192) if method == "GET" else b""
            return {
                "ok": True,
                "status": response.status,
                "url": response.geturl(),
                "elapsed_ms": int((time.monotonic() - started) * 1000),
                "headers": dict(response.headers),
                "body_preview": body.decode(errors="replace")[:4000],
            }
    except urllib.error.HTTPError as exc:
        return {
            "ok": False,
            "status": exc.code,
            "error": str(exc),
            "elapsed_ms": int((time.monotonic() - started) * 1000),
        }
    except Exception as exc:
        return {
            "ok": False,
            "error": str(exc),
            "elapsed_ms": int((time.monotonic() - started) * 1000),
        }


@mcp.tool()
def port_check(
    host: str = "127.0.0.1", port: int = 8000, timeout: float = 2.0
) -> dict[str, Any]:
    """Check whether a TCP port is open."""
    started = time.monotonic()
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(max(0.1, min(timeout, 10)))
        code = sock.connect_ex((host, int(port)))
    return {
        "host": host,
        "port": port,
        "open": code == 0,
        "code": code,
        "elapsed_ms": int((time.monotonic() - started) * 1000),
    }


# ── system ──────────────────────────────────────────────────────────────────

@mcp.tool()
def process_list(pattern: str = "", limit: int = 30) -> dict[str, Any]:
    """List processes, optionally filtered by a case-insensitive substring."""
    result = _run(["ps", "-eo", "pid,pcpu,pmem,etime,cmd"], timeout=20)
    lines = result.get("stdout", "").splitlines()
    header, rows = (lines[0], lines[1:]) if lines else ("", [])

    def cpu(row: str) -> float:
        parts = row.split()
        try:
            return float(parts[1])
        except (IndexError, ValueError):
            return 0.0

    rows.sort(key=cpu, reverse=True)
    if pattern:
        needle = pattern.lower()
        rows = [row for row in rows if needle in row.lower()]
    return {"header": header, "processes": rows[: max(1, min(limit, 200))]}


@mcp.tool()
def disk_usage(top: int = 10) -> dict[str, Any]:
    """Report filesystem free space and the largest top-level directories."""
    root = _workspace()
    usage = shutil.disk_usage(root)
    sizes: list[tuple[str, int]] = []
    for child in root.iterdir():
        if child.name in SKIP_DIRS or child.name.startswith(".git"):
            continue
        total = 0
        if child.is_file():
            total = child.stat().st_size
        elif child.is_dir():
            for dirpath, dirnames, filenames in os.walk(child):
                dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
                for filename in filenames:
                    try:
                        total += (Path(dirpath) / filename).stat().st_size
                    except OSError:
                        pass
        sizes.append((child.name, total))
    sizes.sort(key=lambda item: item[1], reverse=True)
    return {
        "total_gb": round(usage.total / 1e9, 2),
        "free_gb": round(usage.free / 1e9, 2),
        "workspace_gb": round(usage.used / 1e9, 2),
        "largest": [
            {"name": name, "mb": round(size / 1e6, 2)}
            for name, size in sizes[: max(1, min(top, 50))]
        ],
    }


# ── Mobilebox live phones ───────────────────────────────────────────────────

@mcp.tool()
def mobilebox_create_phone(
    name: str = "freehands", platform: str = "android"
) -> dict[str, Any]:
    """Create a cloud phone. Ask the user whether they want the live view next."""
    phone = _mobilebox_request(
        "POST", "/phones?wait=ready", {"name": name, "platform": platform}, timeout=90
    )
    return {
        "phone_id": (phone or {}).get("id"),
        "status": (phone or {}).get("status"),
        "next": (
            "Ask the user: 'Do you want to watch the phone live while I work?' "
            "If yes, call mobilebox_watch with this phone_id and share the viewer_url. "
            "Delete the phone with mobilebox_delete when done."
        ),
    }


@mcp.tool()
def mobilebox_list_phones() -> Any:
    """List the workspace's cloud phones and their status."""
    return _mobilebox_request("GET", "/phones")


@mcp.tool()
def mobilebox_observe(phone_id: str) -> Any:
    """Read the phone's current screen as a numbered element list."""
    return _mobilebox_request(
        "GET", f"/phones/{urllib.parse.quote(phone_id)}/observe"
    )


@mcp.tool()
def mobilebox_act(phone_id: str, actions: list[dict[str, Any]]) -> Any:
    """Run one or more actions on the phone (tap, type, open_app, wait, ...)."""
    if isinstance(actions, str):
        actions = json.loads(actions)
    return _mobilebox_request(
        "POST",
        f"/phones/{urllib.parse.quote(phone_id)}/actions",
        {"actions": actions},
        timeout=120,
    )


@mcp.tool()
def mobilebox_screenshot(phone_id: str, filename: str = "") -> dict[str, Any]:
    """Save a phone screenshot into the workspace and return its path."""
    key = _mobilebox_key()
    request = urllib.request.Request(
        f"{MOBILEBOX_API}/phones/{urllib.parse.quote(phone_id)}/screenshot",
        headers={"Authorization": f"Bearer {key}"},
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    target = _resolve(filename or f"mobilebox-{phone_id}-{stamp}.png")
    with urllib.request.urlopen(request, timeout=60) as response:
        data = response.read()
    target.write_bytes(data)
    return {
        "ok": True,
        "path": str(target.relative_to(_workspace())),
        "bytes": len(data),
    }


@mcp.tool()
def mobilebox_watch(phone_id: str) -> dict[str, Any]:
    """Create a live viewer link so the user can watch the phone in real time."""
    view = _mobilebox_request(
        "POST", f"/phones/{urllib.parse.quote(phone_id)}/view"
    )
    viewer_url = (view or {}).get("url")
    return {
        "viewer_url": viewer_url,
        "command": (view or {}).get("command"),
        "ask_user": (
            "Ask the user: 'Do you want to watch what I'm doing on the phone?' "
            "If yes, open this live view: " + (viewer_url or "")
        ),
    }


@mcp.tool()
def mobilebox_start(phone_id: str) -> Any:
    """Resume a parked phone."""
    return _mobilebox_request(
        "POST", f"/phones/{urllib.parse.quote(phone_id)}/start"
    )


@mcp.tool()
def mobilebox_park(phone_id: str) -> Any:
    """Park a phone (free, keeps apps and data)."""
    return _mobilebox_request(
        "POST", f"/phones/{urllib.parse.quote(phone_id)}/park"
    )


@mcp.tool()
def mobilebox_delete(phone_id: str) -> Any:
    """Delete a phone and stop billing."""
    return _mobilebox_request(
        "DELETE", f"/phones/{urllib.parse.quote(phone_id)}"
    )


if __name__ == "__main__":
    mcp.run()
