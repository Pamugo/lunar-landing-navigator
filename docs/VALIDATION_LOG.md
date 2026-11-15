# VALIDATION_LOG — Scientific and Infrastructure Verification Log

> **Owner:** `qa-verification-agent` · **Reviewed by:** `lead-architect-auditor`
> Every run of `/verify-env`, `/verify-physics`, or validation against JPL Horizons / LOLA must be recorded here with reproducible evidence.

---

## Entry Template (copy for each new verification)

```markdown
### [VAL-YYYYMMDD-NN] <Short verification title>
- **UTC Date:** YYYY-MM-DDTHH:MM:SSZ
- **Phase / Sprint:** Phase X / Sprint Y
- **Executing Agent:** `qa-verification-agent`
- **Requirements Covered:** RF-xx, RT-xx
- **Command Run:**
  ```bash
  <exact command>
  ```
- **Result:** X passed · Y skipped · Z failed (Exit code: 0)
- **Verified Tolerances:**
  - <quantity>: max error = <value> (threshold = <tolerance>, ref. `docs/MATH_MODELS.md §x.y`)
- **Notes / Open Actions:**
  - ...
```

---

## Verification History

### [VAL-20261114-01] Multi-Agent Infrastructure & Geometric Oracles Bootstrap (Phase 0)
- **UTC Date:** 2026-11-14T09:00:00Z
- **Phase / Sprint:** Phase 0 — Initialization & Infrastructure
- **Executing Agent:** `qa-verification-agent` / `lead-architect-auditor`
- **Requirements Covered:** RF-01 (base catalog), RF-03 (time contract), RF-04 (event oracle), RT-02 (horizon & polar projection oracle), RT-03 (airless lunar sphere R = 1737.4 km), RT-04 (Python/TS contract parity)
- **Commands Run:**
  ```bash
  python scripts/verify_environment.py
  python -m unittest discover -s backend/tests -t backend -v
  ```
- **Result:**
  - `verify_environment.py`: **49 PASS · 10 WARN · 0 FAIL** (Exit code `0`; `WARN` items correspond exclusively to Sprint 1/2 third-party packages not yet installed globally).
  - `unittest discover`: **30 executed · 27 passed · 3 skipped (Sprint 1 ephemeris skips) · 0 failed** (`0.040 s`).
- **Verified Tolerances (`backend/tests/test_horizon_geometry.py` & `test_curated_sites.py`):**
  - Single reference lunar radius: `R = 1_737_400.0 m` (`MATH_MODELS.md §0`).
  - Equivalence between trigonometric formula `tan(gamma) = (r_i cos(theta) - r_0) / (r_i sin(theta))`, numerically stable form, and 3D ENU vector geometry across 1000–2000 random cases: `|Δγ| < 1e-8 rad` (`MATH_MODELS.md §1.4, §2.1`).
  - Smooth sphere with surface observer (`h0 = hi = 0`): `γ = -θ/2` with `|Δγ| < 1e-12 rad` (`MATH_MODELS.md §2.2.1`).
  - Airless horizon dip (`h0 = 2 m`, `R = 1737.4 km`): `δ = arccos(R/(R+h0)) = 0.086937°`, distance to tangent point `d_hor = 2636.2 m`, agreement between numerical ray and closed form `< 1e-7 rad` (`MATH_MODELS.md §2.2.2`).
  - Maximum line-of-sight range to an `H = 5000 m` massif from `h0 = 2 m`: `134.29 km` exact spherical (`134.45 km` parabolic approximation $\sqrt{2RH}$, justifies default ray range `L = 150 km`, `MATH_MODELS.md §2.2.4`).
  - Known synthetic obstacle occultation (`1000 m` wall at `20 km` over azimuth `80°–100°`): horizon elevation `2.53°` vs `-0.0869°` in open azimuth (`270°`), `occulted -> partial -> visible` transitions, and visible disk fraction (`f = 0.5` at `e = γ_h`, `f + f_mirror = 1` within `< 1e-12`).
  - South polar stereographic projection roundtrip over curated polar sites: `|Δlat|, |Δlon| < 1e-9°`.
- **Notes / Open Actions for Sprint 1:**
  - Create virtual environment `.venv` and install `backend/pyproject.toml` (`pip install -e "backend[dev]"`).
  - Run reproducible SPICE kernel download script (`de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`, `pck00008.tpc`) and generate JPL Horizons fixtures to activate the 3 tests in `test_ephemeris_oracle.py`.


---

### [VAL-20261114-02] Scientific Engine Validation (Skyfield MOON_ME Ephemerides vs JPL Horizons, LOLA 360° Raycasting & Visibility)
- **UTC Date:** 2026-11-14T09:58:00Z
- **Phase / Sprint:** Sprint 1 — Ephemeris & LOLA Topography Engine Implementation (Tasks 1.1 to 1.6)
- **Executing Agent:** `qa-verification-agent` / `astro-terrain-specialist`
- **Requirements Covered:** `RF-01`, `RF-02`, `RF-03`, `RF-04`, `RF-05`, `RF-06` (backend payloads), `RT-01`, `RT-02`, `RT-03`, `RT-04`
- **SPICE Kernels Downloaded & Verified (`data/ephemeris/manifest.json`):**
  - `de421.bsp` (16 788 480 B) · SHA-256: `a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc`
  - `moon_pa_de421_1900-2050.bpc` (1 770 496 B) · SHA-256: `656f90616403d75a75f0cd6c8830fc5b44f8cb4facb5ccb8915e752b397520cf`
  - `moon_080317.tf` (21 437 B) · SHA-256: `78732477b96f9863e7b0d65bcee3c22b8707ca5ed0db56d1173319cb2e8c7993`
  - `pck00008.tpc` (111 586 B) · SHA-256: `ca07df56e9f1bca85a4c6748b618a46c0bf8e081f96f81e324896f2fdc54ea27`
- **Commands Run:**
  ```bash
  .\.venv\Scripts\python.exe scripts/fetch_kernels.py
  .\.venv\Scripts\python.exe scripts/generate_horizons_fixtures.py
  .\.venv\Scripts\python.exe scripts/verify_environment.py
  .\.venv\Scripts\python.exe -m pytest backend/tests -v
  .\.venv\Scripts\ruff.exe check backend scripts
  ```
- **Result:**
  - `verify_environment.py`: **60 PASS · 2 WARN (`node`/`npm` for Sprint 2) · 0 FAIL** (Exit code `0`).
  - `pytest backend/tests -v`: **43 passed · 0 skipped · 0 failed** in **`2.15 s`**.
  - `ruff check backend scripts`: **`All checks passed!` (0 errors)**.
- **Verified Tolerances vs NASA JPL Horizons (`backend/tests/fixtures/horizons/horizons_reference.json`):**
  - Oracle: official API `https://ssd.jpl.nasa.gov/api/horizons.api` (`CENTER='coord@301'`, `COMMAND='10'` Sun & `'399'` Earth, `APPARENT='AIRLESS'`).
  - Verified sites (5): *Shackleton Rim*, *Malapert Massif*, *Mons Mouton (IM-2 Athena)*, *Apollo 11*, *Chang'e 4 (far side)* — 90 total samples.
  - **Max elevation error (`max_el_error_deg`):** **`0.000009°` (`9e-6°` ≈ `0.032 arcsec`)** — clears the `RT-01` target (`≤ 0.01°`) by over three orders of magnitude.
  - **Max weighted azimuth error (`max_az_error_deg`):** **`0.000009°` (`9e-6°`)** — meets `RT-01` (`≤ 0.01°`).
  - **RMS error in elevation and azimuth:** **`0.000006°` (`6e-6°`)**.
- **LOLA Topography, Offline Reliability & Multi-Device Checks:**
  - **Offline `.npz` cache:** 20 precomputed profiles (5 polar sites × 4 hardware heights: `0.5 m` CSA LEAP, `1.5 m` CSA Canadian Utility Rover, `2.0 m` Artemis EVA, `3.5 m` NASA CLPS Lander) in `data/lola_dem/cache/`.
  - **Hardware height monotonicity (`RF-01`):** verified that raising the mast from `0.5 m` (CSA LEAP) $\to$ `1.5 m` (CSA Canadian Utility Rover) $\to$ `3.5 m` (CLPS Lander) monotonically decreases horizon blockage angle.
  - **Safe analytical fallback (`spherical_analytical`):** verified that any coordinate outside polar GeoTIFF coverage (e.g., equatorial latitudes or far side) degrades cleanly without exception to `HorizonSource.SPHERICAL_ANALYTICAL` with exact dip $-\arccos(R/(R+h))$.
  - **Adaptive 3D meshes (`RF-06`):** verified `mobile` (`32×32`), `tablet` (`48×48`), and `desktop` (`96×96`) resolutions.
  - **Performance budget (`RT-04`):** 30-day 1 h time series (`721` epochs, Sun + Earth + Brent events) computed in `< 0.25 s` (threshold `< 2.0 s`).

---

### [VAL-20261114-03] Fullstack Integration Sprint 2: `/api/v1` REST API, "NASA Mission Control Minimal" UI & Final Audit
- **UTC Date:** 2026-11-14T10:25:00Z
- **Phase / Sprint:** Sprint 2 — REST API, React/Three.js/ECharts Frontend & NASA Space Apps Audit (Tasks 2.1 to 2.5)
- **Executing Agent:** `qa-verification-agent` / `fullstack-visualizer` / `lead-architect-auditor`
- **Requirements Covered:** `RF-01`, `RF-02`, `RF-03`, `RF-04`, `RF-05`, `RF-06`, `RF-07`, `RT-01`, `RT-02`, `RT-03`, `RT-04`
- **Commands Run:**
  ```powershell
  .\.venv\Scripts\python.exe scripts/verify_environment.py
  .\.venv\Scripts\python.exe -m pytest backend/tests -v
  .\.venv\Scripts\ruff.exe check backend scripts
  $env:Path = "C:\Program Files\nodejs;$env:Path"
  & "C:\Program Files\nodejs\npm.cmd" --prefix frontend run typecheck
  & "C:\Program Files\nodejs\npm.cmd" --prefix frontend test
  & "C:\Program Files\nodejs\npm.cmd" --prefix frontend run build
  ```
- **Result:**
  - `verify_environment.py`: **62 PASS · 0 WARN · 0 FAIL** (Exit code `0`).
  - `pytest backend/tests -v`: **49 passed (43 physics/services + 6 `/api/v1` API endpoints) · 0 skipped · 0 failed** in **`2.71 s`**.
  - `ruff check backend scripts`: **`All checks passed!` (0 errors)**.
  - `npm --prefix frontend run typecheck` (`tsc --noEmit`): **0 TypeScript errors (`strict: true`, zero `any`)**.
  - `npm --prefix frontend test` (`vitest run`): **4 tests passed in `frontend/tests/contracts.test.ts`** (`1.64 s`).
  - `npm --prefix frontend run build` (`vite build`): **Production bundle built cleanly (`595` modules transformed in `8.90 s`)**.
- **Key Sprint 2 Verifications:**
  - **REST API (`/api/v1`):** Endpoints `/health`, `/sites`, `/hardware-profiles`, `/horizon`, `/terrain-patch`, `/visibility`, and `/compare` verified in `backend/tests/test_api_endpoints.py`, including OpenAPI contract, `spherical_analytical` fallback, and JPL Horizons scientific seal.
  - **"NASA Mission Control Minimal" Visual Identity (`docs/UI_DESIGN.md`):** Glassmorphic panels (`#0B0F19`, `rgba(17, 24, 39, 0.75)`), NASA Blue palette (`#0B3D91` / `#1E62D0`), Solar Amber (`#F59E0B`), DTE Cyan (`#06B6D4`), Golden Window Emerald (`#10B981`), and `tabular-nums` typography for coordinates, angles, and countdowns.
  - **3D Core & Multi-View Visualizations (`RF-06`):** `LunarGlobe3D.tsx` (Three.js with Sun/DTE vectors and clickable raycasting), `HorizonDome.tsx` (360° with selectable vertical exaggeration `×1`, `×5`, `×10`, `×20`), `Terrain3D.tsx` (3D LOLA DEM mesh with hardware mast), `PolarMap2D.tsx`, `ComparisonGrid.tsx`, and `ElevationTimeline.tsx` (Apache ECharts with shaded simultaneous Sun + Earth windows and synchronized scrubber).
  - **Dual Mode (`RF-07`):** Instant toggle in `HeaderHUD.tsx` between *Educational Mode* and *Engineer Mode* without network reload, alongside the interactive JPL Horizons verification seal (`≤ 0.000009°`) and official deep-links to LROC QuickMap (`https://quickmap.lroc.im-ldi.com`) and NASA Moon Trek (`https://trek.nasa.gov/moon/`).
