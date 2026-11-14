#!/usr/bin/env python3
"""Descarga y verifica texturas equirrectangulares de la Luna de la NASA (LROC WAC + LOLA DEM).

Propietario: astro-terrain-specialist / fullstack-visualizer.
Descarga texturas reales de dominio publico de NASA Scientific Visualization Studio (SVS #4720 CGI Moon Kit):
  - moon_albedo_map.jpg: Mosaico fotografico global de reflectancia/albedo LROC WAC (2048x1024).
  - moon_bump_lola.jpg: Mapa altimetrico/relieve global LOLA (Lunar Orbiter Laser Altimeter).

Destino: frontend/public/textures/

Uso:
    python scripts/fetch_moon_textures.py
"""

from __future__ import annotations

import hashlib
import json
import ssl
import sys
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEXTURES_DIR = ROOT / "frontend" / "public" / "textures"

TEXTURE_SOURCES = [
    {
        "filename": "moon_albedo_map.jpg",
        "description": "NASA LRO WAC Global Photographic Color/Albedo Mosaic (SVS #4720 CGI Moon Kit)",
        "primary_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg",
        "fallback_urls": [
            "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/moon_1024.jpg",
        ],
        "min_size_bytes": 100_000,
    },
    {
        "filename": "moon_bump_lola.jpg",
        "description": "NASA LRO LOLA Global Altimetry/Bump Elevation Map (SVS #4720 CGI Moon Kit)",
        "primary_url": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/ldem_3_8bit.jpg",
        "fallback_urls": [],
        "min_size_bytes": 50_000,
    },
]


def _create_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def download_file(url: str, dest: Path) -> bool:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "LunarLandingNavigator/1.0 (NASA Space Apps Challenge 2026; https://github.com/Pamugo/lunar-landing-navigator)",
        },
    )
    ctx = _create_ssl_context()
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            if resp.status != 200:
                print(f"  [ERROR] HTTP {resp.status} al descargar {url}", file=sys.stderr)
                return False
            data = resp.read()
            dest.write_bytes(data)
            return True
    except Exception as e:
        print(f"  [AVISO] Fallo al descargar de {url}: {e}", file=sys.stderr)
        return False


def fetch_all_textures() -> bool:
    TEXTURES_DIR.mkdir(parents=True, exist_ok=True)
    print("=" * 80)
    print(" LUNAR LANDING SITE NAVIGATOR — DESCARGA DE TEXTURAS REALES NASA (LROC + LOLA)")
    print("=" * 80)
    print(f"  Destino: {TEXTURES_DIR}\n")

    manifest_entries: list[dict[str, object]] = []
    all_ok = True

    for item in TEXTURE_SOURCES:
        filename = str(item["filename"])
        dest_path = TEXTURES_DIR / filename
        min_size = int(item["min_size_bytes"])
        desc = str(item["description"])
        print(f"-> Verificando {filename} ({desc})...")

        downloaded = False
        if dest_path.is_file() and dest_path.stat().st_size >= min_size:
            print(f"   [CACHE] Archivo existente valido ({dest_path.stat().st_size:,} bytes).")
            downloaded = True
        else:
            urls_to_try = [str(item["primary_url"])] + [str(u) for u in item["fallback_urls"]]
            for url in urls_to_try:
                print(f"   Descargando desde {url}...")
                if download_file(url, dest_path):
                    size = dest_path.stat().st_size
                    if size >= min_size:
                        print(f"   [OK] Descarga completada con exito ({size:,} bytes).")
                        downloaded = True
                        break
                    print(f"   [ERROR] Archivo descargado demasiado pequenio ({size} < {min_size} bytes).")
                    dest_path.unlink(missing_ok=True)

        if not downloaded:
            print(f"   [FALLO CRITICO] No se pudo obtener {filename}.", file=sys.stderr)
            all_ok = False
            continue

        file_bytes = dest_path.read_bytes()
        sha256 = hashlib.sha256(file_bytes).hexdigest()
        manifest_entries.append(
            {
                "filename": filename,
                "description": desc,
                "size_bytes": len(file_bytes),
                "sha256": sha256,
                "source": item["primary_url"],
            }
        )

    manifest_path = TEXTURES_DIR / "manifest.json"
    manifest_data = {
        "generated_at_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "provenance": "NASA Scientific Visualization Studio (SVS #4720 CGI Moon Kit, LRO WAC + LOLA)",
        "textures": manifest_entries,
    }
    manifest_path.write_text(json.dumps(manifest_data, indent=2), encoding="utf-8")
    print(f"\n[OK] Manifiesto guardado en {manifest_path}")

    return all_ok


if __name__ == "__main__":
    success = fetch_all_textures()
    sys.exit(0 if success else 1)
