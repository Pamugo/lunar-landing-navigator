"""Oracles for the 360-degree horizon service, offline .npz cache, CSA hardware heights, and spherical fallback (RT-02, RT-03, RF-01).

Owner: qa-verification-agent.
"""

from __future__ import annotations

import math
import tempfile
import unittest
from pathlib import Path

from app.models.schemas import HorizonRequest, HorizonSource, LunarCoordinate
from app.services.horizon import compute_horizon_profile, ensure_curated_Master_cache
from app.services.terrain import LolaDemDataset, create_synthetic_south_pole_dem, load_curated_sites
from tests.oracles.horizon_oracle import smooth_sphere_dip

DEG = math.pi / 180.0


class TestHorizonServiceAndReliability(unittest.TestCase):
    """Verifies 360° raycasting over GeoTIFF, the offline cache, and spherical fallback."""

    def test_flat_dem_geotiff_reproduces_smooth_sphere_dip(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tif_path = Path(tmpdir) / "flat_pole.tif"
            create_synthetic_south_pole_dem(
                tif_path,
                half_extent_m=40_000.0,
                pixel_size_m=100.0,
                mode="flat_zero",
            )
            dem = LolaDemDataset(tif_path)
            site = LunarCoordinate(lat_deg=-89.9, lon_deg=0.0, observer_height_m=2.0)
            req = HorizonRequest(site=site, azimuth_step_deg=5.0, max_distance_km=25.0)
            profile = compute_horizon_profile(req, dem=dem, use_cache=False)

            expected_dip_deg = -smooth_sphere_dip(2.0) / DEG
            self.assertEqual(len(profile.azimuths_deg), 72)
            for gamma_deg in profile.horizon_elevation_deg:
                self.assertAlmostEqual(gamma_deg, expected_dip_deg, delta=2e-3)

    def test_synthetic_ring_wall_dem_raises_horizon_to_expected_elevation(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tif_path = Path(tmpdir) / "ring_pole.tif"
            # 1000 m tall ring at 15 km from the south pole
            create_synthetic_south_pole_dem(
                tif_path,
                half_extent_m=30_000.0,
                pixel_size_m=100.0,
                mode="ring_wall_15km_1000m",
            )
            dem = LolaDemDataset(tif_path)
            site = LunarCoordinate(lat_deg=-90.0, lon_deg=0.0, observer_height_m=2.0)
            req = HorizonRequest(site=site, azimuth_step_deg=5.0, max_distance_km=25.0)
            profile = compute_horizon_profile(req, dem=dem, use_cache=False)

            for gamma_deg in profile.horizon_elevation_deg:
                self.assertGreater(gamma_deg, 3.0)
                self.assertLess(gamma_deg, 4.2)

    def test_hardware_mast_height_monotonicity_csa_vs_clps(self) -> None:
        """Raising the mast (0.5 m LEAP -> 1.5 m CSA Rover -> 3.5 m CLPS Lander) lowers the horizon (higher visibility)."""
        site_05 = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=0.5, site_id="shackleton-rim")
        site_15 = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=1.5, site_id="shackleton-rim")
        site_35 = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=3.5, site_id="shackleton-rim")

        p_05 = compute_horizon_profile(HorizonRequest(site=site_05, azimuth_step_deg=2.0, max_distance_km=150.0), use_cache=False)
        p_15 = compute_horizon_profile(HorizonRequest(site=site_15, azimuth_step_deg=2.0, max_distance_km=150.0), use_cache=False)
        p_35 = compute_horizon_profile(HorizonRequest(site=site_35, azimuth_step_deg=2.0, max_distance_km=150.0), use_cache=False)

        mean_05 = sum(p_05.horizon_elevation_deg) / len(p_05.horizon_elevation_deg)
        mean_15 = sum(p_15.horizon_elevation_deg) / len(p_15.horizon_elevation_deg)
        mean_35 = sum(p_35.horizon_elevation_deg) / len(p_35.horizon_elevation_deg)

        self.assertLess(mean_15, mean_05)
        self.assertLess(mean_35, mean_15)

    def test_custom_equatorial_coordinates_graceful_spherical_fallback(self) -> None:
        """Coordinates outside the polar DEM never raise an exception: they fall back to spherical_analytical."""
        custom_site = LunarCoordinate(lat_deg=15.25, lon_deg=-42.8, observer_height_m=1.5)
        req = HorizonRequest(site=custom_site, azimuth_step_deg=1.0, max_distance_km=150.0)
        profile = compute_horizon_profile(req)

        self.assertEqual(profile.horizon_source, HorizonSource.SPHERICAL_ANALYTICAL)
        self.assertEqual(len(profile.azimuths_deg), 360)
        expected_dip_deg = -smooth_sphere_dip(1.5) / DEG
        for g in profile.horizon_elevation_deg:
            self.assertAlmostEqual(g, expected_dip_deg, delta=1e-6)

    def test_all_nine_curated_sites_have_precomputed_offline_cache(self) -> None:
        ensure_curated_Master_cache()
        for curated in load_curated_sites():
            coord = LunarCoordinate(
                lat_deg=curated.lat_deg,
                lon_deg=curated.lon_deg,
                observer_height_m=2.0,
                site_id=curated.id,
            )
            profile = compute_horizon_profile(HorizonRequest(site=coord, azimuth_step_deg=0.5, max_distance_km=150.0))
            self.assertEqual(len(profile.azimuths_deg), 720)
            if curated.region == "south_polar":
                self.assertIn(profile.horizon_source, {HorizonSource.LOLA_DEM, HorizonSource.LOLA_DEM_CACHED})
            else:
                self.assertEqual(profile.horizon_source, HorizonSource.SPHERICAL_ANALYTICAL)


if __name__ == "__main__":
    unittest.main()
