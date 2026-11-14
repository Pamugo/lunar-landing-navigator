"""Validacion del catalogo de sitios curados (RF-01) y proyeccion estereografica polar sur (RT-02).

Propietario: qa-verification-agent.
Ejecutable con stdlib (unittest) sin dependencias externas.
"""

from __future__ import annotations

import json
import math
import unittest
from pathlib import Path

from tests.oracles.horizon_oracle import R_MOON_M

ROOT = Path(__file__).resolve().parents[2]
DEG = math.pi / 180.0


def south_polar_stereo_forward(lat_rad: float, lon_rad: float, radius_m: float = R_MOON_M) -> tuple[float, float]:
    """Oraculo analitico: proyeccion estereografica polar sur (esfera R=1737.4 km, verdadera escala en 90S)."""
    rho = 2.0 * radius_m * math.tan(math.pi / 4.0 + lat_rad / 2.0)
    x = rho * math.sin(lon_rad)
    y = rho * math.cos(lon_rad)
    return x, y


def south_polar_stereo_inverse(x_m: float, y_m: float, radius_m: float = R_MOON_M) -> tuple[float, float]:
    """Oraculo analitico inverso: (x, y) -> (lat_rad, lon_rad)."""
    rho = math.hypot(x_m, y_m)
    if rho == 0.0:
        return -math.pi / 2.0, 0.0
    lat = -(math.pi / 2.0 - 2.0 * math.atan(rho / (2.0 * radius_m)))
    lon = math.atan2(x_m, y_m)
    return lat, lon


class TestCuratedSitesCatalog(unittest.TestCase):
    """RF-01: catalogo inicial de sitios curados en data/curated_sites.json."""

    def setUp(self) -> None:
        self.data = json.loads((ROOT / "data/curated_sites.json").read_text(encoding="utf-8"))
        self.sites = {s["id"]: s for s in self.data["sites"]}

    def test_minimum_six_sites_and_mandatory_missions(self) -> None:
        self.assertGreaterEqual(len(self.sites), 6)
        for site_id in ("apollo-11", "apollo-17", "shackleton-rim", "malapert-massif", "cabeus-crater"):
            self.assertIn(site_id, self.sites)
        self.assertTrue("mons-mouton-leibnitz-beta" in self.sites or "nobile-rim-1" in self.sites)

    def test_coordinates_and_dual_descriptions(self) -> None:
        for site_id, s in self.sites.items():
            self.assertGreaterEqual(s["lat_deg"], -90.0, msg=site_id)
            self.assertLessEqual(s["lat_deg"], 90.0, msg=site_id)
            self.assertGreaterEqual(s["lon_deg"], -180.0, msg=site_id)
            self.assertLessEqual(s["lon_deg"], 180.0, msg=site_id)
            self.assertTrue(len(s["description_tech"]) > 20, msg=site_id)
            self.assertTrue(len(s["description_edu"]) > 20, msg=site_id)
            self.assertIn(s["verification_status"], {"verified_literature", "approximate_pending_lola"})


class TestSouthPolarStereographicOracle(unittest.TestCase):
    """RT-02: oraculo de proyeccion estereografica polar sur (skills/lola-topography-horizon/SKILL.md §2)."""

    def test_south_pole_maps_to_origin(self) -> None:
        x, y = south_polar_stereo_forward(-90.0 * DEG, 0.0)
        self.assertAlmostEqual(x, 0.0, delta=1e-9)
        self.assertAlmostEqual(y, 0.0, delta=1e-9)
        lat, _ = south_polar_stereo_inverse(0.0, 0.0)
        self.assertAlmostEqual(lat / DEG, -90.0, delta=1e-12)

    def test_roundtrip_on_south_polar_sites(self) -> None:
        samples = [
            (-89.68, -166.0),  # Shackleton Rim
            (-86.00, 2.7),     # Malapert Massif
            (-84.675, -48.725),  # Cabeus
            (-84.7906, 29.1957),  # Mons Mouton (IM-2 Athena)
            (-85.4, 35.0),     # Nobile Rim 1
        ]
        for lat_deg, lon_deg in samples:
            x, y = south_polar_stereo_forward(lat_deg * DEG, lon_deg * DEG)
            lat2, lon2 = south_polar_stereo_inverse(x, y)
            self.assertAlmostEqual(lat2 / DEG, lat_deg, delta=1e-9)
            self.assertAlmostEqual(lon2 / DEG, lon_deg, delta=1e-9)


if __name__ == "__main__":
    unittest.main()
