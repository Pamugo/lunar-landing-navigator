"""Tests de integracion de los endpoints FastAPI /api/v1 y esquema OpenAPI (Tarea 2.1).

Propietario: qa-verification-agent.
Ejecuta los controladores de app.main y app.api.routes validando la serializacion JSON completa
sin abrir sockets loopback (compatible 100 % con el sandbox de Windows).
"""

from __future__ import annotations

import unittest
from datetime import UTC, datetime

from fastapi import HTTPException

from app.api.routes import (
    list_curated_sites,
    list_hardware_profiles,
    post_compare,
    post_dte_analysis,
    post_horizon,
    post_terrain_patch,
    post_visibility,
)
from app.main import app, health
from app.models.schemas import (
    ComparisonRequest,
    EphemerisKernel,
    HorizonRequest,
    LunarCoordinate,
    ResolutionProfile,
    TerrainPatchRequest,
    TimeWindow,
    VisibilityRequest,
)


class TestFastApiEndpoints(unittest.TestCase):
    """Verifica todos los contratos de /api/v1 y el esquema OpenAPI generado por FastAPI."""

    def test_openapi_schema_exposes_all_v1_routes(self) -> None:
        schema = app.openapi()
        paths = set(schema.get("paths", {}).keys())
        expected = {
            "/api/v1/health",
            "/api/v1/sites",
            "/api/v1/hardware-profiles",
            "/api/v1/horizon",
            "/api/v1/terrain-patch",
            "/api/v1/visibility",
            "/api/v1/compare",
        }
        self.assertTrue(expected.issubset(paths), f"Faltan rutas en OpenAPI: {expected - paths}")

    def test_health_returns_contract_version_and_jpl_horizons_seal(self) -> None:
        body = health().model_dump(mode="json")
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["contract_version"], "0.2.0")
        seal = body["scientific_seal"]
        self.assertEqual(seal["refraction"], "AIRLESS")
        self.assertEqual(seal["ephemeris_kernel"], "de421.bsp")
        self.assertLessEqual(seal["max_el_error_deg"], 0.0001)
        self.assertLessEqual(seal["max_az_error_deg"], 0.0001)

    def test_get_sites_and_hardware_profiles(self) -> None:
        sites = [s.model_dump(mode="json") for s in list_curated_sites()]
        self.assertEqual(len(sites), 9)
        self.assertTrue(all(s["quickmap_url"].startswith("https://quickmap.lroc.im-ldi.com/") for s in sites))

        hw = [h.model_dump(mode="json") for h in list_hardware_profiles()]
        self.assertGreaterEqual(len(hw), 5)
        ids = {h["id"] for h in hw}
        self.assertIn("csa-utility-rover", ids)

    def test_post_horizon_polar_and_equatorial_fallback(self) -> None:
        polar_req = HorizonRequest(
            site=LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=1.5, site_id="shackleton-rim"),
            azimuth_step_deg=0.5,
            max_distance_km=150.0,
        )
        polar_data = post_horizon(polar_req).model_dump(mode="json")
        self.assertEqual(len(polar_data["azimuths_deg"]), 720)
        self.assertIn(polar_data["horizon_source"], ["lola_dem", "lola_dem_cached"])

        eq_req = HorizonRequest(
            site=LunarCoordinate(lat_deg=0.67409, lon_deg=23.47298, observer_height_m=2.0, site_id="apollo-11"),
            azimuth_step_deg=1.0,
            max_distance_km=150.0,
        )
        eq_data = post_horizon(eq_req).model_dump(mode="json")
        self.assertEqual(eq_data["horizon_source"], "spherical_analytical")

    def test_post_terrain_patch_adaptive_mobile_and_desktop(self) -> None:
        req = TerrainPatchRequest(
            site=LunarCoordinate(lat_deg=-86.0, lon_deg=2.7, observer_height_m=3.5, site_id="malapert-massif"),
            half_extent_km=8.0,
            resolution_profile=ResolutionProfile.MOBILE,
        )
        data = post_terrain_patch(req).model_dump(mode="json")
        self.assertEqual(data["grid_size"], 32)

    def test_post_visibility_compare_and_validation_error(self) -> None:
        window = TimeWindow(
            start_utc=datetime(2027, 1, 1, 0, 0, tzinfo=UTC),
            end_utc=datetime(2027, 1, 5, 0, 0, tzinfo=UTC),
            step_minutes=120.0,
        )
        vis_req = VisibilityRequest(
            site=LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=1.5, site_id="shackleton-rim"),
            window=window,
            dte_elevation_mask_deg=0.0,
            ephemeris=EphemerisKernel.DE421,
        )
        vis_body = post_visibility(vis_req).model_dump(mode="json")
        self.assertEqual(len(vis_body["samples"]), 49)
        self.assertFalse(vis_body["computation"]["refraction"])

        cmp_req = ComparisonRequest(
            sites=[
                LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=1.5, site_id="shackleton-rim"),
                LunarCoordinate(lat_deg=-86.0, lon_deg=2.7, observer_height_m=3.5, site_id="malapert-massif"),
            ],
            window=window,
            dte_elevation_mask_deg=0.0,
            ephemeris=EphemerisKernel.DE421,
        )
        cmp_body = post_compare(cmp_req).model_dump(mode="json")
        self.assertEqual(len(cmp_body["metrics"]), 2)
        self.assertIn("advanced_dte", cmp_body["metrics"][0])
        self.assertIn("fspl_x_band_db", cmp_body["metrics"][0]["advanced_dte"])

        dte_body = post_dte_analysis(vis_req).model_dump(mode="json")
        self.assertIn("fspl_ka_band_db", dte_body)
        self.assertGreater(dte_body["fspl_ka_band_db"], dte_body["fspl_x_band_db"])

        bad_window = TimeWindow(
            start_utc=datetime(2027, 1, 5, 0, 0, tzinfo=UTC),
            end_utc=datetime(2027, 1, 1, 0, 0, tzinfo=UTC),
            step_minutes=60.0,
        )
        with self.assertRaises(HTTPException) as ctx:
            post_visibility(VisibilityRequest(site=vis_req.site, window=bad_window))
        self.assertEqual(ctx.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
