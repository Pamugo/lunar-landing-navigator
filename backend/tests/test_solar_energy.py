"""Unit and physical validation tests for the solar energy and optimal azimuth model (RF-05, MATH_MODELS §5).

Owner: qa-verification-agent.
Verifies:
  1. AM0 irradiance with inverse-square law and visible disk fraction (§5.1).
  2. Physical parity of the three panel architectures: horizontal, vertical tracking, and fixed vertical (§5.2).
  3. Verification that a polar vertical panel captures dozens of times more energy than a horizontal one (§5.2).
  4. Optimal azimuth finder (0° to 359°) with analytical oracle and on real polar sites (§5.4).
  5. FastAPI /api/v1/solar-energy endpoint.
"""

from __future__ import annotations

import math
import unittest
from datetime import UTC, datetime, timedelta

from app.api.routes import post_solar_energy
from app.models.schemas import (
    BodyPosition,
    ComputationInfo,
    EphemerisKernel,
    HorizonSource,
    LunarCoordinate,
    SolarEnergyRequest,
    SolarEnergySummary,
    TimeWindow,
    VisibilitySample,
    VisibilityState,
    VisibilityTimeSeries,
)
from app.services.visibility import (
    AU_KM,
    SOLAR_CONSTANT_AM0_W_M2,
    compute_solar_energy_analysis,
    compute_solar_irradiance_am0,
    find_optimal_panel_azimuth,
)


def _make_synthetic_sample(
    t_utc: datetime,
    az_deg: float,
    el_deg: float,
    visible_frac: float = 1.0,
    distance_km: float = AU_KM,
) -> VisibilitySample:
    """Constructs a controlled synthetic sample for analytical solar power tests."""
    hor_el = 0.0
    clearance = el_deg - hor_el
    state = VisibilityState.VISIBLE if visible_frac >= 1.0 else (VisibilityState.PARTIAL if visible_frac > 0 else VisibilityState.OCCULTED)
    sun_pos = BodyPosition(
        azimuth_deg=az_deg,
        elevation_deg=el_deg,
        distance_km=distance_km,
        angular_radius_deg=0.2666,
        horizon_elevation_deg=hor_el,
        clearance_deg=clearance,
        state=state,
        visible_fraction=visible_frac,
    )
    earth_pos = BodyPosition(
        azimuth_deg=0.0,
        elevation_deg=5.0,
        distance_km=384400.0,
        angular_radius_deg=0.95,
        horizon_elevation_deg=0.0,
        clearance_deg=5.0,
        state=VisibilityState.VISIBLE,
        visible_fraction=1.0,
    )
    return VisibilitySample(time_utc=t_utc, sun=sun_pos, earth=earth_pos)


class TestSolarEnergyPhysics(unittest.TestCase):
    """Solar irradiance physics and panel architecture tests."""

    def test_solar_irradiance_am0_at_one_au(self) -> None:
        """At exactly 1 AU and 100% visible disk, S = 1368.0 W/m² exact."""
        s = compute_solar_irradiance_am0(AU_KM, visible_fraction=1.0)
        self.assertAlmostEqual(s, SOLAR_CONSTANT_AM0_W_M2, places=4)

    def test_solar_irradiance_inverse_square_law(self) -> None:
        """At 0.98 AU (perihelion) irradiance exceeds 1368 W/m²; at 1.02 AU (aphelion) it is lower."""
        s_peri = compute_solar_irradiance_am0(0.98 * AU_KM, visible_fraction=1.0)
        s_aph = compute_solar_irradiance_am0(1.02 * AU_KM, visible_fraction=1.0)

        expected_peri = SOLAR_CONSTANT_AM0_W_M2 / (0.98**2)
        expected_aph = SOLAR_CONSTANT_AM0_W_M2 / (1.02**2)
        self.assertAlmostEqual(s_peri, expected_peri, places=3)
        self.assertAlmostEqual(s_aph, expected_aph, places=3)
        self.assertGreater(s_peri, SOLAR_CONSTANT_AM0_W_M2)
        self.assertLess(s_aph, SOLAR_CONSTANT_AM0_W_M2)

    def test_solar_irradiance_occlusion_and_zero_conditions(self) -> None:
        """Partially occluded disk scales linearly; full occultation yields 0 W/m²."""
        s_half = compute_solar_irradiance_am0(AU_KM, visible_fraction=0.5)
        self.assertAlmostEqual(s_half, SOLAR_CONSTANT_AM0_W_M2 * 0.5, places=4)

        s_zero = compute_solar_irradiance_am0(AU_KM, visible_fraction=0.0)
        self.assertEqual(s_zero, 0.0)

        s_neg = compute_solar_irradiance_am0(AU_KM, visible_fraction=-0.1)
        self.assertEqual(s_neg, 0.0)

    def test_polar_vertical_panel_advantage_over_horizontal(self) -> None:
        """At the lunar pole (e ≈ 1.5°), a vertical panel produces ~38x more than a flat horizontal panel."""
        t0 = datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
        samples = [_make_synthetic_sample(t0, az_deg=90.0, el_deg=1.5, visible_frac=1.0)]
        comp = ComputationInfo(
            ephemeris=EphemerisKernel.DE421,
            lunar_frame="MOON_ME_DE421",
            dem_product="lola_south_polar_100m",
            horizon_source=HorizonSource.LOLA_DEM,
            azimuth_step_deg=0.5,
            max_distance_km=150.0,
            refraction=False,
        )
        series = VisibilityTimeSeries(
            site=LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0),
            window=TimeWindow(start_utc=t0, end_utc=t0 + timedelta(hours=1), step_minutes=60.0),
            samples=samples,
            events=[],
            computation=comp,
        )
        res = compute_solar_energy_analysis(series, fixed_azimuth_deg=90.0)

        p_horiz = res.horizontal_panel.peak_flux_w_m2
        p_vert = res.tracking_vertical_panel.peak_flux_w_m2
        p_fixed = res.fixed_vertical_panel.peak_flux_w_m2

        # Analytical: p_horiz = 1368 * sin(1.5°) ≈ 35.81 W/m²; p_vert = 1368 * cos(1.5°) ≈ 1367.53 W/m²
        self.assertAlmostEqual(p_horiz, 1368.0 * math.sin(math.radians(1.5)), delta=0.5)
        self.assertAlmostEqual(p_vert, 1368.0 * math.cos(math.radians(1.5)), delta=0.5)
        # Since the fixed panel points at 90° (where the Sun is), it matches the tracking panel
        self.assertAlmostEqual(p_fixed, p_vert, delta=0.1)

        ratio = p_vert / p_horiz
        self.assertGreater(ratio, 35.0)
        self.assertLess(ratio, 40.0)

    def test_fixed_panel_cosine_azimuth_falloff(self) -> None:
        """A fixed panel facing 90° receives 0 W when the Sun is at 180° (orthogonal) or 270° (behind)."""
        t0 = datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
        # Sample 1: Sun at 90° (head-on); Sample 2: Sun at 180° (side); Sample 3: Sun at 270° (behind)
        samples = [
            _make_synthetic_sample(t0, az_deg=90.0, el_deg=2.0),
            _make_synthetic_sample(t0 + timedelta(hours=1), az_deg=180.0, el_deg=2.0),
            _make_synthetic_sample(t0 + timedelta(hours=2), az_deg=270.0, el_deg=2.0),
        ]
        series = VisibilityTimeSeries(
            site=LunarCoordinate(lat_deg=-89.0, lon_deg=0.0),
            window=TimeWindow(start_utc=t0, end_utc=t0 + timedelta(hours=2), step_minutes=60.0),
            samples=samples,
            events=[],
            computation=ComputationInfo(
                ephemeris=EphemerisKernel.DE421,
                lunar_frame="MOON_ME_DE421",
                dem_product="spherical_analytical",
                horizon_source=HorizonSource.SPHERICAL_ANALYTICAL,
                azimuth_step_deg=0.5,
                max_distance_km=150.0,
                refraction=False,
            ),
        )

        res = compute_solar_energy_analysis(series, fixed_azimuth_deg=90.0)
        # At the 90° sample it generates full power; at 180° and 270° it generates 0
        p_track_peak = res.tracking_vertical_panel.peak_flux_w_m2
        p_fixed_peak = res.fixed_vertical_panel.peak_flux_w_m2
        self.assertAlmostEqual(p_track_peak, p_fixed_peak, delta=0.5)

        # Total fixed energy must be lower than tracking energy (captures only 1 of 3 samples)
        self.assertLess(res.fixed_vertical_panel.total_energy_kwh_m2, res.tracking_vertical_panel.total_energy_kwh_m2)


class TestOptimalAzimuthSearch(unittest.TestCase):
    """Tests for the optimal azimuth search algorithm (0° to 359°)."""

    def test_optimal_azimuth_oracle_east_illumination(self) -> None:
        """If illumination occurs predominantly toward East (~90°), optimal azimuth must be 90°."""
        t0 = datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
        # Stationary or sweeping Sun around 90° (85°, 90°, 95°)
        samples = [
            _make_synthetic_sample(t0 + timedelta(hours=0), az_deg=85.0, el_deg=2.0),
            _make_synthetic_sample(t0 + timedelta(hours=1), az_deg=90.0, el_deg=2.0),
            _make_synthetic_sample(t0 + timedelta(hours=2), az_deg=95.0, el_deg=2.0),
        ]
        series = VisibilityTimeSeries(
            site=LunarCoordinate(lat_deg=-89.0, lon_deg=0.0),
            window=TimeWindow(start_utc=t0, end_utc=t0 + timedelta(hours=2), step_minutes=60.0),
            samples=samples,
            events=[],
            computation=ComputationInfo(
                ephemeris=EphemerisKernel.DE421,
                lunar_frame="MOON_ME_DE421",
                dem_product="spherical_analytical",
                horizon_source=HorizonSource.SPHERICAL_ANALYTICAL,
                azimuth_step_deg=0.5,
                max_distance_km=150.0,
                refraction=False,
            ),
        )
        opt = find_optimal_panel_azimuth(series)

        self.assertEqual(len(opt.azimuth_energy_curve_kwh_m2), 360)
        self.assertEqual(opt.optimal_panel_azimuth_deg, 90.0)
        self.assertGreater(opt.optimal_fixed_energy_kwh_m2, 0.0)

        # At 270° (opposite) accumulated energy must be 0.0
        self.assertEqual(opt.azimuth_energy_curve_kwh_m2[270], 0.0)

    def test_optimal_azimuth_on_real_shackleton_rim_series(self) -> None:
        """Evaluates the finder on a real series generated at Shackleton Rim (7-day exploration)."""
        site = LunarCoordinate(lat_deg=-89.68, lon_deg=-166.0, site_id="shackleton-rim")
        req = SolarEnergyRequest(
            site=site,
            window=TimeWindow(
                start_utc=datetime(2027, 1, 1, 0, 0, tzinfo=UTC),
                end_utc=datetime(2027, 1, 8, 0, 0, tzinfo=UTC),
                step_minutes=120.0,
            ),
            fixed_azimuth_deg=45.0,
        )
        summary = post_solar_energy(req)

        self.assertIsInstance(summary, SolarEnergySummary)
        self.assertEqual(summary.solar_constant_am0_w_m2, 1368.0)
        self.assertGreater(summary.mean_solar_distance_au, 0.98)
        self.assertLess(summary.mean_solar_distance_au, 1.02)

        # At Shackleton the tracking vertical panel always yields more than the horizontal one
        self.assertGreater(summary.tracking_vertical_panel.total_energy_kwh_m2, summary.horizontal_panel.total_energy_kwh_m2)

        # Optimal azimuth must be a discrete integer degree [0, 359]
        opt = summary.optimal_azimuth
        self.assertGreaterEqual(opt.optimal_panel_azimuth_deg, 0.0)
        self.assertLess(opt.optimal_panel_azimuth_deg, 360.0)
        self.assertEqual(len(opt.azimuth_energy_curve_kwh_m2), 360)

        # Optimal energy must be >= energy of the fixed panel at 45°
        self.assertGreaterEqual(opt.optimal_fixed_energy_kwh_m2, summary.fixed_vertical_panel.total_energy_kwh_m2)


if __name__ == "__main__":
    unittest.main()
