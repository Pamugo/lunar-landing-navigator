#!/usr/bin/env python3
"""Lanzador unificado de desarrollo para Lunar Landing Site Navigator (Backend FastAPI + Frontend Vite).

Propietario: qa-verification-agent.
Inicia simultaneamente:
  1. Backend cientifico FastAPI en http://localhost:8000 (usando .venv)
  2. Frontend interactivo React/Vite en http://localhost:5173 (usando Node.js)

Uso:
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
    raise RuntimeError("No se encontro 'npm' en el sistema.")


def main() -> int:
    py_exe = find_venv_python()
    npm_exe = find_npm()

    env = os.environ.copy()
    nodejs_dir = r"C:\Program Files\nodejs"
    if Path(nodejs_dir).is_dir() and nodejs_dir not in env.get("PATH", ""):
        env["PATH"] = f"{nodejs_dir};{env.get('PATH', '')}"

    print("=" * 78)
    print(" LUNAR LANDING SITE NAVIGATOR — CONSOLA DE VUELO (DESARROLLO LOCAL)")
    print("=" * 78)
    print(" -> Backend FastAPI (OpenAPI): http://localhost:8000/docs")
    print(" -> Health & Sello JPL:        http://localhost:8000/api/v1/health")
    print(" -> Frontend Web HUD:          http://localhost:5173")
    print("=" * 78)
    print("Pulsa Ctrl+C para detener ambos servidores.\n")

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
        print("\nDeteniendo servidores...")
    finally:
        for proc in (frontend_proc, backend_proc):
            if proc.poll() is None:
                proc.terminate()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
