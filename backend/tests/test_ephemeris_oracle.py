"""Oraculos de efemerides lunares contra NASA JPL Horizons (RT-01) y sello de verificacion cientifica.

Propietario: qa-verification-agent.
Valida backend/app/services/ephemeris.py contra backend/tests/fixtures/horizons/horizons_reference.json
generado desde https://ssd.jpl.nasa.gov/api/horizons.api (CENTER='coord@301', APPARENT='AIRLESS').
"""

from __future__ import annotations

import json
import math
import unittest
from datetime import UTC, datetime
from pathlib import Path

from app.models.schemas import EphemerisKernel, LunarCoordinate
from app.services.ephemeris import compute_body_ephemeris, compute_scientific_verification_seal

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = ROOT / "backend/tests/fixtures/horizons/horizons_reference.json"


def _angular_diff_deg(a_deg: float, b_deg: float) -> float:
    return abs((a_deg - b_deg + 180.0) % 360.0 - 180.0)


class TestEphemerisHorizonsOracle(unittest.TestCase):
    """RT-01: validacion de Az/El aparentes (AIRLESS) en MOON_ME frente a JPL Horizons."""

    def test_sun_and_earth_az_el_match_jpl_horizons_fixtures(self) -> None:
        """Error de elevacion <= 0.01 deg (objetivo) / <= 0.05 deg (aceptacion) en todos los sitios de control."""
        self.assertTrue(FIXTURE_PATH.is_file(), "Falta fixture de JPL Horizons")
        fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

        max_el_err = 0.0
        max_az_err = 0.0

        for site_data in fixture["sites"]:
            site = LunarCoordinate(
                lat_deg=site_data["lat_deg"],
                lon_deg=site_data["lon_deg"],
                observer_height_m=0.0,
                site_id=site_data["site_id"],
            )
            site_elev_m = float(site_data["elevation_m"])

            for body_name in ("sun", "earth"):
                samples = site_data["bodies"][body_name]
                times_utc = [
                    datetime.strptime(row["time_utc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
                    for row in samples
                ]
                computed = compute_body_ephemeris(
                    body=body_name,
                    site=site,
                    times_utc=times_utc,
                    site_elevation_m=site_elev_m,
                    kernel=EphemerisKernel.DE421,
                )
                for ref_row, calc_row in zip(samples, computed, strict=True):
                    el_err = abs(calc_row["elevation_deg"] - float(ref_row["elevation_deg"]))
                    # Cerca del cenit o polo el acimut se pondera por cos(el) para medir error angular real
                    cos_el = max(0.1, abs(math.cos(math.radians(float(ref_row["elevation_deg"])))))
                    az_err = _angular_diff_deg(calc_row["azimuth_deg"], float(ref_row["azimuth_deg"])) * cos_el
                    max_el_err = max(max_el_err, el_err)
                    max_az_err = max(max_az_err, az_err)

                    # Criterio de aceptacion RT-01: <= 0.05 deg (objetivo <= 0.015 deg)
                    self.assertLessEqual(
                        el_err,
                        0.05,
                        msg=f"{site.site_id} {body_name} {ref_row['time_utc']}: el_err={el_err:.5f} deg",
                    )
                    self.assertLessEqual(
                        az_err,
                        0.05,
                        msg=f"{site.site_id} {body_name} {ref_row['time_utc']}: az_err={az_err:.5f} deg",
                    )

        self.assertLessEqual(max_el_err, 0.02)
        self.assertLessEqual(max_az_err, 0.03)

    def test_farside_change4_earth_always_below_horizon(self) -> None:
        """Caso de control negativo: en Chang'e 4 (cara oculta) e_Tierra < -30 deg en todo instante."""
        site = LunarCoordinate(lat_deg=-45.4446, lon_deg=177.5991, observer_height_m=2.0, site_id="change-4")
        times_utc = [datetime(2027, 1, day, 0, 0, tzinfo=UTC) for day in range(1, 29)]
        earth_series = compute_body_ephemeris("earth", site, times_utc, site_elevation_m=-5925.0)
        for sample in earth_series:
            self.assertLess(sample["elevation_deg"], -30.0)

    def test_south_pole_earth_latitude_libration_band(self) -> None:
        """En el polo sur, la elevacion de la Tierra oscila dentro de [-7.5 deg, +7.5 deg] durante un mes draconico."""
        site = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=2.0, site_id="shackleton-rim")
        times_utc = [datetime(2027, 1, day, 0, 0, tzinfo=UTC) for day in range(1, 29)]
        earth_series = compute_body_ephemeris("earth", site, times_utc, site_elevation_m=2120.0)
        elevs = [s["elevation_deg"] for s in earth_series]
        self.assertGreater(max(elevs), 1.0)
        self.assertLess(min(elevs), -1.0)
        self.assertLessEqual(max(abs(e) for e in elevs), 8.0)

    def test_scientific_verification_seal_metrics(self) -> None:
        seal = compute_scientific_verification_seal()
        self.assertEqual(seal.refraction, "AIRLESS")
        self.assertEqual(seal.ephemeris_kernel, "de421.bsp")
        self.assertLessEqual(seal.max_el_error_deg, 0.05)
        self.assertLessEqual(seal.max_az_error_deg, 0.05)
        self.assertGreaterEqual(seal.verified_sites_count, 5)


if __name__ == "__main__":
    unittest.main()
