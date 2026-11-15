"""Lunar ephemeris oracles against NASA JPL Horizons (RT-01) and scientific verification seal.

Owner: qa-verification-agent.
Validates backend/app/services/ephemeris.py against backend/tests/fixtures/horizons/horizons_reference.json
generated from https://ssd.jpl.nasa.gov/api/horizons.api (CENTER='coord@301', APPARENT='AIRLESS').
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
    """RT-01: validation of apparent Az/El (AIRLESS) in MOON_ME against JPL Horizons."""

    def test_sun_and_earth_az_el_match_jpl_horizons_fixtures(self) -> None:
        """Elevation error <= 0.01 deg (target) / <= 0.05 deg (acceptance) across all control sites."""
        self.assertTrue(FIXTURE_PATH.is_file(), "Missing JPL Horizons fixture")
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
                    # Near the zenith or pole, azimuth is weighted by cos(el) to measure true angular error
                    cos_el = max(0.1, abs(math.cos(math.radians(float(ref_row["elevation_deg"])))))
                    az_err = _angular_diff_deg(calc_row["azimuth_deg"], float(ref_row["azimuth_deg"])) * cos_el
                    max_el_err = max(max_el_err, el_err)
                    max_az_err = max(max_az_err, az_err)

                    # RT-01 acceptance criterion: <= 0.05 deg (target <= 0.015 deg)
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
        """Negative control case: at Chang'e 4 (far side), Earth elevation < -30 deg at all times."""
        site = LunarCoordinate(lat_deg=-45.4446, lon_deg=177.5991, observer_height_m=2.0, site_id="change-4")
        times_utc = [datetime(2027, 1, day, 0, 0, tzinfo=UTC) for day in range(1, 29)]
        earth_series = compute_body_ephemeris("earth", site, times_utc, site_elevation_m=-5925.0)
        for sample in earth_series:
            self.assertLess(sample["elevation_deg"], -30.0)

    def test_south_pole_earth_latitude_libration_band(self) -> None:
        """At the south pole, Earth elevation oscillates within [-7.5 deg, +7.5 deg] over one draconic month."""
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
