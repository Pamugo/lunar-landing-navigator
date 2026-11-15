#!/usr/bin/env python3
"""Continuous auto-sync watcher for GitHub (git add + commit + push).

Owner: qa-verification-agent.
Monitors the repository working tree and, whenever it detects new or modified
changes (respecting .gitignore) or local commits pending upload,
automatically executes:
  1. git add -A
  2. git commit -m "chore(auto-sync): ..."
  3. git push origin main

Usage:
    # Continuous mode (default checks every 60 seconds):
    python scripts/auto_sync_github.py

    # Custom interval (e.g., every 30 seconds):
    python scripts/auto_sync_github.py --interval 30

    # Single run (one cycle and exit):
    python scripts/auto_sync_github.py --once
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def _changed_files() -> list[str]:
    res = _run_git(["status", "--porcelain"])
    if res.returncode != 0:
        return []
    files: list[str] = []
    for raw_line in res.stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        parts = line.split(maxsplit=1)
        if len(parts) == 2:
            files.append(parts[1].strip('"'))
    return files


def _commits_ahead(remote: str, branch: str) -> int:
    res = _run_git(["rev-list", "--count", f"{remote}/{branch}..{branch}"])
    if res.returncode != 0:
        return 0
    try:
        return int(res.stdout.strip())
    except ValueError:
        return 0


def sync_once(remote: str = "origin", branch: str = "main") -> bool:
    """Runs one check, commit, and push cycle. Returns True if changes were pushed."""
    lock_file = ROOT / ".git/index.lock"
    if lock_file.exists():
        print("[auto-sync] .git/index.lock detected (git operation in progress); waiting for next cycle.")
        return False

    changed = _changed_files()
    now_utc = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    if changed:
        preview = ", ".join(changed[:4])
        if len(changed) > 4:
            preview += f" (+{len(changed) - 4} more)"
        msg = f"chore(auto-sync): automatic update [{now_utc}] ({preview})"

        print(f"[auto-sync] [{now_utc}] Detected {len(changed)} modified file(s): {preview}")
        add_res = _run_git(["add", "-A"])
        if add_res.returncode != 0:
            print(f"[auto-sync] ERROR in git add: {add_res.stderr.strip()}", file=sys.stderr)
            return False

        commit_res = _run_git(["commit", "-m", msg])
        if commit_res.returncode != 0:
            print(f"[auto-sync] Warning in git commit: {commit_res.stderr.strip() or commit_res.stdout.strip()}")
        else:
            print(f"[auto-sync] Commit created: {msg}")

    ahead = _commits_ahead(remote, branch)
    if ahead > 0:
        print(f"[auto-sync] Pushing {ahead} pending commit(s) to {remote}/{branch}...")
        push_res = _run_git(["push", remote, branch])
        if push_res.returncode == 0:
            print(f"[auto-sync] Push completed successfully to {remote}/{branch} ({now_utc}).")
            return True
        print(f"[auto-sync] ERROR in git push: {push_res.stderr.strip()}", file=sys.stderr)
        return False

    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Continuous auto-sync watcher for GitHub (add + commit + push)."
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=60.0,
        help="Seconds between checks in continuous mode (default: 60).",
    )
    parser.add_argument(
        "--remote",
        type=str,
        default="origin",
        help="Git remote name (default: origin).",
    )
    parser.add_argument(
        "--branch",
        type=str,
        default="main",
        help="Git branch to sync (default: main).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single sync cycle and exit.",
    )
    args = parser.parse_args()

    if args.once:
        sync_once(remote=args.remote, branch=args.branch)
        return 0

    interval_s = max(5.0, float(args.interval))
    print("=" * 84)
    print(" LUNAR LANDING SITE NAVIGATOR — GITHUB AUTO-SYNC WATCHER ACTIVE")
    print("=" * 84)
    print(f"  Directory  : {ROOT}")
    print(f"  Target     : {args.remote}/{args.branch}")
    print(f"  Interval   : every {interval_s:.0f} s (Ctrl+C to stop)")
    print("=" * 84)

    try:
        while True:
            sync_once(remote=args.remote, branch=args.branch)
            time.sleep(interval_s)
    except KeyboardInterrupt:
        print("\n[auto-sync] Watcher stopped by user.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
