"""Airless 360-deg lunar topographic horizon raycasting, offline .npz cache, and spherical fallback (RT-02, RT-03).

Owner: astro-terrain-specialist.
Math reference: docs/MATH_MODELS.md §2.1-2.3.
Procedure: skills/lola-topography-horizon/SKILL.md.
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import numpy.typing as npt

from app.models.schemas import HorizonProfile, HorizonRequest, HorizonSource, LunarCoordinate
from app.services.terrain import (
    R_MOON_M,
    LolaDemDataset,
    get_default_polar_dem,
    latlon_to_stereographic,
    load_curated_sites,
)

ROOT = Path(__file__).resolve().parents[3]
HORIZON_CACHE_DIR = ROOT / "data/lola_dem/cache"


def _cache_filepath(req: HorizonRequest, dem_product: str) -> Path:
    HORIZON_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    site_tag = req.site.site_id or f"lat{req.site.lat_deg:.4f}_lon{req.site.lon_deg:.4f}"
    key = (
        f"horizon_{site_tag}_{dem_product}"
        f"_lat{req.site.lat_deg:.4f}_lon{req.site.lon_deg:.4f}"
        f"_h{req.site.observer_height_m:.2f}"
        f"_step{req.azimuth_step_deg:.2f}_L{req.max_distance_km:.1f}.npz"
    )
    safe_key = key.replace(" ", "_").replace("/", "_")
    return HORIZON_CACHE_DIR / safe_key


def _build_radial_grid_m(max_distance_m: float) -> npt.NDArray[np.float64]:
    """Adaptive radial mesh [m]: high density in near field (~2.6 km tangency) and mid/far field out to L."""
    s1 = np.arange(10.0, min(3_500.0, max_distance_m) + 1.0, 15.0, dtype=np.float64)
    if max_distance_m <= 3_500.0:
        return s1
    s2 = np.arange(3_550.0, min(30_000.0, max_distance_m) + 1.0, 50.0, dtype=np.float64)
    if max_distance_m <= 30_000.0:
        return np.concatenate([s1, s2])
    s3 = np.arange(30_200.0, max_distance_m + 1.0, 200.0, dtype=np.float64)
    return np.concatenate([s1, s2, s3])


def _spherical_analytical_profile(req: HorizonRequest, site_elev_m: float = 0.0) -> HorizonProfile:
    """Analytical smooth airless lunar sphere fallback (MATH_MODELS §2.2.2)."""
    h_mast = max(0.0, float(req.site.observer_height_m))
    dip_rad = math.acos(R_MOON_M / (R_MOON_M + h_mast))
    dip_deg = -math.degrees(dip_rad)
    d_hor_km = (R_MOON_M * dip_rad) / 1000.0

    n_az = round(360.0 / req.azimuth_step_deg)
    azimuths_deg = [round(k * req.azimuth_step_deg, 4) for k in range(n_az)]
    elevs_deg = [round(dip_deg, 6) for _ in range(n_az)]
    dists_km = [round(d_hor_km, 4) for _ in range(n_az)]

    return HorizonProfile(
        site=req.site,
        site_elevation_m=round(site_elev_m, 2),
        azimuths_deg=azimuths_deg,
        horizon_elevation_deg=elevs_deg,
        obstacle_distance_km=dists_km,
        dem_product="SPHERICAL_R1737400M",
        horizon_source=HorizonSource.SPHERICAL_ANALYTICAL,
        max_distance_km=req.max_distance_km,
        truncated=False,
    )


def compute_horizon_profile(
    req: HorizonRequest,
    dem: LolaDemDataset | None = None,
    use_cache: bool = True,
) -> HorizonProfile:
    """Computes the airless 360-deg horizon profile along great circles (MATH_MODELS §2.1-2.3).

    - If present in .npz cache and use_cache=True -> returns with horizon_source='lola_dem_cached'.
    - If inside the south polar DEM -> LOLA topographic raycasting ('lola_dem').
    - If outside the south polar DEM -> clean 'spherical_analytical' fallback (never 500 error).
    """
    active_dem = dem or get_default_polar_dem()
    dem_name = req.dem_product or active_dem.product_name

    lat_deg = float(req.site.lat_deg)
    if abs(lat_deg) > 89.9999:
        lat_deg = math.copysign(89.9999, lat_deg)
    lat0_rad = math.radians(lat_deg)
    lon0_rad = math.radians(float(req.site.lon_deg))

    x0_m, y0_m = latlon_to_stereographic(lat0_rad, lon0_rad)

    # Check whether the site falls within the south polar DEM
    if req.site.lat_deg > -78.0 or not active_dem.contains_xy(x0_m, y0_m, margin_m=2_000.0):
        nominal_elev = 0.0
        if req.site.site_id:
            for c in load_curated_sites():
                if c.id == req.site.site_id and c.elevation_m is not None:
                    nominal_elev = float(c.elevation_m)
                    break
        return _spherical_analytical_profile(req, site_elev_m=nominal_elev)

    cache_path = _cache_filepath(req, dem_name)
    if use_cache and dem is None and cache_path.is_file():
        with np.load(cache_path) as npz:
            return HorizonProfile(
                site=req.site,
                site_elevation_m=float(npz["site_elevation_m"]),
                azimuths_deg=[float(v) for v in npz["azimuths_deg"]],
                horizon_elevation_deg=[float(v) for v in npz["horizon_elevation_deg"]],
                obstacle_distance_km=[float(v) for v in npz["obstacle_distance_km"]],
                dem_product=dem_name,
                horizon_source=HorizonSource.LOLA_DEM_CACHED,
                max_distance_km=req.max_distance_km,
                truncated=bool(npz["truncated"]),
            )

    site_elev_m = float(active_dem.sample_xy(x0_m, y0_m))
    if math.isnan(site_elev_m):
        site_elev_m = 0.0
    h0_m = site_elev_m + float(req.site.observer_height_m)

    n_az = round(360.0 / req.azimuth_step_deg)
    az_deg_arr = np.arange(n_az, dtype=np.float64) * req.azimuth_step_deg
    az_rad_arr = np.radians(az_deg_arr)[:, np.newaxis]  # (n_az, 1)

    max_dist_m = float(req.max_distance_km) * 1000.0
    s_m_arr = _build_radial_grid_m(max_dist_m)[np.newaxis, :]  # (1, n_s)
    theta_arr = s_m_arr / R_MOON_M  # (1, n_s)

    sin_lat0 = math.sin(lat0_rad)
    cos_lat0 = math.cos(lat0_rad)
    cos_theta = np.cos(theta_arr)
    sin_theta = np.sin(theta_arr)

    # Destination point along great circle (MATH_MODELS §2.3)
    sin_lat = np.clip(sin_lat0 * cos_theta + cos_lat0 * sin_theta * np.cos(az_rad_arr), -1.0, 1.0)
    lat_grid = np.arcsin(sin_lat)
    lon_grid = lon0_rad + np.arctan2(
        np.sin(az_rad_arr) * sin_theta * cos_lat0,
        cos_theta - sin_lat0 * sin_lat,
    )

    x_grid, y_grid = latlon_to_stereographic(lat_grid, lon_grid)
    h_grid = np.asarray(active_dem.sample_xy(x_grid, y_grid), dtype=np.float64)
    truncated = bool(np.isnan(h_grid).any())

    # Forma numericamente estable (MATH_MODELS §2.1):
    # gamma = atan2((h_i - h_0) - 2 * r_i * sin^2(theta/2), r_i * sin(theta))
    r_grid = R_MOON_M + h_grid
    sin_half = np.sin(theta_arr / 2.0)
    num = (h_grid - h0_m) - 2.0 * r_grid * (sin_half**2)
    den = r_grid * sin_theta
    gamma_grid = np.arctan2(num, den)

    # Ignore NaN when taking the maximum along each ray
    gamma_safe = np.where(np.isnan(gamma_grid), -np.inf, gamma_grid)
    max_idx = np.argmax(gamma_safe, axis=1)
    max_gamma_rad = gamma_safe[np.arange(n_az), max_idx]
    best_dist_m = s_m_arr[0, max_idx]

    # If an entire ray is NaN, fall back to spherical horizon depression
    dip_fallback = -math.acos(R_MOON_M / (R_MOON_M + max(0.0, float(req.site.observer_height_m))))
    max_gamma_rad = np.where(np.isneginf(max_gamma_rad), dip_fallback, max_gamma_rad)

    az_list = [round(float(v), 4) for v in az_deg_arr]
    gamma_deg_list = [round(float(math.degrees(v)), 6) for v in max_gamma_rad]
    dist_km_list = [round(float(v / 1000.0), 4) for v in best_dist_m]

    if use_cache and dem is None:
        np.savez_compressed(
            cache_path,
            site_elevation_m=np.float64(site_elev_m),
            azimuths_deg=np.asarray(az_list, dtype=np.float64),
            horizon_elevation_deg=np.asarray(gamma_deg_list, dtype=np.float64),
            obstacle_distance_km=np.asarray(dist_km_list, dtype=np.float64),
            truncated=np.bool_(truncated),
        )

    return HorizonProfile(
        site=req.site,
        site_elevation_m=round(site_elev_m, 2),
        azimuths_deg=az_list,
        horizon_elevation_deg=gamma_deg_list,
        obstacle_distance_km=dist_km_list,
        dem_product=dem_name,
        horizon_source=HorizonSource.LOLA_DEM,
        max_distance_km=req.max_distance_km,
        truncated=truncated,
    )


def interpolate_horizon_deg(
    profile: HorizonProfile,
    query_azimuths_deg: npt.NDArray[np.floating],
) -> npt.NDArray[np.float64]:
    """Circularly and linearly interpolates gamma_h(A) [deg] at requested azimuths [0, 360)."""
    az_base = np.asarray(profile.azimuths_deg, dtype=np.float64)
    el_base = np.asarray(profile.horizon_elevation_deg, dtype=np.float64)
    # Close the 360-deg loop with the 0-deg value
    az_ext = np.append(az_base, 360.0)
    el_ext = np.append(el_base, el_base[0])
    q = np.mod(np.asarray(query_azimuths_deg, dtype=np.float64), 360.0)
    return np.interp(q, az_ext, el_ext)


def ensure_curated_Master_cache() -> int:
    """Precomputes and verifies offline horizon .npz files for curated polar sites."""
    count = 0
    for site in load_curated_sites():
        if site.region != "south_polar":
            continue
        for h_m in (0.5, 1.5, 2.0, 3.5):
            coord = LunarCoordinate(
                lat_deg=site.lat_deg,
                lon_deg=site.lon_deg,
                observer_height_m=h_m,
                site_id=site.id,
            )
            req = HorizonRequest(site=coord, azimuth_step_deg=0.5, max_distance_km=150.0)
            compute_horizon_profile(req, use_cache=True)
            count += 1
    return count
