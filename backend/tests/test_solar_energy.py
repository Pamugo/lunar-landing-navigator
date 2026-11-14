"""Tests unitarios y de validacion fisica del modelo de energia solar y acimut optimo (RF-05, MATH_MODELS §5).

Propietario: qa-verification-agent.
Verifica:
  1. Irradiancia AM0 con ley del inverso del cuadrado y fraccion de disco visible (§5.1).
  2. Paridad fisica de las tres arquitecturas de paneles: horizontal, tracking vertical y vertical fijo (§5.2).
  3. Comprobacion de que un panel vertical polar capta decenas de veces mas energia que uno horizontal (§5.2).
  4. Buscador del acimut optimo (0° a 359°) con oraculo analitico y en sitios polares reales (§5.4).
  5. Endpoint FastAPI /api/v1/solar-energy.
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
    HorizonProfile,
    HorizonSource,
    LunarCoordinate,
    SolarArchitectureEnergy,
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
    compute_visibility_timeseries,
    find_optimal_panel_azimuth,
)


def _make_synthetic_sample(
    t_utc: datetime,
    az_deg: float,
    el_deg: float,
    visible_frac: float = 1.0,
    distance_km: float = AU_KM,
) -> VisibilitySample:
    """Construye una muestra sintetica controlada para pruebas analiticas de potencia solar."""
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
    """Pruebas de fisica de irradiancia y arquitecturas de paneles."""

    def test_solar_irradiance_am0_at_one_au(self) -> None:
        """A 1 UA exacta y con disco 100% visible, S = 1368.0 W/m² exactos."""
        s = compute_solar_irradiance_am0(AU_KM, visible_fraction=1.0)
        self.assertAlmostEqual(s, SOLAR_CONSTANT_AM0_W_M2, places=4)

    def test_solar_irradiance_inverse_square_law(self) -> None:
        """A 0.98 UA (perihelio) la irradiancia es superior a 1368 W/m²; a 1.02 UA (afelio) es inferior."""
        s_peri = compute_solar_irradiance_am0(0.98 * AU_KM, visible_fraction=1.0)
        s_aph = compute_solar_irradiance_am0(1.02 * AU_KM, visible_fraction=1.0)

        expected_peri = SOLAR_CONSTANT_AM0_W_M2 / (0.98**2)
        expected_aph = SOLAR_CONSTANT_AM0_W_M2 / (1.02**2)
        self.assertAlmostEqual(s_peri, expected_peri, places=3)
        self.assertAlmostEqual(s_aph, expected_aph, places=3)
        self.assertGreater(s_peri, SOLAR_CONSTANT_AM0_W_M2)
        self.assertLess(s_aph, SOLAR_CONSTANT_AM0_W_M2)

    def test_solar_irradiance_occlusion_and_zero_conditions(self) -> None:
        """Disco parcialmente ocultado escala linealmente; ocultacion total da 0 W/m²."""
        s_half = compute_solar_irradiance_am0(AU_KM, visible_fraction=0.5)
        self.assertAlmostEqual(s_half, SOLAR_CONSTANT_AM0_W_M2 * 0.5, places=4)

        s_zero = compute_solar_irradiance_am0(AU_KM, visible_fraction=0.0)
        self.assertEqual(s_zero, 0.0)

        s_neg = compute_solar_irradiance_am0(AU_KM, visible_fraction=-0.1)
        self.assertEqual(s_neg, 0.0)

    def test_polar_vertical_panel_advantage_over_horizontal(self) -> None:
        """En el polo lunar (e ≈ 1.5°), un panel vertical produce ~38 veces mas que uno horizontal plano."""
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

        # Analitico: p_horiz = 1368 * sin(1.5°) ≈ 35.81 W/m²; p_vert = 1368 * cos(1.5°) ≈ 1367.53 W/m²
        self.assertAlmostEqual(p_horiz, 1368.0 * math.sin(math.radians(1.5)), delta=0.5)
        self.assertAlmostEqual(p_vert, 1368.0 * math.cos(math.radians(1.5)), delta=0.5)
        # Como el panel fijo apunta exactamente a 90° (donde esta el Sol), coincide con el tracking
        self.assertAlmostEqual(p_fixed, p_vert, delta=0.1)

        ratio = p_vert / p_horiz
        self.assertGreater(ratio, 35.0)
        self.assertLess(ratio, 40.0)

    def test_fixed_panel_cosine_azimuth_falloff(self) -> None:
        """Un panel fijo orientado a 90° recibe 0 W cuando el Sol esta a 180° (ortogonal) o 270° (espalda)."""
        t0 = datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
        # Muestra 1: Sol a 90° (pleno frente); Muestra 2: Sol a 180° (lateral); Muestra 3: Sol a 270° (espalda)
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
        # En la muestra de 90° genera potencia completa; en 180° y 270° genera 0
        p_track_peak = res.tracking_vertical_panel.peak_flux_w_m2
        p_fixed_peak = res.fixed_vertical_panel.peak_flux_w_m2
        self.assertAlmostEqual(p_track_peak, p_fixed_peak, delta=0.5)

        # La energia total del fijo debe ser inferior a la del tracking (porque solo capta una de las 3 muestras)
        self.assertLess(res.fixed_vertical_panel.total_energy_kwh_m2, res.tracking_vertical_panel.total_energy_kwh_m2)


class TestOptimalAzimuthSearch(unittest.TestCase):
    """Pruebas del algoritmo de busqueda de acimut optimo (0° a 359°)."""

    def test_optimal_azimuth_oracle_east_illumination(self) -> None:
        """Si la iluminacion ocurre predominantemente hacia el Este (~90°), el acimut optimo debe ser 90°."""
        t0 = datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
        # Sol estacionario o barriendo en torno a 90° (85°, 90°, 95°)
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

        # A 270° (opuesto) la energia acumulada debe ser 0.0
        self.assertEqual(opt.azimuth_energy_curve_kwh_m2[270], 0.0)

    def test_optimal_azimuth_on_real_shackleton_rim_series(self) -> None:
        """Evalua el buscador en una serie real generada en Shackleton Rim (7 dias de exploracion)."""
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

        # En Shackleton el panel vertical con tracking siempre genera mas que el horizontal
        self.assertGreater(summary.tracking_vertical_panel.total_energy_kwh_m2, summary.horizontal_panel.total_energy_kwh_m2)

        # El acimut optimo debe ser un grado discreto [0, 359]
        opt = summary.optimal_azimuth
        self.assertGreaterEqual(opt.optimal_panel_azimuth_deg, 0.0)
        self.assertLess(opt.optimal_panel_azimuth_deg, 360.0)
        self.assertEqual(len(opt.azimuth_energy_curve_kwh_m2), 360)

        # La energia del optimo debe ser mayor o igual que la energia del panel fijo a 45°
        self.assertGreaterEqual(opt.optimal_fixed_energy_kwh_m2, summary.fixed_vertical_panel.total_energy_kwh_m2)


if __name__ == "__main__":
    unittest.main()
