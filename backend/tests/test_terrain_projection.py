"""Oraculos de proyeccion estereografica polar LOLA, lectura GeoTIFF, mallas 3D adaptativas y deep-links (RT-02, RF-01, RF-06).

Propietario: qa-verification-agent.
"""

from __future__ import annotations

import math
import tempfile
import unittest
from pathlib import Path

from app.models.schemas import HorizonSource, LunarCoordinate, ResolutionProfile
from app.services.terrain import (
    R_MOON_M,
    LolaDemDataset,
    build_moontrek_url,
    build_quickmap_url,
    create_synthetic_south_pole_dem,
    extract_terrain_patch,
    latlon_to_stereographic,
    load_curated_sites,
    load_hardware_profiles,
    stereographic_to_latlon,
)
from tests.test_curated_sites import south_polar_stereo_forward, south_polar_stereo_inverse

DEG = math.pi / 180.0


class TestTerrainProjectionAndPortals(unittest.TestCase):
    """Verifica proyeccion estereografica polar sur, portales QuickMap/MoonTrek y catalogo CSA."""

    def test_projection_matches_analytical_oracle(self) -> None:
        coords = [
            (-90.0, 0.0),
            (-89.68, -166.0),
            (-86.0, 2.7),
            (-84.7906, 29.1957),
            (-84.675, -48.725),
        ]
        for lat_deg, lon_deg in coords:
            lat_rad, lon_rad = lat_deg * DEG, lon_deg * DEG
            x1, y1 = latlon_to_stereographic(lat_rad, lon_rad)
            x2, y2 = south_polar_stereo_forward(lat_rad, lon_rad, R_MOON_M)
            self.assertAlmostEqual(x1, x2, delta=1e-4)
            self.assertAlmostEqual(y1, y2, delta=1e-4)

            lat_back, lon_back = stereographic_to_latlon(x1, y1)
            lat_o, lon_o = south_polar_stereo_inverse(x2, y2, R_MOON_M)
            self.assertAlmostEqual(lat_back, lat_o, delta=1e-9)
            if abs(lat_deg) < 89.999:
                self.assertAlmostEqual(lon_back, lon_o, delta=1e-9)

    def test_quickmap_and_moontrek_deeplinks_use_official_domains(self) -> None:
        qm_polar = build_quickmap_url(-89.68, -166.0)
        self.assertTrue(qm_polar.startswith("https://quickmap.lroc.im-ldi.com/"))
        self.assertNotIn("asu.edu", qm_polar)
        self.assertIn("proj=17", qm_polar)

        qm_eq = build_quickmap_url(0.67409, 23.47298)
        self.assertIn("proj=16", qm_eq)

        mt = build_moontrek_url(-86.0, 2.7)
        self.assertTrue(mt.startswith("https://trek.nasa.gov/moon/"))

    def test_csa_and_clps_hardware_profiles_loaded(self) -> None:
        profiles = {p.id: p for p in load_hardware_profiles()}
        self.assertIn("csa-utility-rover", profiles)
        self.assertIn("csa-leap-payload", profiles)
        self.assertIn("clps-lander-mast", profiles)
        self.assertAlmostEqual(profiles["csa-utility-rover"].observer_height_m, 1.5)
        self.assertAlmostEqual(profiles["clps-lander-mast"].observer_height_m, 3.5)

        sites = load_curated_sites()
        self.assertGreaterEqual(len(sites), 9)
        for s in sites:
            self.assertIn(s.default_hardware_id, profiles)
            self.assertTrue(s.quickmap_url.startswith("https://quickmap.lroc.im-ldi.com/"))


class TestGeoTiffSamplingAndAdaptiveTerrainPatch(unittest.TestCase):
    """Verifica muestreo bilineal en GeoTIFF estereografico polar y mallas 3D multi-dispositivo."""

    def test_planar_slope_bilinear_interpolation_in_geotiff(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            tif_path = Path(tmpdir) / "test_polar.tif"
            # Campo lineal z(x, y) = 100.0 + 0.01*x - 0.02*y sobre [-20 km, 20 km]
            create_synthetic_south_pole_dem(
                tif_path,
                half_extent_m=20_000.0,
                pixel_size_m=200.0,
                mode="linear_plane",
            )
            dem = LolaDemDataset(tif_path)
            for x_m, y_m in [(0.0, 0.0), (3450.0, -7890.0), (-12345.0, 6789.0)]:
                expected = 100.0 + 0.01 * x_m - 0.02 * y_m
                sampled = float(dem.sample_xy(x_m, y_m))
                self.assertAlmostEqual(sampled, expected, delta=1e-2)

    def test_adaptive_terrain_patch_resolutions_and_fallback(self) -> None:
        polar_site = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=1.5, site_id="shackleton-rim")
        patch_mobile = extract_terrain_patch(
            site=polar_site,
            half_extent_km=5.0,
            resolution_profile=ResolutionProfile.MOBILE,
        )
        patch_tablet = extract_terrain_patch(
            site=polar_site,
            half_extent_km=5.0,
            resolution_profile=ResolutionProfile.TABLET,
        )
        patch_desktop = extract_terrain_patch(
            site=polar_site,
            half_extent_km=5.0,
            resolution_profile=ResolutionProfile.DESKTOP,
        )
        self.assertEqual(patch_mobile.grid_size, 32)
        self.assertEqual(patch_tablet.grid_size, 48)
        self.assertEqual(patch_desktop.grid_size, 96)
        self.assertEqual(len(patch_mobile.elevations_m), 32)
        self.assertEqual(len(patch_mobile.elevations_m[0]), 32)
        self.assertIn(patch_mobile.horizon_source, {HorizonSource.LOLA_DEM, HorizonSource.LOLA_DEM_CACHED})

        # Coordenada ecuatorial personalizada fuera del DEM polar -> fallback limpio sin error
        eq_custom = LunarCoordinate(lat_deg=12.5, lon_deg=40.0, observer_height_m=2.0)
        patch_eq = extract_terrain_patch(
            site=eq_custom,
            half_extent_km=5.0,
            resolution_profile=ResolutionProfile.MOBILE,
        )
        self.assertEqual(patch_eq.horizon_source, HorizonSource.SPHERICAL_ANALYTICAL)
        self.assertEqual(patch_eq.grid_size, 32)


if __name__ == "__main__":
    unittest.main()
