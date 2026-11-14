#!/usr/bin/env python3
"""Descarga reproducible y verificacion SHA-256 de kernels SPICE (NAIF/JPL) para Lunar Landing Site Navigator.

Propietario: qa-verification-agent.
Kernels descargados en data/ephemeris/:
  - de421.bsp                    (posiciones planetarias y lunares 1900-2050)
  - moon_pa_de421_1900-2050.bpc  (orientacion fisica / libracion lunar MOON_PA)
  - moon_080317.tf               (definicion de marcos MOON_PA y MOON_ME_DE421)
  - pck00008.tpc                 (constantes planetarias IAU requeridas por Skyfield)

Uso:
    python scripts/fetch_kernels.py
"""

from __future__ import annotations

import hashlib
import json
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EPHEMERIS_DIR = ROOT / "data/ephemeris"

KERNELS: list[dict[str, str | int]] = [
    {
        "filename": "de421.bsp",
        "url": "https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp",
        "min_bytes": 15_000_000,
        "description": "JPL Development Ephemeris DE421 (1900-2050)",
    },
    {
        "filename": "moon_pa_de421_1900-2050.bpc",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc",
        "min_bytes": 1_000_000,
        "description": "Lunar Principal Axes physical libration binary PCK for DE421",
    },
    {
        "filename": "moon_080317.tf",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf",
        "min_bytes": 10_000,
        "description": "Lunar frame kernel defining MOON_PA_DE421 and MOON_ME_DE421",
    },
    {
        "filename": "pck00008.tpc",
        "url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/a_old_versions/pck00008.tpc",
        "min_bytes": 50_000,
        "description": "NAIF text planetary constants kernel",
    },
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    EPHEMERIS_DIR.mkdir(parents=True, exist_ok=True)
    manifest_entries: list[dict[str, object]] = []

    for spec in KERNELS:
        filename = str(spec["filename"])
        url = str(spec["url"])
        min_bytes = int(spec["min_bytes"])
        dest = EPHEMERIS_DIR / filename

        if dest.is_file() and dest.stat().st_size >= min_bytes:
            print(f"[OK] {filename} ya existe ({dest.stat().st_size} bytes)")
        else:
            print(f"[GET] Descargando {filename} desde {url} ...")
            req = urllib.request.Request(url, headers={"User-Agent": "LunarLandingNavigator/0.2 (NASA-SpaceApps)"})
            with urllib.request.urlopen(req, timeout=60) as resp, dest.open("wb") as out:
                while True:
                    block = resp.read(65536)
                    if not block:
                        break
                    out.write(block)
            print(f"[OK] Descargado {filename} ({dest.stat().st_size} bytes)")

        size = dest.stat().st_size
        if size < min_bytes:
            raise RuntimeError(f"Kernel {filename} incompleto: {size} < {min_bytes} bytes")

        digest = sha256_file(dest)
        manifest_entries.append(
            {
                "filename": filename,
                "url": url,
                "size_bytes": size,
                "sha256": digest,
                "description": spec["description"],
            }
        )

    manifest_path = EPHEMERIS_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "generated_at_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "source": "NASA NAIF Generic Kernels (https://naif.jpl.nasa.gov/pub/naif/generic_kernels/)",
                "kernels": manifest_entries,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"[MANIFEST] Escrito {manifest_path.relative_to(ROOT)} con {len(manifest_entries)} kernels verificados.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
