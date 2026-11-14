"""Visibilidad solar/terrestre, fraccion de disco, eventos Sunset/Earthset y metricas comparativas (RF-02, RF-04, RF-05, RT-04).

Propietario: astro-terrain-specialist.
Referencia matematica: docs/MATH_MODELS.md §3 (visibilidad), §4 (eventos) y §5 (energia).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta

import numpy as np
from scipy.optimize import brentq

from app.models.schemas import (
    AdvancedDteMetrics,
    BodyPosition,
    ComparisonRequest,
    ComparisonResult,
    ComputationInfo,
    EventPrediction,
    EventType,
    HorizonProfile,
    HorizonRequest,
    OptimalAzimuthResult,
    SiteSummaryMetrics,
    SolarArchitectureEnergy,
    SolarEnergySummary,
    TimeWindow,
    VisibilityRequest,
    VisibilitySample,
    VisibilityState,
    VisibilityTimeSeries,
)
from app.services.ephemeris import EphemerisSampleDict, compute_body_ephemeris
from app.services.horizon import compute_horizon_profile, interpolate_horizon_deg

SOLAR_CONSTANT_AM0_W_M2: float = 1368.0
AU_KM: float = 149_597_870.7
SPEED_OF_LIGHT_KM_S: float = 299_792.458
FREQ_S_BAND_GHZ: float = 2.2
FREQ_X_BAND_GHZ: float = 8.4
FREQ_KA_BAND_GHZ: float = 32.0


def _disk_visible_fraction_rad(elevation_rad: float, alpha_rad: float, horizon_rad: float) -> float:
    """Fraccion visible de un disco uniforme sobre horizonte localmente recto (MATH_MODELS §3.3)."""
    if alpha_rad <= 0.0:
        return 1.0 if elevation_rad >= horizon_rad else 0.0
    x = (horizon_rad - elevation_rad) / alpha_rad
    if x <= -1.0:
        return 1.0
    if x >= 1.0:
        return 0.0
    val = (math.acos(x) - x * math.sqrt(max(0.0, 1.0 - x * x))) / math.pi
    return max(0.0, min(1.0, val))


def _visibility_state_rad(elevation_rad: float, alpha_rad: float, horizon_rad: float) -> VisibilityState:
    """Estado de visibilidad: VISIBLE | PARTIAL | OCCULTED (MATH_MODELS §3.2)."""
    if elevation_rad - alpha_rad > horizon_rad:
        return VisibilityState.VISIBLE
    if elevation_rad + alpha_rad < horizon_rad:
        return VisibilityState.OCCULTED
    return VisibilityState.PARTIAL


def _build_time_grid(window: TimeWindow) -> list[datetime]:
    start = window.start_utc.astimezone(UTC) if window.start_utc.tzinfo else window.start_utc.replace(tzinfo=UTC)
    end = window.end_utc.astimezone(UTC) if window.end_utc.tzinfo else window.end_utc.replace(tzinfo=UTC)
    if end <= start:
        return [start]
    step_s = max(60.0, float(window.step_minutes) * 60.0)
    total_s = (end - start).total_seconds()
    n_steps = math.floor(total_s / step_s)
    return [start + timedelta(seconds=k * step_s) for k in range(n_steps + 1)]


def _find_first_event(
    event_type: EventType,
    times_utc: Sequence[datetime],
    g_values_deg: Sequence[float],
    falling: bool,
) -> EventPrediction:
    """Localiza el primer cruce de cero de g(t) y lo refina con Brent a precision de 1 s (MATH_MODELS §4)."""
    if len(times_utc) < 2:
        return EventPrediction(event=event_type, time_utc=None, seconds_from_reference=None, beyond_window=True)

    t0_ref = times_utc[0]
    times_s = [(t - t0_ref).total_seconds() for t in times_utc]

    for k in range(len(g_values_deg) - 1):
        g0 = float(g_values_deg[k])
        g1 = float(g_values_deg[k + 1])
        is_cross = (g0 > 0.0 >= g1) if falling else (g0 < 0.0 <= g1)
        if is_cross:
            ta, tb = times_s[k], times_s[k + 1]
            if g0 == g1:
                t_root = ta
            else:
                def _interp_g(
                    tau: float,
                    _ta: float = ta,
                    _tb: float = tb,
                    _g0: float = g0,
                    _g1: float = g1,
                ) -> float:
                    return _g0 + (_g1 - _g0) * ((tau - _ta) / (_tb - _ta))

                t_root = float(brentq(_interp_g, ta, tb, xtol=0.1))
            dt_event = t0_ref + timedelta(seconds=round(t_root))
            return EventPrediction(
                event=event_type,
                time_utc=dt_event,
                seconds_from_reference=round(t_root, 1),
                beyond_window=False,
            )

    return EventPrediction(event=event_type, time_utc=None, seconds_from_reference=None, beyond_window=True)


def _build_body_positions(
    eph_samples: list[EphemerisSampleDict],
    profile: HorizonProfile,
) -> tuple[list[BodyPosition], list[float]]:
    az_deg_arr = np.asarray([s["azimuth_deg"] for s in eph_samples], dtype=np.float64)
    hor_deg_arr = interpolate_horizon_deg(profile, az_deg_arr)

    positions: list[BodyPosition] = []
    upper_limb_clearance_deg: list[float] = []

    for idx, s in enumerate(eph_samples):
        hor_deg = float(hor_deg_arr[idx])
        hor_rad = math.radians(hor_deg)
        el_rad = s["elevation_rad"]
        alpha_rad = s["angular_radius_rad"]

        state = _visibility_state_rad(el_rad, alpha_rad, hor_rad)
        frac = _disk_visible_fraction_rad(el_rad, alpha_rad, hor_rad)
        clearance_deg = s["elevation_deg"] - hor_deg
        upper_limb_clearance_deg.append(clearance_deg + s["angular_radius_deg"])

        positions.append(
            BodyPosition(
                azimuth_deg=round(s["azimuth_deg"], 4),
                elevation_deg=round(s["elevation_deg"], 4),
                distance_km=round(s["distance_km"], 1),
                angular_radius_deg=round(s["angular_radius_deg"], 5),
                horizon_elevation_deg=round(hor_deg, 4),
                clearance_deg=round(clearance_deg, 4),
                state=state,
                visible_fraction=round(frac, 4),
            )
        )

    return positions, upper_limb_clearance_deg


def compute_visibility_timeseries(
    req: VisibilityRequest,
    horizon_profile: HorizonProfile | None = None,
) -> VisibilityTimeSeries:
    """Calcula la serie temporal completa de visibilidad de Sol y Tierra y los eventos de horizonte."""
    profile = horizon_profile or compute_horizon_profile(
        HorizonRequest(site=req.site, azimuth_step_deg=0.5, max_distance_km=150.0)
    )
    times_utc = _build_time_grid(req.window)

    sun_eph = compute_body_ephemeris(
        body="sun",
        site=req.site,
        times_utc=times_utc,
        site_elevation_m=profile.site_elevation_m,
        kernel=req.ephemeris,
    )
    earth_eph = compute_body_ephemeris(
        body="earth",
        site=req.site,
        times_utc=times_utc,
        site_elevation_m=profile.site_elevation_m,
        kernel=req.ephemeris,
    )

    sun_positions, sun_g = _build_body_positions(sun_eph, profile)
    earth_positions, earth_g = _build_body_positions(earth_eph, profile)

    samples = [
        VisibilitySample(time_utc=t, sun=sun_positions[i], earth=earth_positions[i])
        for i, t in enumerate(times_utc)
    ]

    events = [
        _find_first_event(EventType.SUNSET, times_utc, sun_g, falling=True),
        _find_first_event(EventType.SUNRISE, times_utc, sun_g, falling=False),
        _find_first_event(EventType.EARTHSET, times_utc, earth_g, falling=True),
        _find_first_event(EventType.EARTHRISE, times_utc, earth_g, falling=False),
    ]

    comp = ComputationInfo(
        ephemeris=req.ephemeris,
        lunar_frame="MOON_ME_DE421",
        dem_product=profile.dem_product,
        horizon_source=profile.horizon_source,
        azimuth_step_deg=0.5,
        max_distance_km=profile.max_distance_km,
        refraction=False,
    )

    return VisibilityTimeSeries(
        site=req.site,
        window=req.window,
        samples=samples,
        events=events,
        computation=comp,
    )


def _longest_streak_hours(flags: Sequence[bool], step_hours: float) -> float:
    best = 0
    current = 0
    for f in flags:
        if f:
            current += 1
            best = max(best, current)
        else:
            current = 0
    return round(best * step_hours, 2)


def compute_advanced_dte_metrics(
    series: VisibilityTimeSeries,
    dte_elevation_mask_deg: float = 0.0,
) -> AdvancedDteMetrics:
    """Calcula metricas avanzadas de telecomunicaciones DTE (MATH_MODELS §6)."""
    if not series.samples:
        return AdvancedDteMetrics(
            terrain_clearance_deg=0.0,
            min_clearance_deg=0.0,
            max_clearance_deg=0.0,
            earth_azimuth_span_deg=0.0,
            earth_elevation_span_deg=0.0,
            libration_span_deg=0.0,
            earth_distance_km=384400.0,
            one_way_light_time_s=1.2822,
            round_trip_time_s=2.5644,
            fspl_s_band_db=210.99,
            fspl_x_band_db=222.62,
            fspl_ka_band_db=234.25,
            longest_comms_blackout_hours=0.0,
            simultaneous_sun_earth_hours=0.0,
        )

    # 1. Holgura topografica angular (instantanea al inicio, minima y maxima)
    clearances = [s.earth.clearance_deg for s in series.samples]
    terrain_clearance_deg = round(float(clearances[0]), 4)
    min_clearance_deg = round(float(min(clearances)), 4)
    max_clearance_deg = round(float(max(clearances)), 4)

    # 2. Caja de libracion terrestre (MATH_MODELS §6.2)
    azimuths = [s.earth.azimuth_deg for s in series.samples]
    elevations = [s.earth.elevation_deg for s in series.samples]

    az_rad = np.unwrap(np.radians(azimuths))
    az_span = float(math.degrees(np.max(az_rad) - np.min(az_rad)))
    el_span = float(max(elevations) - min(elevations))
    mean_el = float(sum(elevations) / len(elevations))
    libration_span = float(math.hypot(el_span, az_span * math.cos(math.radians(mean_el))))

    # 3. Distancia Tierra-Luna y retardos de propagacion de luz (MATH_MODELS §6.3)
    distances = [s.earth.distance_km for s in series.samples]
    mean_dist_km = float(sum(distances) / len(distances))
    one_way_s = mean_dist_km / SPEED_OF_LIGHT_KM_S
    rtt_s = 2.0 * one_way_s

    # 4. Perdida de propagacion en espacio libre FSPL ITU-R P.525-4 (MATH_MODELS §6.4)
    # Formula: 20*log10(d_km) + 20*log10(f_ghz) + 92.45
    log_d = math.log10(mean_dist_km)
    fspl_s = 20.0 * log_d + 20.0 * math.log10(FREQ_S_BAND_GHZ) + 92.45
    fspl_x = 20.0 * log_d + 20.0 * math.log10(FREQ_X_BAND_GHZ) + 92.45
    fspl_ka = 20.0 * log_d + 20.0 * math.log10(FREQ_KA_BAND_GHZ) + 92.45

    # 5. Blackout maximo y Horas netas simultaneas Sol+Tierra (MATH_MODELS §6.5)
    step_hours = float(series.window.step_minutes) / 60.0
    dte_flags = [s.earth.clearance_deg >= dte_elevation_mask_deg for s in series.samples]
    sunlit_flags = [s.sun.visible_fraction > 0.0 for s in series.samples]
    blackout_flags = [not f for f in dte_flags]
    both_flags = [s_flag and d_flag for s_flag, d_flag in zip(sunlit_flags, dte_flags, strict=True)]

    longest_blackout_hours = _longest_streak_hours(blackout_flags, step_hours)
    simultaneous_hours = round(sum(1 for f in both_flags if f) * step_hours, 2)

    return AdvancedDteMetrics(
        terrain_clearance_deg=terrain_clearance_deg,
        min_clearance_deg=min_clearance_deg,
        max_clearance_deg=max_clearance_deg,
        earth_azimuth_span_deg=round(az_span, 4),
        earth_elevation_span_deg=round(el_span, 4),
        libration_span_deg=round(libration_span, 4),
        earth_distance_km=round(mean_dist_km, 1),
        one_way_light_time_s=round(one_way_s, 4),
        round_trip_time_s=round(rtt_s, 4),
        fspl_s_band_db=round(fspl_s, 2),
        fspl_x_band_db=round(fspl_x, 2),
        fspl_ka_band_db=round(fspl_ka, 2),
        longest_comms_blackout_hours=longest_blackout_hours,
        simultaneous_sun_earth_hours=simultaneous_hours,
    )


def summarize_site_metrics(
    series: VisibilityTimeSeries,
    dte_elevation_mask_deg: float = 0.0,
) -> SiteSummaryMetrics:
    """Agrega las metricas de iluminacion solar, visibilidad DTE y telecomunicaciones avanzadas."""
    n = max(1, len(series.samples))
    step_hours = float(series.window.step_minutes) / 60.0

    sunlit_flags = [s.sun.visible_fraction > 0.0 for s in series.samples]
    dark_flags = [not flag for flag in sunlit_flags]
    dte_flags = [s.earth.clearance_deg >= dte_elevation_mask_deg for s in series.samples]
    both_flags = [s_flag and d_flag for s_flag, d_flag in zip(sunlit_flags, dte_flags, strict=True)]

    sunlit_frac = sum(1 for f in sunlit_flags if f) / n
    dte_frac = sum(1 for f in dte_flags if f) / n
    both_frac = sum(1 for f in both_flags if f) / n
    mean_sun_el = sum(s.sun.elevation_deg for s in series.samples) / n

    events_by_type = {ev.event: ev for ev in series.events}
    next_sunset = events_by_type.get(
        EventType.SUNSET,
        EventPrediction(event=EventType.SUNSET, time_utc=None, seconds_from_reference=None, beyond_window=True),
    )
    next_earthset = events_by_type.get(
        EventType.EARTHSET,
        EventPrediction(event=EventType.EARTHSET, time_utc=None, seconds_from_reference=None, beyond_window=True),
    )

    advanced_dte = compute_advanced_dte_metrics(series, dte_elevation_mask_deg)

    return SiteSummaryMetrics(
        site=series.site,
        horizon_source=series.computation.horizon_source,
        sunlit_fraction=round(sunlit_frac, 4),
        dte_fraction=round(dte_frac, 4),
        sun_and_dte_fraction=round(both_frac, 4),
        longest_sunlit_hours=_longest_streak_hours(sunlit_flags, step_hours),
        longest_darkness_hours=_longest_streak_hours(dark_flags, step_hours),
        mean_sun_elevation_deg=round(mean_sun_el, 4),
        next_sunset=next_sunset,
        next_earthset=next_earthset,
        advanced_dte=advanced_dte,
    )


def compare_sites(req: ComparisonRequest) -> ComparisonResult:
    """Evalua de 1 a 4 sitios bajo identicos parametros temporales y devuelve sus metricas comparadas."""
    metrics_list: list[SiteSummaryMetrics] = []
    last_comp: ComputationInfo | None = None

    for site in req.sites:
        vis_req = VisibilityRequest(
            site=site,
            window=req.window,
            dte_elevation_mask_deg=req.dte_elevation_mask_deg,
            ephemeris=req.ephemeris,
        )
        series = compute_visibility_timeseries(vis_req)
        metrics_list.append(summarize_site_metrics(series, req.dte_elevation_mask_deg))
        last_comp = series.computation

    assert last_comp is not None
    return ComparisonResult(
        window=req.window,
        metrics=metrics_list,
        computation=last_comp,
    )


# --------------------------------------------------------------------------- Modelado de Energia Solar (MATH_MODELS §5)


def compute_solar_irradiance_am0(distance_km: float, visible_fraction: float) -> float:
    """Calcula la irradiancia espacial solar AM0 ajustada por distancia heliocentrica (MATH_MODELS §5.1).

    Formula: S(t) = (1368.0 / d_au^2) * visible_fraction [W/m^2]
    """
    if visible_fraction <= 0.0 or distance_km <= 0.0:
        return 0.0
    dist_au = distance_km / AU_KM
    flux = (SOLAR_CONSTANT_AM0_W_M2 / (dist_au**2)) * visible_fraction
    return max(0.0, float(flux))


def compute_solar_energy_analysis(
    series: VisibilityTimeSeries,
    fixed_azimuth_deg: float = 0.0,
) -> SolarEnergySummary:
    """Calcula potencia instantanea, energia acumulada y buscador de acimut optimo (MATH_MODELS §5).

    Evalua 3 arquitecturas:
      1. horizontal_panel: plano en superficie (proporcional a sin(elevacion)).
      2. tracking_vertical_panel: vertical con seguimiento en acimut (proporcional a cos(elevacion)).
      3. fixed_vertical_panel: vertical fijo con efecto coseno (cos(elevacion) * max(0, cos(az_sol - az_panel))).
    Y el buscador automatico de acimut optimo evaluando los 360 grados discretos [0°, 359°].
    """
    n = len(series.samples)
    step_hours = float(series.window.step_minutes) / 60.0

    if n == 0:
        empty_arch = SolarArchitectureEnergy(
            architecture="horizontal_panel",
            azimuth_deg=None,
            total_energy_kwh_m2=0.0,
            peak_flux_w_m2=0.0,
            mean_flux_w_m2=0.0,
        )
        return SolarEnergySummary(
            solar_constant_am0_w_m2=SOLAR_CONSTANT_AM0_W_M2,
            mean_solar_distance_au=1.0,
            horizontal_panel=empty_arch,
            tracking_vertical_panel=empty_arch.model_copy(update={"architecture": "tracking_vertical_panel"}),
            fixed_vertical_panel=empty_arch.model_copy(
                update={"architecture": "fixed_vertical_panel", "azimuth_deg": round(fixed_azimuth_deg % 360.0, 2)}
            ),
            optimal_azimuth=OptimalAzimuthResult(
                optimal_panel_azimuth_deg=0.0,
                optimal_fixed_energy_kwh_m2=0.0,
                azimuth_energy_curve_kwh_m2=[0.0] * 360,
            ),
        )

    az_sun_deg = np.array([s.sun.azimuth_deg for s in series.samples], dtype=np.float64)
    el_sun_deg = np.array([s.sun.elevation_deg for s in series.samples], dtype=np.float64)
    vis_frac = np.array([s.sun.visible_fraction for s in series.samples], dtype=np.float64)
    dist_km = np.array([s.sun.distance_km for s in series.samples], dtype=np.float64)

    dist_au = np.maximum(dist_km, 1.0) / AU_KM
    mean_au = float(np.mean(dist_au))

    # Irradiancia espacial efectiva incidente considerando distancia y fraccion visible del disco
    s_eff = np.where(vis_frac > 0.0, (SOLAR_CONSTANT_AM0_W_M2 / (dist_au**2)) * vis_frac, 0.0)

    # Solo incide radiacion directa si el Sol esta sobre el horizonte matematico (e > 0)
    el_rad = np.radians(el_sun_deg)
    az_rad = np.radians(az_sun_deg)
    sun_above_horizon = el_sun_deg > 0.0

    # 1) Panel horizontal: P = S_eff * sin(e)
    p_horiz = np.where(sun_above_horizon, s_eff * np.sin(el_rad), 0.0)
    e_horiz_kwh = float(np.sum(p_horiz) * step_hours / 1000.0)

    # 2) Panel vertical con seguimiento de acimut: P = S_eff * cos(e)
    p_track = np.where(sun_above_horizon, s_eff * np.cos(el_rad), 0.0)
    e_track_kwh = float(np.sum(p_track) * step_hours / 1000.0)

    # 3) Panel vertical fijo a fixed_azimuth_deg: P = S_eff * cos(e) * max(0, cos(az_sun - az_panel))
    panel_fixed_rad = math.radians(fixed_azimuth_deg % 360.0)
    cos_diff_fixed = np.maximum(0.0, np.cos(az_rad - panel_fixed_rad))
    p_fixed = np.where(sun_above_horizon, p_track * cos_diff_fixed, 0.0)
    e_fixed_kwh = float(np.sum(p_fixed) * step_hours / 1000.0)

    # 4) Buscador de Acimut Optimo (0° a 359°)
    candidate_azimuths_deg = np.arange(360, dtype=np.float64)
    candidate_azimuths_rad = np.radians(candidate_azimuths_deg)

    # p_track es shape (N,), matriz de cosenos es shape (N, 360)
    diff_all = az_rad[:, None] - candidate_azimuths_rad[None, :]
    cos_diff_all = np.maximum(0.0, np.cos(diff_all))
    p_all_matrix = p_track[:, None] * cos_diff_all
    energy_all_kwh = np.sum(p_all_matrix, axis=0) * (step_hours / 1000.0)

    best_idx = int(np.argmax(energy_all_kwh))
    optimal_az = float(candidate_azimuths_deg[best_idx])
    optimal_energy = float(energy_all_kwh[best_idx])
    curve_list = [round(float(val), 4) for val in energy_all_kwh]

    return SolarEnergySummary(
        solar_constant_am0_w_m2=SOLAR_CONSTANT_AM0_W_M2,
        mean_solar_distance_au=round(mean_au, 6),
        horizontal_panel=SolarArchitectureEnergy(
            architecture="horizontal_panel",
            azimuth_deg=None,
            total_energy_kwh_m2=round(e_horiz_kwh, 4),
            peak_flux_w_m2=round(float(np.max(p_horiz)), 2) if n > 0 else 0.0,
            mean_flux_w_m2=round(float(np.mean(p_horiz)), 2) if n > 0 else 0.0,
        ),
        tracking_vertical_panel=SolarArchitectureEnergy(
            architecture="tracking_vertical_panel",
            azimuth_deg=None,
            total_energy_kwh_m2=round(e_track_kwh, 4),
            peak_flux_w_m2=round(float(np.max(p_track)), 2) if n > 0 else 0.0,
            mean_flux_w_m2=round(float(np.mean(p_track)), 2) if n > 0 else 0.0,
        ),
        fixed_vertical_panel=SolarArchitectureEnergy(
            architecture="fixed_vertical_panel",
            azimuth_deg=round(fixed_azimuth_deg % 360.0, 2),
            total_energy_kwh_m2=round(e_fixed_kwh, 4),
            peak_flux_w_m2=round(float(np.max(p_fixed)), 2) if n > 0 else 0.0,
            mean_flux_w_m2=round(float(np.mean(p_fixed)), 2) if n > 0 else 0.0,
        ),
        optimal_azimuth=OptimalAzimuthResult(
            optimal_panel_azimuth_deg=optimal_az,
            optimal_fixed_energy_kwh_m2=round(optimal_energy, 4),
            azimuth_energy_curve_kwh_m2=curve_list,
        ),
    )


def find_optimal_panel_azimuth(series: VisibilityTimeSeries) -> OptimalAzimuthResult:
    """Evalua los 360 grados de acimut [0°, 359°] y localiza la orientacion de maxima energia (MATH_MODELS §5.4)."""
    return compute_solar_energy_analysis(series).optimal_azimuth
