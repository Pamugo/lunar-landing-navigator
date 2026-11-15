---

## Live Public Deployment (GitHub Pages)

- **Public App URL (no login / works in incognito):** `https://pamugo.github.io/lunar-landing-navigator/`
- **GitHub Repository:** `https://github.com/Pamugo/lunar-landing-navigator`

The static deployment is built automatically via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) (`VITE_STATIC_MODE=true` with `--base=/lunar-landing-navigator/`). Curated sites, 30-day DE421 ephemeris windows, 96×96 LOLA 3D patches, and hardware mast horizon profiles are pre-exported by [`scripts/export_static_site_data.py`](scripts/export_static_site_data.py) into `frontend/public/static-api/*.json`, while arbitrary custom coordinates, dates, and mast heights (`0.5 m`–`3.5 m`+) are computed in real time in the browser via [`frontend/src/services/staticFallback.ts`](frontend/src/services/staticFallback.ts) (when running locally, the FastAPI backend always takes priority).

---

## Data Sources, APIs & Scientific References

### 1. Official Challenge Resources Used

| Source | Purpose in This Application | Link |
|---|---|---|
| **NASA LROC QuickMap** | Official Intuitive Machines domain used for per-site and custom-coordinate deep links (`proj=17` south polar stereographic / `proj=16` global equirectangular) directly from every site card and info panel. | `https://quickmap.lroc.im-ldi.com` |
| **NASA Moon Trek** | Deep links per lunar coordinate (`IAU2000:30120` polar / `EPSG:104903` global) plus open, no-registration access to 360° horizon, solar illumination, and DTE visibility analysis. | `https://trek.nasa.gov/moon/` |
| **NASA/JPL Horizons System** | Authoritative scientific reference oracle (`CENTER='coord@301'`, `COMMAND='10'` Sun & `'399'` Earth, `APPARENT='AIRLESS'`) validating ephemeris accuracy (`<= 0.000009°`). | `https://ssd.jpl.nasa.gov/horizons/` |
| **CSA — Moon Exploration** | Source reference for Canadian hardware mast height profiles integrated into the comparator (*CSA LEAP Micro-Rover 0.5 m* and *CSA Canadian Utility Rover 1.5 m*). | `https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/` |

### 2. Additional APIs, SPICE Kernels, Topographic Archives & Textures

| Source | Purpose in This Application | Link |
|---|---|---|
| **JPL Horizons REST API** | Programmatic API queried by `scripts/generate_horizons_fixtures.py` to generate versioned airless ground-truth test fixtures and populate the UI Scientific Verification Seal. | `https://ssd.jpl.nasa.gov/api/horizons.api` |
| **NAIF / JPL Generic SPICE Kernels** | Central kernel archive powering the backend Skyfield ephemeris engine (`backend/app/services/ephemeris.py`) via `scripts/fetch_kernels.py`. | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/` |
| **JPL DE421 Ephemeris (`de421.bsp`)** | Planetary and lunar state vectors (1900–2050 UTC) for Sun and Earth apparent topocentric positions with light-time and aberration. | `https://ssd.jpl.nasa.gov/ftp/eph/planets/bsp/de421.bsp` |
| **Lunar Binary Libration Kernel (`moon_pa_de421_1900-2050.bpc`)** | High-precision physical lunar libration parameters used alongside DE421. | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/moon_pa_de421_1900-2050.bpc` |
| **Lunar Reference Frames Kernel (`moon_080317.tf`)** | Defines the selenographic `MOON_ME` (Mean Earth / Polar Axis) coordinate frame. | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_080317.tf` |
| **Planetary Constants Kernel (`pck00008.tpc`)** | Planetary constants and reference lunar radius (`R = 1737.4 km`). | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/a_old_versions/pck00008.tpc` |
| **PGDA — LOLA South Polar DEMs (NASA GSFC)** | South polar stereographic GeoTIFF elevation reference used in `backend/app/services/terrain.py` and `horizon.py` for 360° airless great-circle raycasting and local 3D meshes. | `https://pgda.gsfc.nasa.gov/` |
| **PDS Geosciences Node — LRO LOLA Archive** | Official Planetary Data System archive for Lunar Orbiter Laser Altimeter elevation products. | `https://pds-geosciences.wustl.edu/missions/lro/lola.htm` |
| **NASA Moon Trek WMTS (`LRO_WAC_Mosaic_Global_303ppd_v02`)** | Real LROC Wide Angle Camera global photographic mosaic tiles stitched by `scripts/fetch_moon_textures.py` into `moon_albedo_map.jpg` (8K) for the 3D Moon globe. | `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg` |
| **NASA Scientific Visualization Studio (SVS)** | Source for lunar phase/libration visual reference (Educational Mode) and raw LROC/LOLA imagery. | `https://svs.gsfc.nasa.gov/` |
| **NASA SVS #4720 — CGI Moon Kit** | Real polar LROC color (`lroc_color_poles_4k.tif`) and 16-bit global LOLA altimetry (`ldem_16_uint.tif`) used to build `moon_bump_lola.jpg` and tangent-space normal map `moon_normal_lola.jpg`. | `https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720` |

### 3. Literature Citations, Engineering Standards & Analytical Fallbacks

- **Curated Site Catalog (`data/curated_sites.json`):** Coordinates and mission context sourced from Bussey et al. (2010, *Icarus* — Shackleton Rim), Basilevsky et al. (2019 — Malapert Massif), Colaprete et al. (2010, *Science* — Cabeus Crater / LCROSS), NASA Artemis III candidate landing region documentation, NASA NSSDCA & LROC (Apollo 11, Apollo 17, Mons Mouton / CLPS IM-2 Athena), ISRO / LROC (Chandrayaan-3), and CNSA / LROC (Chang'e 4).
- **Direct-to-Earth Telecommunications (`backend/app/services/visibility.py` & `staticFallback.ts`):** Free-Space Path Loss (FSPL) per **ITU-R P.525-4** for S-band (`2.2 GHz`), X-band (`8.4 GHz`), and Ka-band (`32.0 GHz`), light propagation delay (`c = 299,792.458 km/s`), and libration span boxes.
- **Photovoltaic & Client-Side Analytical Ephemeris:** Space **AM0** irradiance (`1368.0 W/m²` inverse-square scaled by heliocentric distance) across horizontal, tracking vertical, and fixed vertical panels (`0°..359°` optimal azimuth search), paired with **Jean Meeus (Ch. 47/53) + Cassini `MOON_ME`** selenocentric analytical transformations and geometric sphere dip (`acos(R / (R + h))`, zero atmospheric refraction) in `frontend/src/services/staticFallback.ts`.
