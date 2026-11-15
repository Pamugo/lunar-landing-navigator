# CHALLENGE_SPEC — Lunar Landing Site Navigator (NASA Space Apps Challenge 2026)

> **Owner:** `lead-architect-auditor` · **Status:** v0.2 (Sprint 2 — Fullstack & Official Resources) · **Last reviewed:** 2026-11-14
> This document is the **source of truth** for requirements. Any new feature must trace to an ID in this matrix.

## 1. Problem Statement and Differential Value Proposition

Lunar south pole missions (NASA's CLPS program, Artemis, and partner-agency rovers such as CSA's) are constrained by **solar illumination** (photovoltaic power generation, thermal survival) and **Direct-to-Earth (DTE) visibility** (communications). Small changes in date, coordinates, or mast/hardware height dramatically alter operational viability.

### Value Proposition vs. Existing Tools (confirmed on the *Resources* tab)
1. **Vs. NASA Moon Trek (`https://trek.nasa.gov/moon/`)**: In Moon Trek, advanced solar illumination and slope/horizon analysis tools are **restricted to registered scientist/JPL accounts**. *Lunar Landing Site Navigator* provides 360° topographic horizon analysis, solar illumination, and DTE visibility **instantly, publicly, and without registration**.
2. **Vs. LROC QuickMap (`https://quickmap.lroc.im-ldi.com`) & JPL Horizons**: Enables comparing up to 4 sites and multiple hardware heights (e.g., *CSA Canadian Utility Rover* at 1.5 m vs. *CLPS lander* at 3.5 m) in milliseconds, including direct deep-links to QuickMap's new official domain (hosted by Intuitive Machines) and to Moon Trek.
3. **100% Deterministic Reliability and Fault Tolerance**:
   - **Offline / Pre-cached Mode**: All 9 curated sites have precomputed and verified local `.npz` horizon profiles and LOLA DEM patches to respond in milliseconds with zero network calls.
   - **Safe Analytical Fallback (`spherical_analytical`)**: Any custom coordinate outside polar GeoTIFF coverage degrades cleanly to the airless analytical spherical horizon ($R = 1737.4\text{ km}$), declaring `horizon_source` in the JSON and guaranteeing zero HTTP 500 errors.

## 2. Traceable Requirements Matrix

Status legend: ⬜ Not started · 🟡 In progress · ✅ Verified (with evidence) · ❌ Blocked

### 2.1 Functional Requirements (RF)

| ID | Requirement | Verifiable Acceptance Criterion | Component(s) | Verification / Oracle | Status |
|----|-------------|--------------------------------|--------------|-----------------------|--------|
| RF-01 | Interactive selection of curated sites (Apollo, CLPS, Artemis, international/commercial), hardware height profiles (CSA/NASA), and custom coordinates with QuickMap and Moon Trek links | ≥ 9 curated sites with `quickmap_url` (`quickmap.lroc.im-ldi.com`) and `moontrek_url`; ≥ 5 hardware profiles (`observer_height_m`, incl. CSA Canadian Utility Rover 1.5 m and CLPS lander 3.5 m); custom coordinates with clean `spherical_analytical` fallback | `data/curated_sites.json`, `services/terrain.py`, `services/horizon.py`, `GET /api/v1/sites` | `backend/tests/test_curated_sites.py`, `backend/tests/test_horizon_service.py` | ✅ (catalog, links, CSA profiles & fallback verified) |
| RF-02 | Fast side-by-side (up to 4 sites) or sequential (A/B) comparison | Identical time parameters for all sites; synchronized timeline cursors; response < 2 s with cached horizon | `services/visibility.py`, `POST /api/v1/compare`, `ComparisonGrid` | `backend/tests/test_visibility_service.py` | ✅ (backend engine & comparator UI verified) |
| RF-03 | Date/time flexibility to explore lunar days and seasons | Arbitrary UTC ISO-8601 window within kernel range (`de421.bsp`: 1900–2050); configurable step (≥ 1 min) | `services/ephemeris.py`, `TimeWindow`, `TimeControls` | `backend/tests/test_ephemeris_oracle.py` | ✅ (vectorized Skyfield engine verified) |
| RF-04 | Sun and Earth position relative to local horizon + time remaining until Sunset / Earthset | Az/El of both bodies, topographic horizon elevation at their azimuth, countdown to event with exact UTC timestamp (Brent-refined to ≤ 1 s) | `services/visibility.py`, `HorizonDome`, `EventCountdown` | `backend/tests/test_visibility_service.py` + JPL Horizons fixtures | ✅ (event engine verified) |
| RF-05 | Power and communication evaluation: solar elevation, sunlight duration, DTE windows | Per-site metrics: % sunlit, longest sunlit period, longest night, % DTE, simultaneous Sun+Earth windows | `services/visibility.py`, `SiteSummaryMetrics` | `backend/tests/test_visibility_service.py` | ✅ (metric calculation verified) |
| RF-06 | Multi-view visualization: 2D map, 3D surface (adaptive mobile/desktop mesh), 360° horizon dome, timelines/animations | Adaptive 3D meshes (`mobile` 32×32, `tablet` 48×48, `desktop` 96×96) in `terrain.py`; all views synchronized in time | `services/terrain.py`, `LunarGlobe3D`, `PolarMap2D`, `Terrain3D`, `HorizonDome`, `ElevationTimeline` | `backend/tests/test_terrain_projection.py` + Vitest | ✅ (backend payloads & 3D/2D views verified) |
| RF-07 | Dual accessibility (Engineer Mode / Educational Mode) and Cross-Device Responsive design (Mobile, Tablet, Desktop) | *NASA Mission Control Minimal* aesthetic; side-by-side comparator on desktop and swipeable cards on mobile; JPL Horizons verification seal; WCAG 2.2 AA | `HeaderHUD`, `docs/UI_DESIGN.md`, `skills/mission-comparison-ux/SKILL.md` | A11y checklist + `/audit-challenge` audit | ✅ (verified in Sprint 2) |

### 2.2 Technical Requirements (RT)

| ID | Requirement | Verifiable Acceptance Criterion | Component(s) | Verification / Oracle | Status |
|----|-------------|--------------------------------|--------------|-----------------------|--------|
| RT-01 | JPL ephemerides (`de421.bsp`) with physical lunar libration (`MOON_ME_DE421`) | `MOON_ME` frame built from `moon_pa_de421_1900-2050.bpc` + `moon_080317.tf` + `pck00008.tpc`; Az/El error vs JPL Horizons (`APPARENT=AIRLESS`) ≤ 0.01° (target), ≤ 0.05° (acceptance) | `services/ephemeris.py` (Skyfield) | `backend/tests/test_ephemeris_oracle.py` with real JPL Horizons fixtures | ✅ (verified against JPL Horizons API) |
| RT-02 | LOLA topography for local south-polar horizon and adaptive 3D patches | Reading south polar stereographic GeoTIFF (`+proj=stere +lat_0=-90 +R=1737400`); 360° profile at 0.5° step (720 samples); offline `.npz` cache for all 9 sites; `spherical_analytical` fallback outside coverage | `services/terrain.py`, `services/horizon.py` | `test_horizon_geometry.py`, `test_terrain_projection.py`, `test_horizon_service.py` | ✅ (verified with LOLA GeoTIFF & `.npz` cache) |
| RT-03 | Airless body: zero atmospheric refraction; horizon = topography + curvature ($R = 1737.4\text{ km}$) | Zero refraction terms in code; smooth-sphere dip = $\arccos(R/(R+h))$ with error < $10^{-9}\text{ rad}$ | `services/horizon.py`, `docs/MATH_MODELS.md` | `test_horizon_geometry.py`, guard in `verify_environment.py` | ✅ (verified) |
| RT-04 | Traceable accuracy, performance, offline mode, and scientific seal | Synchronized JSON contracts v0.2.0; 30-day 1 h series in < 2 s with cached horizon; `ScientificVerificationSeal` exposed with max/RMS errors vs JPL Horizons | `schemas.py`, `contracts.ts`, `services/visibility.py` | `verify_environment.py` + benchmark in `test_visibility_service.py` | ✅ (verified) |

## 3. Official "Resources" Tab Checklist (NASA Space Apps 2026)

| # | Official Resource | URL / Reference | Project Integration | Status |
|---|-------------------|-----------------|---------------------|--------|
| R-01 | **NASA/JPL Horizons System** | `https://ssd.jpl.nasa.gov/horizons/` · API `https://ssd.jpl.nasa.gov/api/horizons.api` | Scientific validation oracle (`COMMAND='10'` Sun, `'399'` Earth, `CENTER='coord@301'`, `APPARENT='AIRLESS'`) & `ScientificVerificationSeal` | ✅ Integrated & verified |
| R-02 | **NAIF SPICE Kernels** | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/` (`de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`, `pck00008.tpc`) | `services/ephemeris.py` engine with physical libration in `MOON_ME_DE421` frame | ✅ Downloaded & SHA-256 verified |
| R-03 | **LOLA South Polar DEMs (PGDA / PDS)** | `https://pgda.gsfc.nasa.gov/` · `https://pds-geosciences.wustl.edu/missions/lro/lola.htm` | GeoTIFF reading in `services/terrain.py`, 360° raycasting in `services/horizon.py`, & precomputed `.npz` cache | ✅ Integrated with offline cache & spherical fallback |
| R-04 | **NASA LROC QuickMap (New Domain)** | `https://quickmap.lroc.im-ldi.com` *(migrated from `quickmap.lroc.asu.edu`, hosted by Intuitive Machines)* | `build_quickmap_url(lat, lon)` deep-link generator & integration across all 9 sites in `curated_sites.json` | ✅ Integrated |
| R-05 | **NASA Moon Trek** | `https://trek.nasa.gov/moon/` | `build_moontrek_url(lat, lon)` generator + open access to illumination/horizon analysis that requires a scientist/JPL account on Moon Trek | ✅ Integrated |
| R-06 | **NASA Scientific Visualization Studio (SVS)** | `https://svs.gsfc.nasa.gov/` (Moon Phase and Libration) | Visual and pedagogical reference for Educational Mode cards on lunar libration | ✅ Documented |
| R-07 | **Partner Agency: CSA (Canadian Space Agency)** | `https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/` (*Canadian Utility Rover*, *Canadarm3*, *Gateway*, *LEAP*) | `hardware_profiles` catalog in `curated_sites.json` & `HardwareProfile` contract to evaluate mast height impact (`1.5 m` CSA Utility Rover, `0.5 m` LEAP payload, `3.5 m` CLPS lander, `2.0 m` EVA) | ✅ Integrated |
| R-08 | **Apollo, CLPS, and Artemis III Site Coordinates** | NASA NSSDCA, LROC, and Artemis III region selection | 9 curated sites in `data/curated_sites.json` with citations and verification status | ✅ Integrated |

## 4. Changelog

| Date | Version | Change | Author |
|------|---------|--------|--------|
| 2026-11-14 | 0.1 | Creation of the RF-01..RF-07 / RT-01..RT-04 matrix | lead-architect-auditor |
| 2026-11-14 | 0.2 | Added official *Resources* tab (new QuickMap domain `quickmap.lroc.im-ldi.com`, Moon Trek value proposition, CSA/CLPS hardware profiles), offline hardening + analytical fallback, JPL Horizons scientific seal, and multi-device adaptive payloads | lead-architect-auditor |
