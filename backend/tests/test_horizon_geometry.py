"""Physical-mathematical oracles for the airless lunar horizon (RT-02, RT-03).

Owner: qa-verification-agent.
Reference: docs/MATH_MODELS.md §2 (horizon), §3 (visibility), §4 (events).

Execution (stdlib):  python -m unittest discover -s backend/tests -t backend -v
Execution (pytest):  cd backend && python -m pytest
"""

from __future__ import annotations

import math
import random
import unittest

from tests.oracles.horizon_oracle import (
    AU_KM,
    R_EARTH_EQ_KM,
    R_MOON_M,
    R_SUN_KM,
    angular_radius,
    central_angle,
    destination_point,
    disk_visible_fraction,
    elevation_azimuth_vector,
    first_crossing_time,
    geometric_horizon_distance,
    horizon_along_ray,
    horizon_elevation_naive,
    horizon_elevation_stable,
    initial_bearing,
    max_line_of_sight_distance,
    smooth_sphere_dip,
    visibility_state,
)

DEG = math.pi / 180.0
SEED = 20261114


def _circular_diff(a: float, b: float) -> float:
    return abs((a - b + math.pi) % (2 * math.pi) - math.pi)


class TestHorizonFormula(unittest.TestCase):
    """MATH_MODELS §2.1: tan(gamma) = (r_i cos(theta) - r_0) / (r_i sin(theta)), theta = d / R."""

    def test_constant_lunar_radius(self) -> None:
        self.assertEqual(R_MOON_M, 1_737_400.0)

    def test_naive_and_stable_forms_agree(self) -> None:
        rng = random.Random(SEED)
        for _ in range(2000):
            theta = 10 ** rng.uniform(-5, math.log10(0.2))
            h0 = rng.uniform(0.0, 100.0)
            hi = rng.uniform(-5000.0, 8000.0)
            naive = horizon_elevation_naive(R_MOON_M + h0, R_MOON_M + hi, theta)
            stable = horizon_elevation_stable(h0, hi, theta)
            self.assertAlmostEqual(naive, stable, delta=1e-8)

    def test_formula_matches_independent_3d_vector_geometry(self) -> None:
        """The planar trigonometric formula matches the 3D vector + ENU calculation (MATH_MODELS §1.4)."""
        rng = random.Random(SEED + 1)
        for _ in range(1000):
            lat0 = rng.uniform(-89.0, 89.0) * DEG
            lon0 = rng.uniform(-180.0, 180.0) * DEG
            az = rng.uniform(0.0, 360.0) * DEG
            d = rng.uniform(50.0, 300_000.0)
            h0 = rng.uniform(0.0, 50.0)
            hi = rng.uniform(-3000.0, 6000.0)
            lat1, lon1 = destination_point(lat0, lon0, az, d)
            elev_vec, az_vec = elevation_azimuth_vector(lat0, lon0, h0, lat1, lon1, hi)
            elev_formula = horizon_elevation_stable(h0, hi, d / R_MOON_M)
            self.assertAlmostEqual(elev_vec, elev_formula, delta=1e-8)
            self.assertLess(_circular_diff(az_vec, az), 1e-7)

    def test_destination_point_preserves_great_circle_distance(self) -> None:
        rng = random.Random(SEED + 2)
        for _ in range(500):
            lat0 = rng.uniform(-89.9, 89.9) * DEG
            lon0 = rng.uniform(-180.0, 180.0) * DEG
            az = rng.uniform(0.0, 360.0) * DEG
            d = rng.uniform(1.0, 400_000.0)
            lat1, lon1 = destination_point(lat0, lon0, az, d)
            self.assertAlmostEqual(central_angle(lat0, lon0, lat1, lon1) * R_MOON_M, d, delta=1e-5)

    def test_smooth_sphere_surface_observer_gives_minus_half_theta(self) -> None:
        """Smooth sphere, h0 = hi = 0  ->  gamma = -theta/2 (MATH_MODELS §2.2.1)."""
        for theta in (1e-6, 1e-4, 1e-3, 0.01, 0.1, 0.5, 1.0):
            self.assertAlmostEqual(horizon_elevation_stable(0.0, 0.0, theta), -theta / 2.0, delta=1e-12)
            self.assertAlmostEqual(
                horizon_elevation_naive(R_MOON_M, R_MOON_M, theta), -theta / 2.0, delta=1e-9
            )

    def test_planar_limit_recovers_atan_dh_over_d(self) -> None:
        """R -> infinity  ->  gamma = atan((hi - h0)/d) (MATH_MODELS §2.2.3)."""
        big_r = 1e15
        for d, dh in ((100.0, 10.0), (5000.0, -300.0), (20_000.0, 1000.0)):
            gamma = horizon_elevation_stable(0.0, dh, d / big_r, radius_m=big_r)
            self.assertAlmostEqual(gamma, math.atan2(dh, d), delta=1e-9)


class TestAirlessSmoothSphereHorizon(unittest.TestCase):
    """MATH_MODELS §2.2.2: airless horizon dip (zero atmospheric bending), R = 1737.4 km."""

    H0 = 2.0  # mast/astronaut height [m]

    def test_dip_closed_form(self) -> None:
        dip = smooth_sphere_dip(self.H0)
        self.assertAlmostEqual(dip, math.sqrt(2 * self.H0 / R_MOON_M), delta=1e-9)
        self.assertAlmostEqual(dip / DEG, 0.086937, delta=1e-5)

    def test_geometric_horizon_distance_is_about_2_64_km(self) -> None:
        d_hor = geometric_horizon_distance(self.H0)
        self.assertAlmostEqual(d_hor, math.sqrt(2 * R_MOON_M * self.H0), delta=0.01)
        self.assertAlmostEqual(d_hor, 2636.2, delta=0.5)

    def test_tangent_point_seen_at_minus_dip_by_vector_oracle(self) -> None:
        """The tangent point is seen at exactly -dip (zero atmospheric bending)."""
        lat0, lon0 = -85.0 * DEG, 30.0 * DEG
        lat1, lon1 = destination_point(lat0, lon0, 45.0 * DEG, geometric_horizon_distance(self.H0))
        elev, _ = elevation_azimuth_vector(lat0, lon0, self.H0, lat1, lon1, 0.0)
        self.assertAlmostEqual(elev, -smooth_sphere_dip(self.H0), delta=1e-9)

    def test_numeric_ray_maximum_equals_analytic_dip(self) -> None:
        flat = lambda _lat, _lon: 0.0
        gamma_h, dist = horizon_along_ray(-85.0 * DEG, 30.0 * DEG, self.H0, 0.0, flat,
                                          max_distance_m=10_000.0, step_m=1.0)
        self.assertAlmostEqual(gamma_h, -smooth_sphere_dip(self.H0), delta=1e-7)
        self.assertAlmostEqual(dist, geometric_horizon_distance(self.H0), delta=2.0)

    def test_surface_observer_horizon_is_exactly_zero_without_atmosphere(self) -> None:
        """h0 = 0: the horizon approaches 0 deg from below (on Earth, atmospheric bending would raise it ~0.57 deg)."""
        self.assertEqual(smooth_sphere_dip(0.0), 0.0)
        gamma_near = horizon_elevation_stable(0.0, 0.0, 1e-7)
        self.assertLess(gamma_near, 0.0)
        self.assertGreater(gamma_near, -1e-7)

    def test_distant_massif_line_of_sight_limit(self) -> None:
        """A 5 km peak protrudes above the horizon only if d < R(acos(R/(R+h0)) + acos(R/(R+H))) (~134.29 km)."""
        peak_h = 5000.0
        d_max = max_line_of_sight_distance(self.H0, peak_h)
        parabolic_approx = math.sqrt(2 * R_MOON_M * self.H0) + math.sqrt(2 * R_MOON_M * peak_h)
        # Parabolic approximation sqrt(2RH) overestimates by ~158 m for H=5 km (O((H/R)^(3/2)) term)
        self.assertAlmostEqual(d_max, parabolic_approx, delta=200.0)
        self.assertAlmostEqual(d_max / 1000.0, 134.29, delta=0.05)
        dip = smooth_sphere_dip(self.H0)
        visible = horizon_elevation_stable(self.H0, peak_h, (d_max - 2000.0) / R_MOON_M)
        hidden = horizon_elevation_stable(self.H0, peak_h, (d_max + 2000.0) / R_MOON_M)
        self.assertGreater(visible, -dip)
        self.assertLess(hidden, -dip)


class TestKnownObstacleOcclusion(unittest.TestCase):
    """Synthetic 1000 m wall at 20 km over azimuth sector 80-100 deg on smooth sphere."""

    LAT0, LON0, H0 = -85.0 * DEG, 30.0 * DEG, 2.0
    WALL_H, WALL_NEAR, WALL_FAR = 1000.0, 19_995.0, 20_205.0
    SECTOR = (80.0 * DEG, 100.0 * DEG)

    def _terrain(self, lat: float, lon: float) -> float:
        d = central_angle(self.LAT0, self.LON0, lat, lon) * R_MOON_M
        az = initial_bearing(self.LAT0, self.LON0, lat, lon)
        if self.WALL_NEAR <= d <= self.WALL_FAR and self.SECTOR[0] <= az <= self.SECTOR[1]:
            return self.WALL_H
        return 0.0

    def _profile(self, az_deg: float) -> tuple[float, float]:
        return horizon_along_ray(self.LAT0, self.LON0, self.H0, az_deg * DEG, self._terrain,
                                 max_distance_m=30_000.0, step_m=10.0)

    def test_wall_raises_horizon_to_analytic_value(self) -> None:
        gamma_h, dist = self._profile(90.0)
        expected = horizon_elevation_stable(self.H0, self.WALL_H, 20_000.0 / R_MOON_M)
        self.assertAlmostEqual(gamma_h, expected, delta=1e-9)
        self.assertAlmostEqual(dist, 20_000.0, delta=1e-6)
        # Physical value: ~2.53 deg (atan(998/20000) minus curvature drop d^2/2R ~ 115 m)
        self.assertAlmostEqual(gamma_h / DEG, 2.53, delta=0.02)
        self.assertLess(gamma_h, math.atan2(self.WALL_H - self.H0, 20_000.0))  # curvature reduces it

    def test_open_azimuth_keeps_smooth_sphere_horizon(self) -> None:
        gamma_h, _ = self._profile(270.0)
        self.assertAlmostEqual(gamma_h, -smooth_sphere_dip(self.H0), delta=1e-6)

    def test_sun_occultation_states_behind_wall(self) -> None:
        alpha = angular_radius(R_SUN_KM, AU_KM)
        gamma_wall, _ = self._profile(90.0)
        gamma_open, _ = self._profile(270.0)
        margin = 0.01 * DEG

        e_low = gamma_wall - alpha - margin
        self.assertEqual(visibility_state(e_low, alpha, gamma_wall), "occulted")
        self.assertEqual(disk_visible_fraction(e_low, alpha, gamma_wall), 0.0)

        self.assertEqual(visibility_state(gamma_wall, alpha, gamma_wall), "partial")
        self.assertAlmostEqual(disk_visible_fraction(gamma_wall, alpha, gamma_wall), 0.5, delta=1e-12)

        e_high = gamma_wall + alpha + margin
        self.assertEqual(visibility_state(e_high, alpha, gamma_wall), "visible")
        self.assertEqual(disk_visible_fraction(e_high, alpha, gamma_wall), 1.0)

        # Same Sun at 1 deg elevation: occulted by the eastern wall, visible to the west
        self.assertEqual(visibility_state(1.0 * DEG, alpha, gamma_wall), "occulted")
        self.assertEqual(visibility_state(1.0 * DEG, alpha, gamma_open), "visible")

    def test_earth_partially_hidden_behind_wall(self) -> None:
        alpha_earth = angular_radius(R_EARTH_EQ_KM, 384_400.0)
        gamma_wall, _ = self._profile(90.0)
        self.assertEqual(visibility_state(2.0 * DEG, alpha_earth, gamma_wall), "partial")
        self.assertLess(2.0 * DEG - gamma_wall, 0.0)  # center below horizon -> no DTE with 0 deg mask


class TestApparentDiskAndFraction(unittest.TestCase):
    """MATH_MODELS §3.1 and §3.3."""

    def test_sun_angular_radius(self) -> None:
        self.assertAlmostEqual(angular_radius(R_SUN_KM, AU_KM) / DEG, 0.2666, delta=5e-4)

    def test_earth_angular_radius_range(self) -> None:
        self.assertAlmostEqual(angular_radius(R_EARTH_EQ_KM, 384_400.0) / DEG, 0.9507, delta=5e-4)
        self.assertGreater(angular_radius(R_EARTH_EQ_KM, 356_500.0) / DEG, 1.0)
        self.assertLess(angular_radius(R_EARTH_EQ_KM, 406_700.0) / DEG, 0.9)

    def test_disk_fraction_limits_symmetry_and_known_value(self) -> None:
        alpha = 0.27 * DEG
        self.assertEqual(disk_visible_fraction(1.0, alpha, 0.0), 1.0)
        self.assertEqual(disk_visible_fraction(-1.0, alpha, 0.0), 0.0)
        previous = 1.0
        for k in range(-20, 21):
            x = k / 20.0
            f = disk_visible_fraction(-x * alpha, alpha, 0.0)   # horizon - e = x * alpha
            f_mirror = disk_visible_fraction(x * alpha, alpha, 0.0)
            self.assertAlmostEqual(f + f_mirror, 1.0, delta=1e-12)
            self.assertLessEqual(f, previous + 1e-15)
            previous = f
        expected = (math.acos(0.5) - 0.5 * math.sqrt(0.75)) / math.pi
        self.assertAlmostEqual(disk_visible_fraction(-0.5 * alpha, alpha, 0.0), expected, delta=1e-12)
        self.assertAlmostEqual(expected, 0.195501, delta=1e-6)


class TestTimeToSetOracle(unittest.TestCase):
    """MATH_MODELS §4: time remaining until Sunset/Earthset."""

    def test_linear_crossing(self) -> None:
        times = [float(t) for t in range(21)]
        self.assertAlmostEqual(first_crossing_time(times, [5.0 - 0.5 * t for t in times]), 10.0, delta=1e-12)

    def test_no_crossing_returns_none(self) -> None:
        times = [float(t) for t in range(10)]
        self.assertIsNone(first_crossing_time(times, [1.0 + t for t in times]))

    def test_ignores_rising_crossing(self) -> None:
        times = [float(t) for t in range(30)]
        values = [math.sin(2 * math.pi * (t - 10.0) / 20.0) for t in times]  # rises at t=10, sets at t=20
        self.assertAlmostEqual(first_crossing_time(times, values), 20.0, delta=1e-9)

    def test_sunset_behind_wall_countdown(self) -> None:
        """Sun descending 0.1 deg/h behind a 2.53 deg horizon: complete sunset when e + alpha = gamma."""
        alpha = angular_radius(R_SUN_KM, AU_KM) / DEG
        horizon_deg, e0_deg, rate_deg_per_h = 2.53, 3.0, 0.1
        times = [600.0 * k for k in range(24 * 6 + 1)]  # 24 h every 10 min
        g = [e0_deg - rate_deg_per_h * t / 3600.0 + alpha - horizon_deg for t in times]
        expected_s = (e0_deg + alpha - horizon_deg) / rate_deg_per_h * 3600.0
        self.assertAlmostEqual(first_crossing_time(times, g), expected_s, delta=1.0)


if __name__ == "__main__":
    unittest.main()
