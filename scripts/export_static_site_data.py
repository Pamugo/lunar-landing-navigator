"""Exports precomputed NASA DE421 + LOLA DEM static datasets for GitHub Pages / offline static hosting.

Generates JSON bundles under frontend/public/static-api/ directly from the verified Python backend:
  - bootstrap.json        (/api/v1/health, /api/v1/sites, /api/v1/hardware-profiles)
  - horizons.json         (360-deg horizon profiles at standard hardware heights for curated sites)
  - terrain_patches.json  (96x96 LOLA elevation patches for curated sites)
  - presets.json          (30-day DE421 Sun & Earth ephemeris grids for standard mission windows)
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.models.schemas import (  # noqa: E402
    CONTRACT_VERSION,
    EphemerisKernel,
    HorizonRequest,
    LunarCoordinate,
    ResolutionProfile,
)
from app.services.ephemeris import compute_body_ephemeris, compute_scientific_verification_seal  # noqa: E402
from app.services.horizon import compute_horizon_profile  # noqa: E402
from app.services.terrain import (  # noqa: E402
    extract_terrain_patch,
    load_curated_sites,
    load_hardware_profiles,
)

OUT_DIR = ROOT / "frontend/public/static-api"

PRESET_STARTS: list[str] = [
    "2026-11-15T00:00:00Z",
    "2026-12-21T00:00:00Z",
    "2027-06-21T00:00:00Z",
    "2027-09-15T00:00:00Z",
]
PRESET_DAYS: int = 30
PRESET_STEP_MIN: int = 120


def _round_list(values: list[float], decimals: int) -> list[float]:
    return [round(float(v), decimals) for v in values]


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    sites = load_curated_sites()
    hardware_profiles = load_hardware_profiles()
    seal = compute_scientific_verification_seal()

    bootstrap_payload = {
        "health": {
            "status": "ok",
            "contract_version": CONTRACT_VERSION,
            "scientific_seal": seal.model_dump(mode="json"),
        },
        "sites": [s.model_dump(mode="json") for s in sites],
        "hardware_profiles": [h.model_dump(mode="json") for h in hardware_profiles],
    }
    (OUT_DIR / "bootstrap.json").write_text(
        json.dumps(bootstrap_payload, separators=(",", ":")),
        encoding="utf-8",
    )

    # Horizons for curated sites across all standard hardware mast heights
    heights = sorted({round(float(h.observer_height_m), 2) for h in hardware_profiles} | {2.0})
    horizons_payload: dict[str, object] = {
        "heights_m": heights,
        "sites": {},
    }
    horizons_sites: dict[str, object] = {}

    terrain_payload: dict[str, object] = {}

    for site in sites:
        base_coord = LunarCoordinate(
            lat_deg=site.lat_deg,
            lon_deg=site.lon_deg,
            observer_height_m=2.0,
            site_id=site.id,
        )
        base_horizon = compute_horizon_profile(
            HorizonRequest(
                site=base_coord,
                azimuth_step_deg=0.5,
                max_distance_km=150.0,
                dem_product=None,
            )
        )
        elevations_by_height: dict[str, list[float]] = {}
        for h_m in heights:
            h_coord = LunarCoordinate(
                lat_deg=site.lat_deg,
                lon_deg=site.lon_deg,
                observer_height_m=h_m,
                site_id=site.id,
            )
            prof = compute_horizon_profile(
                HorizonRequest(
                    site=h_coord,
                    azimuth_step_deg=0.5,
                    max_distance_km=150.0,
                    dem_product=None,
                )
            )
            elevations_by_height[f"{h_m:.1f}"] = _round_list(prof.horizon_elevation_deg, 4)

        horizons_sites[site.id] = {
            "site_elevation_m": round(base_horizon.site_elevation_m, 2),
            "azimuth_step_deg": 0.5,
            "dem_product": base_horizon.dem_product,
            "horizon_source": base_horizon.horizon_source.value,
            "max_distance_km": base_horizon.max_distance_km,
            "truncated": base_horizon.truncated,
            "obstacle_distance_km": _round_list(base_horizon.obstacle_distance_km, 3),
            "elevations_by_height": elevations_by_height,
        }

        patch = extract_terrain_patch(
            site=base_coord,
            half_extent_km=10.0,
            resolution_profile=ResolutionProfile.DESKTOP,
        )
        terrain_payload[site.id] = {
            "grid_size": patch.grid_size,
            "half_extent_km": patch.half_extent_km,
            "step_m": round(patch.step_m, 3),
            "x_coords_m": _round_list(patch.x_coords_m, 2),
            "y_coords_m": _round_list(patch.y_coords_m, 2),
            "elevations_m": [_round_list(row, 2) for row in patch.elevations_m],
            "min_elevation_m": round(patch.min_elevation_m, 2),
            "max_elevation_m": round(patch.max_elevation_m, 2),
            "site_elevation_m": round(patch.site_elevation_m, 2),
            "horizon_source": patch.horizon_source.value,
            "dem_product": patch.dem_product,
        }

    horizons_payload["sites"] = horizons_sites
    (OUT_DIR / "horizons.json").write_text(
        json.dumps(horizons_payload, separators=(",", ":")),
        encoding="utf-8",
    )
    (OUT_DIR / "terrain_patches.json").write_text(
        json.dumps(terrain_payload, separators=(",", ":")),
        encoding="utf-8",
    )

    # Precompute 30-day DE421 topocentric Sun + Earth series at step 120 min for standard windows
    presets_payload: dict[str, object] = {
        "step_minutes": PRESET_STEP_MIN,
        "days": PRESET_DAYS,
        "windows": {},
    }
    windows_dict: dict[str, object] = {}

    n_steps = (PRESET_DAYS * 24 * 60) // PRESET_STEP_MIN
    for start_iso in PRESET_STARTS:
        start_dt = datetime.fromisoformat(start_iso.replace("Z", "+00:00")).astimezone(UTC)
        times_utc = [start_dt + timedelta(minutes=k * PRESET_STEP_MIN) for k in range(n_steps + 1)]
        times_iso = [t.strftime("%Y-%m-%dT%H:%M:%SZ") for t in times_utc]

        site_series: dict[str, object] = {}
        for site in sites:
            coord = LunarCoordinate(
                lat_deg=site.lat_deg,
                lon_deg=site.lon_deg,
                observer_height_m=2.0,
                site_id=site.id,
            )
            elev_m = float(horizons_sites[site.id]["site_elevation_m"])  # type: ignore[index]
            sun_samples = compute_body_ephemeris("sun", coord, times_utc, site_elevation_m=elev_m, kernel=EphemerisKernel.DE421)
            earth_samples = compute_body_ephemeris("earth", coord, times_utc, site_elevation_m=elev_m, kernel=EphemerisKernel.DE421)

            packed = [
                [
                    round(s["azimuth_deg"], 4),
                    round(s["elevation_deg"], 4),
                    round(s["distance_km"], 1),
                    round(s["angular_radius_deg"], 5),
                    round(e["azimuth_deg"], 4),
                    round(e["elevation_deg"], 4),
                    round(e["distance_km"], 1),
                    round(e["angular_radius_deg"], 5),
                ]
                for s, e in zip(sun_samples, earth_samples, strict=True)
            ]
            site_series[site.id] = packed

        windows_dict[start_iso] = {
            "times_utc": times_iso,
            "sites": site_series,
        }

    presets_payload["windows"] = windows_dict
    (OUT_DIR / "presets.json").write_text(
        json.dumps(presets_payload, separators=(",", ":")),
        encoding="utf-8",
    )

    for fn in sorted(OUT_DIR.glob("*.json")):
        print(f"Generated {fn.name}: {fn.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
