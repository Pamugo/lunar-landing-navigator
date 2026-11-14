#!/usr/bin/env python3
"""Watcher continuo de auto-sincronizacion con GitHub (git add + commit + push).

Propietario: qa-verification-agent.
Vigila el arbol de trabajo del repositorio y, cuando detecta cambios nuevos o
modificados (respetando .gitignore) o commits locales pendientes de subir,
ejecuta automaticamente:
  1. git add -A
  2. git commit -m "chore(auto-sync): ..."
  3. git push origin main

Uso:
    # Modo continuo (por defecto revisa cada 60 segundos):
    python scripts/auto_sync_github.py

    # Intervalo personalizado (ej. cada 30 segundos):
    python scripts/auto_sync_github.py --interval 30

    # Ejecucion unica (un ciclo y salir):
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
    """Ejecuta un ciclo de comprobacion, commit y push. Devuelve True si subio cambios."""
    lock_file = ROOT / ".git/index.lock"
    if lock_file.exists():
        print("[auto-sync] .git/index.lock detectado (operacion git en curso); esperando al siguiente ciclo.")
        return False

    changed = _changed_files()
    now_utc = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    if changed:
        preview = ", ".join(changed[:4])
        if len(changed) > 4:
            preview += f" (+{len(changed) - 4} mas)"
        msg = f"chore(auto-sync): actualizacion automatica [{now_utc}] ({preview})"

        print(f"[auto-sync] [{now_utc}] Detectados {len(changed)} archivo(s) modificados: {preview}")
        add_res = _run_git(["add", "-A"])
        if add_res.returncode != 0:
            print(f"[auto-sync] ERROR en git add: {add_res.stderr.strip()}", file=sys.stderr)
            return False

        commit_res = _run_git(["commit", "-m", msg])
        if commit_res.returncode != 0:
            print(f"[auto-sync] Aviso en git commit: {commit_res.stderr.strip() or commit_res.stdout.strip()}")
        else:
            print(f"[auto-sync] Commit creado: {msg}")

    ahead = _commits_ahead(remote, branch)
    if ahead > 0:
        print(f"[auto-sync] Subiendo {ahead} commit(s) pendiente(s) a {remote}/{branch}...")
        push_res = _run_git(["push", remote, branch])
        if push_res.returncode == 0:
            print(f"[auto-sync] Push completado con exito a {remote}/{branch} ({now_utc}).")
            return True
        print(f"[auto-sync] ERROR en git push: {push_res.stderr.strip()}", file=sys.stderr)
        return False

    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Watcher continuo de auto-sincronizacion con GitHub (add + commit + push)."
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=60.0,
        help="Segundos entre comprobaciones en modo continuo (por defecto: 60).",
    )
    parser.add_argument(
        "--remote",
        type=str,
        default="origin",
        help="Nombre del remoto de Git (por defecto: origin).",
    )
    parser.add_argument(
        "--branch",
        type=str,
        default="main",
        help="Rama de Git a sincronizar (por defecto: main).",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Ejecuta una unica sincronizacion y termina.",
    )
    args = parser.parse_args()

    if args.once:
        sync_once(remote=args.remote, branch=args.branch)
        return 0

    interval_s = max(5.0, float(args.interval))
    print("=" * 84)
    print(" LUNAR LANDING SITE NAVIGATOR — GITHUB AUTO-SYNC WATCHER ACTIVO")
    print("=" * 84)
    print(f"  Directorio : {ROOT}")
    print(f"  Destino    : {args.remote}/{args.branch}")
    print(f"  Intervalo  : cada {interval_s:.0f} s (Ctrl+C para detener)")
    print("=" * 84)

    try:
        while True:
            sync_once(remote=args.remote, branch=args.branch)
            time.sleep(interval_s)
    except KeyboardInterrupt:
        print("\n[auto-sync] Watcher detenido por el usuario.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
