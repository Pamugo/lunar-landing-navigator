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
    BodyPosition,
    ComparisonRequest,
    ComparisonResult,
    ComputationInfo,
    EventPrediction,
    EventType,
    HorizonProfile,
    HorizonRequest,
    SiteSummaryMetrics,
    TimeWindow,
    VisibilityRequest,
    VisibilitySample,
    VisibilityState,
    VisibilityTimeSeries,
)
from app.services.ephemeris import EphemerisSampleDict, compute_body_ephemeris
from app.services.horizon import compute_horizon_profile, interpolate_horizon_deg


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


def summarize_site_metrics(
    series: VisibilityTimeSeries,
    dte_elevation_mask_deg: float = 0.0,
) -> SiteSummaryMetrics:
    """Agrega las metricas de iluminacion solar, visibilidad DTE y ventanas simultaneas Sol+Tierra."""
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
