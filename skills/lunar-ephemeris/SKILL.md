---
name: lunar-ephemeris
description: >-
  Use this skill when computing or validating the apparent azimuth/elevation of the Sun and the Earth as seen from a
  point on the lunar surface (selenographic lat/lon), including physical libration (MOON_PA/MOON_ME frames), SPICE
  kernels DE421/DE440, Skyfield usage, light-time/aberration, and validation against JPL Horizons fixtures.
---

# Lunar Ephemeris — Sun and Earth from the Lunar Surface

Equations: `docs/MATH_MODELS.md §1` and `§3.1`. Code owner: `astro-terrain-specialist` (`backend/app/services/ephemeris.py`).

## 1. Required Kernels (see `data/ephemeris/README.md`)

| Kernel | Purpose |
|--------|---------|
| `de421.bsp` | Sun, Earth, Moon positions (1900–2050) |
| `moon_pa_de421_1900-2050.bpc` | Physical libration (Euler angles) → MOON_PA |
| `moon_080317.tf` | Fixed rotation MOON_PA → **MOON_ME** (LOLA reference frame) |
| `pck00008.tpc` | Text constants required by `PlanetaryConstants` |

For DE440 use `de440s.bsp` + `moon_pa_de440_*.bpc` + `moon_de440_*.tf` (check exact filenames on NAIF). **Never** mix a `.bpc` from one DE with the `.tf` of another.

## 2. Skyfield Recipe ("Planetary reference frames" official docs pattern)

```python
from skyfield.api import load, PlanetaryConstants

ts = load.timescale()
eph = load("data/ephemeris/de421.bsp")
pc = PlanetaryConstants()
pc.read_text(load("data/ephemeris/moon_080317.tf"))
pc.read_text(load("data/ephemeris/pck00008.tpc"))
pc.read_binary(load("data/ephemeris/moon_pa_de421_1900-2050.bpc"))
frame = pc.build_frame_named("MOON_ME_DE421")          # MOON_ME, includes physical libration

moon = eph["moon"]
site = moon + pc.build_latlon_degrees(frame, lat_deg, lon_deg, elevation_m)

t = ts.utc(2027, 1, 1, range(0, 24 * 30))               # vectorized: 30 days, 1 h step
for body_name in ("sun", "earth"):
    app = site.at(t).observe(eph[body_name]).apparent()  # light-time + aberration; NO refraction
    alt, az, dist = app.altaz()                         # alt/az relative to sphere normal
```

Rules:
- `altaz()` **without** temperature/pressure arguments (airless Moon).
- `elevation_m` = DEM elevation + mast height, relative to R = 1737.4 km.
- Load kernels **once** (singleton/`lru_cache`), not per request.
- Convert to degrees only at the API boundary.
- Use `load` with an explicit directory (`Loader("data/ephemeris")`) and **zero implicit downloads** in production/tests.

## 3. Validation Against JPL Horizons (RT-01 Oracle)

Fixture generation (QA script, the only part with network access; results versioned in `backend/tests/fixtures/horizons/`):

```
GET https://ssd.jpl.nasa.gov/api/horizons.api
  format=json  MAKE_EPHEM=YES  EPHEM_TYPE=OBSERVER
  COMMAND='10'            (Sun)   |  '399' (Earth)
  CENTER='coord@301'      COORD_TYPE='GEODETIC'
  SITE_COORD='<lon_E_deg>,<lat_deg>,<alt_km>'
  START_TIME='2027-01-01'  STOP_TIME='2027-01-31'  STEP_SIZE='1 h'
  QUANTITIES='4'          (apparent Az/El)
  ANG_FORMAT='DEG'  APPARENT='AIRLESS'  CSV_FORMAT='YES'  TIME_ZONE='+00:00'
```

- Confirm in the response header which lunar body frame Horizons uses (ME vs PA) and record it in the fixture.
- Horizons measures Az clockwise from north toward east (same as our contract).
- Tolerances (`MATH_MODELS.md §7`): ≤ 0.01° target, ≤ 0.05° acceptance. Error > 0.05° → check frame (PA vs ME ≈ 0.02°–0.03°), time scale (UTC vs TDB), and longitude sign.

## 4. Physical Sanity Checks (cheap tests without Horizons)

| Case | Expectation |
|------|-------------|
| South pole (≈ −89.9°) for 1 year | \|e_Sun\| ≲ 1.6° (lunar obliquity 1.54° + parallax) |
| South pole, 1 month | e_Earth oscillates ≈ ±6.7° (libration in latitude) |
| Apollo 11 | e_Earth ≈ 60°–75°, always > 0 |
| Chang'e 4 (far side) | e_Earth < 0 always → DTE = 0 % |
| Any site | α_Sun ∈ [0.262°, 0.272°]; α_Earth ∈ [0.89°, 1.03°] |

## 5. Common Pitfalls

- Using the IAU_MOON frame (simplified rotation model) instead of MOON_ME → surface errors of hundreds of meters.
- Mixing 0–360 vs ±180 longitudes → normalize at input.
- Requesting `APPARENT='REFRACTED'` from Horizons (does not apply to the Moon and invalidates the oracle).
- Kernels outside temporal range (DE421 ends in 2050) → validate `TimeWindow` and return `ErrorResponse`.
