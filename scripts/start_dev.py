#!/usr/bin/env python3
"""Unified development launcher for Lunar Landing Site Navigator (FastAPI Backend + Vite Frontend).

Owner: qa-verification-agent.
Starts simultaneously:
  1. FastAPI scientific backend at http://localhost:8000 (using .venv)
  2. React/Vite interactive frontend at http://localhost:5173 (using Node.js)

Usage:
    python scripts/start_dev.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT / "backend"
FRONTEND_DIR = ROOT / "frontend"


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
    win_npm = Path(r"C:\Program Files\nodejs\npm.cmd")
    if win_npm.is_file():
        return str(win_npm)
    raise RuntimeError("'npm' was not found on the system.")


def main() -> int:
    py_exe = find_venv_python()
    npm_exe = find_npm()

    env = os.environ.copy()
    nodejs_dir = r"C:\Program Files\nodejs"
    if Path(nodejs_dir).is_dir() and nodejs_dir not in env.get("PATH", ""):
        env["PATH"] = f"{nodejs_dir};{env.get('PATH', '')}"

    print("=" * 78)
    print(" LUNAR LANDING SITE NAVIGATOR — FLIGHT CONSOLE (LOCAL DEVELOPMENT)")
    print("=" * 78)
    print(" -> FastAPI Backend (OpenAPI): http://localhost:8000/docs")
    print(" -> Health & JPL Seal:         http://localhost:8000/api/v1/health")
    print(" -> Web HUD Frontend:          http://localhost:5173")
    print("=" * 78)
    print("Press Ctrl+C to stop both servers.\n")

    backend_proc = subprocess.Popen(
        [py_exe, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"],
        cwd=str(BACKEND_DIR),
        env=env,
    )
    time.sleep(1.2)
    frontend_proc = subprocess.Popen(
        [npm_exe, "run", "dev", "--", "--host", "127.0.0.1", "--port", "5173"],
        cwd=str(FRONTEND_DIR),
        env=env,
    )

    try:
        while True:
            if backend_proc.poll() is not None:
                return backend_proc.returncode or 0
            if frontend_proc.poll() is not None:
                return frontend_proc.returncode or 0
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nStopping servers...")
    finally:
        for proc in (frontend_proc, backend_proc):
            if proc.poll() is None:
                proc.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
