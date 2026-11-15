#!/usr/bin/env python3
"""Continuous auto-download watcher from GitHub (git fetch + git pull --rebase --autostash).

Owner: qa-verification-agent.
Periodically checks (every 60 seconds by default) whether there are new commits on origin/main.
If changes are detected:
  1. Executes git pull --rebase --autostash origin main
  2. If dependencies changed (pyproject.toml or package.json), automatically updates them.
  3. Dev servers (Vite HMR and FastAPI --reload) reload live in the browser.

Usage:
    python scripts/auto_pull_watcher.py
    python scripts/auto_pull_watcher.py --interval 30
    python scripts/auto_pull_watcher.py --once
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def find_git() -> str:
    which = shutil.which("git")
    if which:
        return which
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        local_git = Path(local_app_data) / "Programs/Git/cmd/git.exe"
        if local_git.is_file():
            return str(local_git)
    return "git"


def find_venv_python() -> str:
    win_py = ROOT / ".venv/Scripts/python.exe"
    if win_py.is_file():
        return str(win_py)
    unix_py = ROOT / ".venv/bin/python"
    if unix_py.is_file():
        return str(unix_py)
    return sys.executable


def find_npm() -> str:
    which = shutil.which("npm.cmd") or shutil.which("npm")
    if which:
        return which
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        winget_dir = Path(local_app_data) / "Microsoft/WinGet/Packages"
        if winget_dir.is_dir():
            for p in winget_dir.glob("**/node-v*/npm.cmd"):
                return str(p)
    return "npm"


def run_git(args: list[str]) -> subprocess.CompletedProcess[str]:
    git_bin = find_git()
    return subprocess.run(
        [git_bin, *args],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def check_and_pull(remote: str = "origin", branch: str = "main") -> bool:
    """Checks whether origin/branch has new commits and pulls them with rebase and autostash."""
    now_utc = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    lock_file = ROOT / ".git/index.lock"
    if lock_file.exists():
        print(f"[auto-pull] [{now_utc}] .git/index.lock detected; waiting for next cycle.")
        return False

    fetch_res = run_git(["fetch", remote, branch])
    if fetch_res.returncode != 0:
        print(f"[auto-pull] [{now_utc}] Error in git fetch: {fetch_res.stderr.strip()}", file=sys.stderr)
        return False

    rev_res = run_git(["rev-list", "--count", f"HEAD..{remote}/{branch}"])
    if rev_res.returncode != 0:
        return False

    try:
        behind_count = int(rev_res.stdout.strip())
    except ValueError:
        behind_count = 0

    if behind_count == 0:
        # Repository up to date
        return False

    print(f"\n[auto-pull] [{now_utc}] Detected {behind_count} new commit(s) on {remote}/{branch}. Pulling...")

    pull_res = run_git(["pull", "--rebase", "--autostash", remote, branch])
    if pull_res.returncode != 0:
        print(f"[auto-pull] [{now_utc}] ERROR in git pull: {pull_res.stderr.strip()}", file=sys.stderr)
        return False

    print(f"[auto-pull] [{now_utc}] Pull completed successfully:")
    for line in pull_res.stdout.splitlines():
        if line.strip():
            print(f"  {line.strip()}")

    # Check if dependencies were added or modified
    py_exe = find_venv_python()
    npm_exe = find_npm()

    # If pyproject.toml changed in recent commits
    diff_stat = run_git(["diff", f"HEAD~{behind_count}", "HEAD", "--name-only"]).stdout
    changed_files = [f.strip() for f in diff_stat.splitlines() if f.strip()]

    if any("pyproject.toml" in f for f in changed_files):
        print(f"[auto-pull] [{now_utc}] pyproject.toml modified -> updating Python libraries...")
        subprocess.run([py_exe, "-m", "pip", "install", "-e", "backend[dev]"], cwd=str(ROOT), check=False)

    if any("package.json" in f for f in changed_files):
        print(f"[auto-pull] [{now_utc}] package.json modified -> updating npm packages...")
        subprocess.run([npm_exe, "install"], cwd=str(ROOT / "frontend"), check=False)

    print(f"[auto-pull] [{now_utc}] Sync ready. Vite and FastAPI reflect the changes live.\n")
    return True


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Continuous auto-download watcher from GitHub (git fetch + pull)."
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=60.0,
        help="Seconds between checks (default: 60).",
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
        help="Git branch to monitor (default: main).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Run a single check and exit.",
    )
    args = parser.parse_args()

    if args.once:
        check_and_pull(remote=args.remote, branch=args.branch)
        return 0

    interval_s = max(5.0, float(args.interval))
    git_bin = find_git()
    print("=" * 84)
    print(" LUNAR LANDING SITE NAVIGATOR — GITHUB AUTO-PULL WATCHER ACTIVE")
    print("=" * 84)
    print(f"  Directory  : {ROOT}")
    print(f"  Git binary : {git_bin}")
    print(f"  Monitoring : {args.remote}/{args.branch}")
    print(f"  Interval   : every {interval_s:.0f} s (automatic check)")
    print("=" * 84)

    try:
        while True:
            check_and_pull(remote=args.remote, branch=args.branch)
            time.sleep(interval_s)
    except KeyboardInterrupt:
        print("\n[auto-pull] Watcher stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
