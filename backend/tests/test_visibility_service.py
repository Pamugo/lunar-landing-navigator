"""Oraculos del motor de visibilidad, eventos Sunset/Earthset, comparacion multi-sitio y rendimiento (RF-02, RF-04, RF-05, RT-04).

Propietario: qa-verification-agent.
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
    """Verifica series temporales de visibilidad, eventos, metricas agregadas y presupuesto < 2 s."""

    @classmethod
    def setUpClass(cls) -> None:
        ensure_curated_Master_cache()

    def test_thirty_day_visibility_performance_under_two_seconds(self) -> None:
        """RT-04: serie de 30 dias a paso de 1 hora (721 muestras) con horizonte cacheado en < 2.0 s."""
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
        self.assertLess(elapsed_s, 2.0, msg=f"Demasiado lento: {elapsed_s:.3f} s > 2.0 s")

        event_types = {ev.event for ev in series.events}
        self.assertIn(EventType.SUNSET, event_types)
        self.assertIn(EventType.EARTHSET, event_types)

    def test_side_by_side_comparison_contrasts_polar_peaks_craters_and_farside(self) -> None:
        """RF-02, RF-05: compara Shackleton, Malapert, Cabeus (PSR) y Chang'e 4 (cara oculta)."""
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

        # Chang'e 4 en la cara oculta nunca ve la Tierra -> DTE = 0.0 y Sun+DTE = 0.0
        self.assertEqual(by_id["change-4"].dte_fraction, 0.0)
        self.assertEqual(by_id["change-4"].sun_and_dte_fraction, 0.0)
        self.assertTrue(by_id["change-4"].next_earthset.beyond_window)

        # Malapert Massif mira hacia la Tierra -> mayor visibilidad DTE del polo sur (> 70 % en el ciclo draconico)
        self.assertGreater(by_id["malapert-massif"].dte_fraction, 0.70)
        self.assertGreater(by_id["malapert-massif"].dte_fraction, by_id["shackleton-rim"].dte_fraction)
        self.assertGreater(by_id["shackleton-rim"].dte_fraction, by_id["cabeus-crater"].dte_fraction)

        # Cabeus Crater (fondo PSR rodeado de paredes altas) tiene mucha menos luz solar que Shackleton Rim
        self.assertLess(by_id["cabeus-crater"].sunlit_fraction, by_id["shackleton-rim"].sunlit_fraction)


if __name__ == "__main__":
    unittest.main()
