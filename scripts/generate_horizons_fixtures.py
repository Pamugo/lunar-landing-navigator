#!/usr/bin/env python3
"""Scientific validation fixture generator from NASA JPL Horizons API (RT-01).

Owner: qa-verification-agent.
Queries JPL Horizons (https://ssd.jpl.nasa.gov/api/horizons.api) with:
  - CENTER='coord@301' (lunar surface, IAU sphere R = 1737.4 km)
  - COMMAND='10' (Sun) and COMMAND='399' (Earth)
  - APPARENT='AIRLESS' (zero atmospheric bending, includes light-time and aberration)
  - QUANTITIES='4,20' (apparent Az/El in degrees and observer-body range in AU)

Stores versioned fixtures in backend/tests/fixtures/horizons/horizons_reference.json
so the test suite stays 100% deterministic and network-free during normal runs.

Usage:
    python scripts/generate_horizons_fixtures.py
"""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FIXTURE_PATH = ROOT / "backend/tests/fixtures/horizons/horizons_reference.json"
AU_KM = 149_597_870.700

SITES = [
    {
        "site_id": "shackleton-rim",
        "name": "Shackleton Rim",
        "lat_deg": -89.68,
        "lon_deg": -166.0,
        "elevation_m": 2120.0,
    },
    {
        "site_id": "malapert-massif",
        "name": "Malapert Massif",
        "lat_deg": -86.0,
        "lon_deg": 2.7,
        "elevation_m": 4650.0,
    },
    {
        "site_id": "mons-mouton-leibnitz-beta",
        "name": "Mons Mouton (IM-2 Athena)",
        "lat_deg": -84.7906,
        "lon_deg": 29.1957,
        "elevation_m": 5321.0,
    },
    {
        "site_id": "apollo-11",
        "name": "Apollo 11 - Tranquility Base",
        "lat_deg": 0.67409,
        "lon_deg": 23.47298,
        "elevation_m": -1900.0,
    },
    {
        "site_id": "change-4",
        "name": "Chang'e 4 (Farside Control)",
        "lat_deg": -45.4446,
        "lon_deg": 177.5991,
        "elevation_m": -5925.0,
    },
]

Bodies = [("sun", "10"), ("earth", "399")]


def fetch_horizons_series(
    body_code: str,
    lat_deg: float,
    lon_deg: float,
    elevation_m: float,
    start_utc: str = "2027-01-01 00:00",
    stop_utc: str = "2027-01-03 00:00",
    step_size: str = "6 h",
) -> list[dict[str, object]]:
    alt_km = elevation_m / 1000.0
    lon_360 = lon_deg % 360.0
    params = {
        "format": "json",
        "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER",
        "COMMAND": f"'{body_code}'",
        "CENTER": "'coord@301'",
        "COORD_TYPE": "'GEODETIC'",
        "SITE_COORD": f"'{lon_360:.6f},{lat_deg:.6f},{alt_km:.6f}'",
        "START_TIME": f"'{start_utc}'",
        "STOP_TIME": f"'{stop_utc}'",
        "STEP_SIZE": f"'{step_size}'",
        "QUANTITIES": "'4,20'",
        "ANG_FORMAT": "'DEG'",
        "APPARENT": "'AIRLESS'",
        "CSV_FORMAT": "'YES'",
    }
    url = "https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "LunarLandingNavigator/0.2 (NASA-SpaceApps)"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        payload = json.loads(resp.read().decode("utf-8"))

    raw_text = payload.get("result", "")
    if "$$SOE" not in raw_text or "$$EOE" not in raw_text:
        raise RuntimeError(f"Unexpected response from JPL Horizons:\n{raw_text[:600]}")

    block = raw_text.split("$$SOE", 1)[1].split("$$EOE", 1)[0].strip()
    rows: list[dict[str, object]] = []
    for line in block.splitlines():
        [p.strip() for p in line.split(",") if p.strip() != ""]
        # CSV format with QUANTITIES='4,20':
        # [0]=Date__(UT)__HR:MN, [1]=solar/lunar presence, [2]=Azimuth_(a-app), [3]=Elevation_(a-app), [4]=delta(AU), [5]=deldot
        # Note: if there are empty columns between commas, split without filtering empty strings:
        raw_cols = [c.strip() for c in line.split(",")]
        if len(raw_cols) < 6:
            continue
        date_str = raw_cols[0]
        az_deg = float(raw_cols[3])
        el_deg = float(raw_cols[4])
        delta_au = float(raw_cols[5])
        dt = datetime.strptime(date_str, "%Y-%b-%d %H:%M").replace(tzinfo=UTC)
        rows.append(
            {
                "time_utc": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "azimuth_deg": az_deg,
                "elevation_deg": el_deg,
                "distance_km": delta_au * AU_KM,
            }
        )
    return rows


def main() -> int:
    FIXTURE_PATH.parent.mkdir(parents=True, exist_ok=True)
    cases: list[dict[str, object]] = []
    for site in SITES:
        site_entry: dict[str, object] = {
            "site_id": site["site_id"],
            "name": site["name"],
            "lat_deg": site["lat_deg"],
            "lon_deg": site["lon_deg"],
            "elevation_m": site["elevation_m"],
            "bodies": {},
        }
        for body_name, code in Bodies:
            print(f"[HORIZONS] Querying {body_name} ({code}) for {site['site_id']} ...")
            samples = fetch_horizons_series(
                body_code=code,
                lat_deg=float(site["lat_deg"]),
                lon_deg=float(site["lon_deg"]),
                elevation_m=float(site["elevation_m"]),
            )
            site_entry["bodies"][body_name] = samples  # type: ignore[index]
        cases.append(site_entry)

    fixture_doc = {
        "oracle": "NASA/JPL Horizons System API (https://ssd.jpl.nasa.gov/api/horizons.api)",
        "generated_at_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "parameters": {
            "CENTER": "coord@301 (Lunar body-fixed frame)",
            "APPARENT": "AIRLESS (no atmospheric refraction, light-time + stellar aberration enabled)",
            "QUANTITIES": "4 (apparent Az/El), 20 (observer range)",
        },
        "sites": cases,
    }
    FIXTURE_PATH.write_text(json.dumps(fixture_doc, indent=2), encoding="utf-8")
    print(f"[OK] Fixture written to {FIXTURE_PATH.relative_to(ROOT)} ({len(cases)} sites)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
