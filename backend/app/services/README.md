# backend/app/services — Scientific Engine

**Exclusive owner:** `astro-terrain-specialist`. No other agent edits this directory.

Modules (each preceded by its oracle test in `backend/tests/`):

| Module | Function | Oracle |
|--------|----------|--------|
| `ephemeris.py` | Apparent airless Az/El for Sun/Earth in MOON_ME (Skyfield) | `test_ephemeris_oracle.py` (JPL Horizons fixtures) |
| `terrain.py` | LOLA GeoTIFF loading, polar stereographic projection, bilinear sampling | `test_terrain_projection.py` |
| `horizon.py` | 360-deg horizon profile via great-circle raycasting | `test_horizon_geometry.py` (`tests/oracles/horizon_oracle.py`) |
| `visibility.py` | States, visible disk fraction, sunset/earthset events, metrics | `test_horizon_geometry.py`, `test_visibility_service.py` |

Rules: pure functions, internal radians, zero network I/O, equations referenced to `docs/MATH_MODELS.md` (§ section) in docstrings.
