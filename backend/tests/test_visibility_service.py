"""Oracles for the visibility engine, Sunset/Earthset events, multi-site comparison, and performance (RF-02, RF-04, RF-05, RT-04).

Owner: qa-verification-agent.
"""

from __future__ import annotations

import time
import unittest
from datetime import UTC, datetime

from app.models.schemas import (
    ComparisonRequest,
    EphemerisKernel,
    EventType,
    LunarCoordinate,
    TimeWindow,
    VisibilityRequest,
)
from app.services.horizon import ensure_curated_Master_cache
from app.services.visibility import compare_sites, compute_visibility_timeseries


class TestVisibilityAndComparisonService(unittest.TestCase):
    """Verifies visibility time series, events, aggregate metrics, and < 2 s runtime budget."""

    @classmethod
    def setUpClass(cls) -> None:
        ensure_curated_Master_cache()

    def test_thirty_day_visibility_performance_under_two_seconds(self) -> None:
        """RT-04: 30-day time series at 1-hour step (721 samples) with cached horizon in < 2.0 s."""
        site = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=2.0, site_id="shackleton-rim")
        window = TimeWindow(
            start_utc=datetime(2027, 1, 1, 0, 0, tzinfo=UTC),
            end_utc=datetime(2027, 1, 31, 0, 0, tzinfo=UTC),
            step_minutes=60.0,
        )
        req = VisibilityRequest(site=site, window=window, dte_elevation_mask_deg=0.0, ephemeris=EphemerisKernel.DE421)

        t0 = time.perf_counter()
        series = compute_visibility_timeseries(req)
        elapsed_s = time.perf_counter() - t0

        self.assertEqual(len(series.samples), 721)
        self.assertFalse(series.computation.refraction)
        self.assertLess(elapsed_s, 2.0, msg=f"Too slow: {elapsed_s:.3f} s > 2.0 s")

        event_types = {ev.event for ev in series.events}
        self.assertIn(EventType.SUNSET, event_types)
        self.assertIn(EventType.EARTHSET, event_types)

    def test_side_by_side_comparison_contrasts_polar_peaks_craters_and_farside(self) -> None:
        """RF-02, RF-05: compares Shackleton, Malapert, Cabeus (PSR), and Chang'e 4 (far side)."""
        sites = [
            LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=1.5, site_id="shackleton-rim"),
            LunarCoordinate(lat_deg=-86.0, lon_deg=2.7, observer_height_m=3.5, site_id="malapert-massif"),
            LunarCoordinate(lat_deg=-84.675, lon_deg=-48.725, observer_height_m=0.5, site_id="cabeus-crater"),
            LunarCoordinate(lat_deg=-45.4446, lon_deg=177.5991, observer_height_m=1.5, site_id="change-4"),
        ]
        window = TimeWindow(
            start_utc=datetime(2027, 1, 1, 0, 0, tzinfo=UTC),
            end_utc=datetime(2027, 1, 29, 0, 0, tzinfo=UTC),
            step_minutes=60.0,
        )
        res = compare_sites(ComparisonRequest(sites=sites, window=window))
        self.assertEqual(len(res.metrics), 4)
        by_id = {m.site.site_id: m for m in res.metrics}

        # Chang'e 4 on the far side never sees Earth -> DTE = 0.0 and Sun+DTE = 0.0
        self.assertEqual(by_id["change-4"].dte_fraction, 0.0)
        self.assertEqual(by_id["change-4"].sun_and_dte_fraction, 0.0)
        self.assertTrue(by_id["change-4"].next_earthset.beyond_window)

        # Malapert Massif faces Earth -> highest south pole DTE visibility (> 70 % over the draconic cycle)
        self.assertGreater(by_id["malapert-massif"].dte_fraction, 0.70)
        self.assertGreater(by_id["malapert-massif"].dte_fraction, by_id["shackleton-rim"].dte_fraction)
        self.assertGreater(by_id["shackleton-rim"].dte_fraction, by_id["cabeus-crater"].dte_fraction)

        # Cabeus Crater (PSR floor surrounded by high walls) receives far less sunlight than Shackleton Rim
        self.assertLess(by_id["cabeus-crater"].sunlit_fraction, by_id["shackleton-rim"].sunlit_fraction)

        # Advanced DTE Telecommunications verification (MATH_MODELS §6)
        malapert_dte = by_id["malapert-massif"].advanced_dte
        self.assertGreater(malapert_dte.earth_distance_km, 360000.0)
        self.assertLess(malapert_dte.earth_distance_km, 410000.0)
        self.assertAlmostEqual(malapert_dte.round_trip_time_s, 2.0 * malapert_dte.one_way_light_time_s, places=3)
        self.assertGreaterEqual(malapert_dte.one_way_light_time_s, 1.20)
        self.assertLessEqual(malapert_dte.one_way_light_time_s, 1.40)

        # FSPL propagation losses ITU-R P.525-4
        self.assertGreater(malapert_dte.fspl_s_band_db, 209.0)
        self.assertLess(malapert_dte.fspl_s_band_db, 213.0)
        self.assertGreater(malapert_dte.fspl_x_band_db, 221.0)
        self.assertLess(malapert_dte.fspl_x_band_db, 225.0)
        self.assertGreater(malapert_dte.fspl_ka_band_db, 232.0)
        self.assertLess(malapert_dte.fspl_ka_band_db, 236.0)
        self.assertLess(malapert_dte.fspl_s_band_db, malapert_dte.fspl_x_band_db)
        self.assertLess(malapert_dte.fspl_x_band_db, malapert_dte.fspl_ka_band_db)

        # Chang'e 4 (far side): negative terrain clearance and total blackout
        change4_dte = by_id["change-4"].advanced_dte
        self.assertLess(change4_dte.terrain_clearance_deg, 0.0)
        self.assertLess(change4_dte.max_clearance_deg, 0.0)
        self.assertEqual(change4_dte.simultaneous_sun_earth_hours, 0.0)
        self.assertGreater(change4_dte.longest_comms_blackout_hours, 600.0)

    def test_mast_height_improves_dte_terrain_clearance(self) -> None:
        """Verifies that raising the mast from 0.5 m to 10.0 m increases angular clearance above terrain."""
        window = TimeWindow(
            start_utc=datetime(2027, 1, 1, 0, 0, tzinfo=UTC),
            end_utc=datetime(2027, 1, 3, 0, 0, tzinfo=UTC),
            step_minutes=60.0,
        )
        site_low = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=0.5, site_id="shackleton-rim")
        site_high = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, observer_height_m=10.0, site_id="shackleton-rim")

        res = compare_sites(ComparisonRequest(sites=[site_low, site_high], window=window))
        clearance_low = res.metrics[0].advanced_dte.terrain_clearance_deg
        clearance_high = res.metrics[1].advanced_dte.terrain_clearance_deg
        self.assertGreater(clearance_high, clearance_low, msg="Raising the mast must increase DTE clearance")


if __name__ == "__main__":
    unittest.main()
