"""Oraculos geometricos independientes para el horizonte lunar sin atmosfera.

Propietario: qa-verification-agent.
Derivados EXCLUSIVAMENTE de docs/MATH_MODELS.md (no del codigo de app/services).
Solo stdlib (math) para que la suite sea verificable sin dependencias.

Todas las magnitudes internas en metros y radianes.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence

R_MOON_M: float = 1_737_400.0          # MATH_MODELS §0
R_SUN_KM: float = 695_700.0
R_EARTH_EQ_KM: float = 6_378.137
AU_KM: float = 149_597_870.7

Vector3 = tuple[float, float, float]


# --------------------------------------------------------------------------- geometria esferica
def central_angle(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Angulo central entre dos puntos (haversine) [rad]."""
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2.0 * math.asin(min(1.0, math.sqrt(a)))


def destination_point(lat: float, lon: float, azimuth: float, distance_m: float,
                      radius_m: float = R_MOON_M) -> tuple[float, float]:
    """Punto alcanzado recorriendo un circulo maximo con acimut inicial dado (MATH_MODELS §2.3)."""
    delta = distance_m / radius_m
    lat2 = math.asin(math.sin(lat) * math.cos(delta) + math.cos(lat) * math.sin(delta) * math.cos(azimuth))
    lon2 = lon + math.atan2(math.sin(azimuth) * math.sin(delta) * math.cos(lat),
                            math.cos(delta) - math.sin(lat) * math.sin(lat2))
    return lat2, (lon2 + math.pi) % (2 * math.pi) - math.pi


def initial_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Acimut inicial del circulo maximo de 1 a 2, desde el norte, horario, [0, 2pi) [rad]."""
    dlon = lon2 - lon1
    y = math.sin(dlon) * math.cos(lat2)
    x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlon)
    return math.atan2(y, x) % (2 * math.pi)


# --------------------------------------------------------------------------- elevacion del terreno
def horizon_elevation_naive(r0_m: float, ri_m: float, theta_rad: float) -> float:
    """Formula literal: tan(gamma) = (r_i cos(theta) - r_0) / (r_i sin(theta))  (MATH_MODELS §2.1)."""
    return math.atan2(ri_m * math.cos(theta_rad) - r0_m, ri_m * math.sin(theta_rad))


def horizon_elevation_stable(h0_m: float, hi_m: float, theta_rad: float,
                             radius_m: float = R_MOON_M) -> float:
    """Forma estable: atan2((h_i - h_0) - 2 r_i sin^2(theta/2), r_i sin(theta))  (MATH_MODELS §2.1)."""
    ri = radius_m + hi_m
    num = (hi_m - h0_m) - 2.0 * ri * math.sin(theta_rad / 2.0) ** 2
    return math.atan2(num, ri * math.sin(theta_rad))


def _to_cartesian(lat: float, lon: float, r: float) -> Vector3:
    return (r * math.cos(lat) * math.cos(lon), r * math.cos(lat) * math.sin(lon), r * math.sin(lat))


def _dot(a: Vector3, b: Vector3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def elevation_azimuth_vector(lat0: float, lon0: float, h0_m: float,
                             lat1: float, lon1: float, h1_m: float,
                             radius_m: float = R_MOON_M) -> tuple[float, float]:
    """Oraculo independiente por geometria vectorial 3D + base ENU (MATH_MODELS §1.4).

    Devuelve (elevacion, acimut) en radianes; acimut desde el norte, horario, [0, 2pi).
    """
    p0 = _to_cartesian(lat0, lon0, radius_m + h0_m)
    p1 = _to_cartesian(lat1, lon1, radius_m + h1_m)
    rho = (p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2])
    norm = math.sqrt(_dot(rho, rho))
    u = (math.cos(lat0) * math.cos(lon0), math.cos(lat0) * math.sin(lon0), math.sin(lat0))
    e = (-math.sin(lon0), math.cos(lon0), 0.0)
    n = (-math.sin(lat0) * math.cos(lon0), -math.sin(lat0) * math.sin(lon0), math.cos(lat0))
    elevation = math.asin(max(-1.0, min(1.0, _dot(rho, u) / norm)))
    azimuth = math.atan2(_dot(rho, e), _dot(rho, n)) % (2 * math.pi)
    return elevation, azimuth


def smooth_sphere_dip(h0_m: float, radius_m: float = R_MOON_M) -> float:
    """Depresion del horizonte geometrico: arccos(R / (R + h0))  (MATH_MODELS §2.2.2)."""
    return math.acos(radius_m / (radius_m + h0_m))


def geometric_horizon_distance(h0_m: float, radius_m: float = R_MOON_M) -> float:
    """Distancia superficial al punto de tangencia: R * arccos(R/(R+h0)) [m]."""
    return radius_m * smooth_sphere_dip(h0_m, radius_m)


def max_line_of_sight_distance(h0_m: float, peak_h_m: float, radius_m: float = R_MOON_M) -> float:
    """Distancia superficial maxima a la que una cima de altura H sobresale del horizonte de esfera lisa.

    Exacta: R * (arccos(R/(R+h0)) + arccos(R/(R+H))). Aproximacion: sqrt(2Rh0) + sqrt(2RH).
    """
    return radius_m * (math.acos(radius_m / (radius_m + h0_m)) + math.acos(radius_m / (radius_m + peak_h_m)))


# --------------------------------------------------------------------------- perfil de horizonte
HeightFn = Callable[[float, float], float]


def horizon_along_ray(lat0: float, lon0: float, h0_m: float, azimuth: float, height_fn: HeightFn,
                      max_distance_m: float, step_m: float,
                      radius_m: float = R_MOON_M) -> tuple[float, float]:
    """Maximo de gamma a lo largo de un rayo de circulo maximo (MATH_MODELS §2.3).

    Devuelve (gamma_h [rad], distancia del obstaculo [m]).
    """
    best_gamma = -math.inf
    best_dist = 0.0
    n_steps = round(max_distance_m / step_m)
    for j in range(1, n_steps + 1):
        d = j * step_m
        lat, lon = destination_point(lat0, lon0, azimuth, d, radius_m)
        gamma = horizon_elevation_stable(h0_m, height_fn(lat, lon), d / radius_m, radius_m)
        if gamma > best_gamma:
            best_gamma, best_dist = gamma, d
    return best_gamma, best_dist


# --------------------------------------------------------------------------- visibilidad
def angular_radius(body_radius_km: float, distance_km: float) -> float:
    """alpha = arcsin(R_B / |rho|)  (MATH_MODELS §3.1) [rad]."""
    return math.asin(body_radius_km / distance_km)


def visibility_state(elevation: float, alpha: float, horizon: float) -> str:
    """'visible' | 'partial' | 'occulted'  (MATH_MODELS §3.2)."""
    if elevation - alpha > horizon:
        return "visible"
    if elevation + alpha < horizon:
        return "occulted"
    return "partial"


def disk_visible_fraction(elevation: float, alpha: float, horizon: float) -> float:
    """Fraccion de disco uniforme sobre un horizonte localmente recto (MATH_MODELS §3.3)."""
    x = (horizon - elevation) / alpha
    if x <= -1.0:
        return 1.0
    if x >= 1.0:
        return 0.0
    return (math.acos(x) - x * math.sqrt(1.0 - x * x)) / math.pi


# --------------------------------------------------------------------------- eventos
def first_crossing_time(times_s: Sequence[float], values: Sequence[float]) -> float | None:
    """Primer instante en que g pasa de > 0 a <= 0, por interpolacion lineal (MATH_MODELS §4).

    Oraculo de referencia para la cuenta atras hasta Sunset/Earthset. None si no hay cruce.
    """
    for k in range(len(values) - 1):
        g0, g1 = values[k], values[k + 1]
        if g0 > 0.0 >= g1:
            t0, t1 = times_s[k], times_s[k + 1]
            return t0 + (t1 - t0) * g0 / (g0 - g1)
    return None
