---
name: lola-topography-horizon
description: >-
  Use this skill when reading LOLA digital elevation models (GeoTIFF/IMG in south polar stereographic projection),
  converting between lat/lon and projected coordinates, sampling terrain heights, or computing the 360-degree local
  topographic horizon profile on the airless Moon (no refraction, sphere R = 1737.4 km) by great-circle raycasting.
---

# LOLA Topography & Horizon — Airless 360° Horizon

Equations: `docs/MATH_MODELS.md §2`. Oracles: `backend/tests/oracles/horizon_oracle.py`, `backend/tests/test_horizon_geometry.py`.
Code owner: `astro-terrain-specialist` (`backend/app/services/terrain.py`, `horizon.py`).

## 1. Data

- Primary product: LOLA south polar DEM (20 m/px, 80°S–90°S) from NASA GSFC PGDA / PDS Geosciences. See `data/lola_dem/README.md`.
- Before using a product, **read its metadata** and record in `VALIDATION_LOG.md`: CRS, resolution, height units, `nodata`, *pixel-is-area* vs *pixel-is-point*.

## 2. South Polar Stereographic Projection (sphere R = 1 737 400 m, true scale at the pole)

```
+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs
```

Reference formulas (test oracle; in production use `pyproj.Transformer` with the GeoTIFF CRS):

- Forward: `rho = 2R·tan(π/4 + φ/2)`, `x = rho·sin λ`, `y = rho·cos λ`
- Inverse: `rho = hypot(x, y)`, `φ = −(π/2 − 2·atan(rho / 2R))`, `λ = atan2(x, y)`
- Scale factor: `k = 2 / (1 − sin φ)` (= 1 at the south pole, φ = −90°).

## 3. Reading with Rasterio

```python
import rasterio
from rasterio.windows import from_bounds

with rasterio.open(path) as ds:
    crs, transform, nodata = ds.crs, ds.transform, ds.nodata
    win = from_bounds(x0 - L, y0 - L, x0 + L, y0 + L, transform)   # only the L-range window
    z = ds.read(1, window=win, masked=True).astype("float64")      # convert units if km
    win_transform = ds.window_transform(win)
```

- **Bilinear** sampling in fractional pixel coordinates (`~win_transform * (x, y)`); `nodata` → `NaN` and ignored in maximum.
- Never load the full 80°S–90°S DEM into memory per request; window + cache.

## 4. Horizon Profile Algorithm

For each azimuth `A_k = k·ΔA` (ΔA = 0.5° default; 0.1° in Engineer Mode):

1. Generate distances `s_j` from `Δs` to `L` (Δs ≈ DEM resolution; adaptive `max(p, s·tan(ΔA/2))` allowed).
2. Destination point along **great circle** (not straight line in projected plane):
   `φ_j = asin(sin φ0·cos δ + cos φ0·sin δ·cos A)`, `λ_j = λ0 + atan2(sin A·sin δ·cos φ0, cos δ − sin φ0·sin φ_j)`, with `δ = s_j / R`.
3. Project `(φ_j, λ_j)` → `(x, y)` → elevation `h_j` (bilinear).
4. `γ_j = atan2((h_j − h0) − 2·r_j·sin²(δ/2), r_j·sin δ)` with `r_j = R + h_j`, `h0 = h_DEM(site) + h_mast`.
5. `γ_h(A_k) = max_j γ_j`; also store distance of the peak (for 3D and educational explanation).
6. If any `(x, y)` falls outside the DEM → `truncated = True`.

Vectorize with NumPy: matrix `(n_A, n_s)` (720 × 7500 ≈ 5.4M samples for L = 150 km, Δs = 20 m) — fits in memory.
Cache: `data/lola_dem/cache/horizon_<site>_<dem>_<ΔA>_<L>_<h_mast>.npz`.

## 5. Default Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| `L` (range) | 150 km | ~5 km massifs remain visible up to ≈ 134 km (`MATH_MODELS §2.2.4`) |
| `ΔA` | 0.5° | Solar disk ≈ 0.53°: comparable angular resolution |
| `h_mast` | 2 m | Typical panel/antenna height; configurable |

## 6. Mandatory Checks Before Using Real Data

1. Flat synthetic DEM (heights 0) → `γ_h(A) = −arccos(R/(R+h0))` for all A (error < 1e-6 rad).
2. Synthetic DEM with known wall/cone → `γ_h` matches analytical formula at that azimuth.
3. Projection roundtrip `(φ, λ) → (x, y) → (φ, λ)` with error < 1e-9°.
4. Qualitative comparison with published illumination maps (Mazarico et al., 2011) for Shackleton and Malapert.

## 7. Common Pitfalls

- Elevations in km treated as m (or vice versa) → absurd ±80° horizons.
- Rays as straight lines on the stereographic plane → growing error with distance and near the pole.
- Omitting curvature (`2·r·sin²(δ/2)`) → horizon overestimated at > 10 km.
- "North" azimuth near the pole: local north points away from the pole, not toward +y of the map.
- Adding refraction: **strictly forbidden** (RT-03).
