# UI_DESIGN — Visual Specification and UX Architecture ("NASA Mission Control Minimal")

> **Owner:** `lead-architect-auditor` · **Implementer:** `fullstack-visualizer` · **Revision:** Sprint 2 (`v0.2.0`)
> This document defines the mandatory visual identity of the *Lunar Landing Site Navigator* frontend and applies alongside [skills/mission-comparison-ux/SKILL.md](../skills/mission-comparison-ux/SKILL.md).

---

## 1. Look & Feel and Institutional Palette ("NASA Mission Control Minimal")

A **clean, focused, and restrained flight console** aesthetic inspired by modern telemetry software from NASA, Vercel, and Stripe. Prioritizes elegance, minimalism, and professional legibility while avoiding unnecessary *sci-fi* ornamentation.

| CSS Token | Value | Purpose |
|-----------|-------|---------|
| `--bg-space-deep` | `#0B0F19` | Primary deep-space background |
| `--bg-panel-glass` | `rgba(17, 24, 39, 0.75)` | Translucent panels with `backdrop-filter: blur(12px)` |
| `--bg-panel-elevated` | `rgba(30, 41, 59, 0.65)` | Interactive cards, table headers, and controls |
| `--border-subtle` | `1px solid rgba(255, 255, 255, 0.08)` | Subtle luminous divider borders |
| `--nasa-blue` | `#0B3D91` | Institutional NASA insignia blue (active backgrounds, badges) |
| `--nasa-blue-accent` | `#1E62D0` | Primary interactive accent, focus ring, and active controls |
| `--text-primary` | `#FFFFFF` | Headings, key metrics, and primary reading text |
| `--text-secondary` | `#E2E8F0` | Subtitles, descriptions, and labels |
| `--text-muted` | `#94A3B8` | Secondary units, metadata, and axes |
| `--solar-amber` | `#F59E0B` / `#FBBF24` | Solar illumination, Sun elevation, and photovoltaic power |
| `--dte-cyan` | `#06B6D4` / `#38BDF8` | Earth visibility and Direct-to-Earth (DTE) links |
| `--golden-window` | `#10B981` | Simultaneous Sun + DTE window ("Golden Operational Window") |
| `--nasa-crimson` | `#E03C31` | Critical occultation alerts (imminent *Sunset* / *Earthset* or permanent shadow) |

---

## 2. Typography and Data Hierarchy

- **General Text, Navigation, and Narrative (`--font-sans`)**:
  `'Inter', 'Roboto', system-ui, -apple-system, sans-serif` — crystal-clear readability across mobile screens, tablets, and desktop monitors.
- **Telemetry, Coordinates, and Countdowns (`--font-mono`)**:
  `'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace` with `font-variant-numeric: tabular-nums` — reserved strictly for selenographic coordinates (`lat_deg`, `lon_deg`), angles (`Az`, `El`, `clearance_deg`), UTC ISO-8601 timestamps, JPL Horizons validation errors (`≤ 0.000009°`), and countdowns.

---

## 3. Dual-Mode System (Top Switcher in `HeaderHUD.tsx`)

The top bar (`HeaderHUD`) includes a prominent instant toggle between two modes that consume **the exact same scientific data**:

### 3.1 Educational / Outreach Mode (`mode = "edu"`)
- **Purpose**: Narrative, 100% clean, visual-first experience designed for educators, students, and the general public, hiding engineering selectors, technical charts, and jargon.
- **Featured Content**:
  - Story of lunar missions (`description_edu`, historic milestones from Apollo 11, Apollo 17, CLPS targets like IM-2 Athena, Artemis III, and international missions like Chang'e-4 and Chandrayaan-3).
  - Intuitive explanations of polar extremes: why **Permanently Shadowed Regions (PSRs)** harbor ancient water ice (e.g., *Cabeus Crater*) just kilometers away from **Peaks of Near-Eternal Light** (e.g., *Shackleton Rim* and *Malapert Massif*).
  - One-click time navigation via **Quick Time Windows only** (4 key mission scenarios) and smooth lunar cycle animations, translating angles and metrics into natural language ("Sun skimming endlessly along the horizon", "Direct call home available", "Battery needed for X days of night").
- **Technical parameters hidden in Educational Mode (`mode === "edu"`)**:
  1. **NASA JPL Horizons Verified Accuracy Seal** (`HeaderHUD.tsx`): Hides the `JPL Horizons Verified` button and its RMS/maximum error popover.
  2. **Technical Exact UTC Date and Window Duration Selectors** (`HeaderHUD.tsx`): Hides the manual calendar input (`#mission-start-datetime`) and the window duration dropdown (`#header-window-days`), keeping **only Quick Time Window buttons** (`presets-cluster`) and interactive site selection.
  3. **3D Lunar Globe Geometric Vectors and Technical Legend** (`LunarGlobe3D.tsx`): Hides bottom HUD indicators (`● Sun Vector`, `● Earth Vector (DTE)`, and `● NASA LROC WAC + LOLA 16-bit Photo Mosaic`) as well as the 3D arrows (`sunArrow` and `earthArrow`) on the lunar sphere, leaving the Moon clean with its mission pins and PSR rings.
  4. **AM0 Solar Radiation / Photovoltaics, Advanced DTE Telecommunications, and Coordinate Search Modules** (`ComparisonGrid.tsx`): Hides solar flux blocks (`1368 W/m²`), optimal panel azimuth, and RF/Doppler link budget diagnostics.
  5. **Solar & DTE Timeline** (`App.tsx` / `ElevationTimeline.tsx`): Hides the bottom ECharts curve dock and the `3. Timeline` mobile tab.

### 3.2 Engineer / Scientific Mode (`mode = "eng"`)
- **Purpose**: Complete high-density analytical view for mission planners; **retains 100% of technical controls, layers, and indicators**:
- **Featured Content**:
  - **Interactive Seal and Error Table vs. JPL Horizons (`ScientificVerificationSeal` in `HeaderHUD.tsx`)**: Button and popover displaying validation errors against the NASA JPL Horizons oracle ($\le 0.000009^\circ$: `max_az_error_deg = 0.000009°`, `max_el_error_deg = 0.000009°`, `rms_el_error_deg = 0.000006°`, kernel `de421.bsp`, frame `MOON_ME_DE421`, `APPARENT=AIRLESS`).
  - **Complete Time Control (`HeaderHUD.tsx`)**: **Exact UTC date** picker (`datetime-local` from `2000` to `2053`), **window duration** selector (`7`, `14`, or `28` days), and **Mission Presets**.
  - **3D Lunar Globe Technical Layers (`LunarGlobe3D.tsx`)**: Active legend indicators and 3D geometric arrows for **`● Sun Vector`**, **`● Earth Vector (DTE)`**, and **`● NASA LROC WAC + LOLA 16-bit Photo Mosaic`**, plus free-form `MOON_ME` coordinate selection by clicking anywhere on the sphere.
  - **Technical ECharts Curves (`ElevationTimeline.tsx`)**: Interactive timeline of solar elevation, *Direct-to-Earth* (DTE) visibility, and topographic clearance at 3–4 decimal places (`Az`, `El`, `horizon_elevation_deg`, `clearance_deg`, `visible_fraction`).
  - **AM0 Solar Radiation & DTE Link Telemetry (`ComparisonGrid.tsx`)**: Solar flux ($1368\text{ W/m}^2$), optimal PV panel azimuth, DSN S/X/Ka-band link budget, *One-Way Light Time* (OWLT) delay, and topographic occultation.
  - **360° Horizon Profiles (`HorizonDome.tsx`)**: With selectable vertical exaggeration and explicit topographic source badge (`LOLA DEM Cached` vs `Spherical Analytical Fallback R=1737.4km`).

| UI Element / Control | Educational Mode (`edu`) | Engineer Mode (`eng`) |
|----------------------|:------------------------:|:---------------------:|
| `Verified Accuracy vs. NASA JPL Horizons` seal | Hidden | **Visible & interactive** |
| Exact UTC date picker (`datetime-local`) | Hidden | **Visible & active** |
| Window duration selector (`7 / 14 / 28 days`) | Hidden | **Visible & active** |
| Quick Time Window buttons (4 key scenarios) | **Visible & active** | **Visible & active** |
| `● Sun Vector`, `● Earth Vector (DTE)`, `● Photo Mosaic...` + 3D arrows | Hidden | **Visible in HUD & 3D** |
| AM0 Solar Radiation & DTE Telecom module | Hidden | **Visible** |
| Bottom `Solar & DTE Visibility Timeline` chart (`ElevationTimeline`) | Hidden | **Visible & interactive** |
| Bilingual Language Switcher (`ES` \| `EN` in `HeaderHUD`) | **Visible & active (live hot-swap)** | **Visible & active (live hot-swap)** |

### 3.3 Bilingual Support (`ES` / `EN` Switcher in `HeaderHUD.tsx`)
- **Location & Styling**: Positioned cleanly in `HeaderHUD.tsx` directly alongside the `.mode-toggle` control using `.lang-toggle` / `.lang-btn` ("NASA Mission Control Minimal" translucent container `rgba(17, 24, 39, 0.75)`, `1px solid rgba(255, 255, 255, 0.08)` border, NASA Blue `#0B3D91` → `#1E62D0` active gradient).
- **Typed Architecture (`frontend/src/i18n/`)**:
  - `translations.ts`: Complete strictly typed bilingual dictionaries (`TRANSLATIONS_EN`, `TRANSLATIONS_ES`), curated site historical/technical descriptions (`SITE_TRANSLATIONS`), and hardware profile descriptions (`HARDWARE_TRANSLATIONS`).
  - `LanguageContext.tsx`: React Context (`LanguageProvider`, `useLanguage()`, `useTranslation()`) exposing `{ lang, setLang, toggleLang, t }`, persisting user selection in `localStorage` (`lunar_nav_lang`), and syncing `document.documentElement.lang` and `document.title`.
- **Zero-Reload Hot-Swap & Mode Isolation**: Toggling between Spanish (`ES`) and English (`EN`) translates 100% of header controls, presets, 3D globe/terrain/dome overlays, mission history & PSR cards, comparator KPIs/exports, and ECharts tooltips live in-place without reloading the page or resetting active sites, UTC epoch, or the Three.js camera state. Educational Mode hiding rules remain strictly enforced in both languages.

---

## 4. 3D Lunar Globe (`LunarGlobe3D.tsx` — Shared Visual Core)

- **Dual Presence**: The interactive 3D globe (WebGL / Three.js) is shown **in both educational and scientific modes** as the central unifying canvas of the application.
- **Mode-Dependent Layers**:
  - *In Educational Mode (`edu`)*: Highlights **orbital/approach trajectories and historical mission markers** (Apollo 11, Apollo 17, CLPS targets, Artemis, Chang'e-4, Chandrayaan-3) with **interactive info cards on click**, along with global lunar terminator lighting and **permanently shadowed region (PSR / water ice)** rings.
  - *In Scientific Mode (`eng`)*: Pairs and switches seamlessly with local real topographic relief (`Terrain3D.tsx` based on LOLA DEM), the 360° horizon dome (`HorizonDome.tsx`), and real-time 3D geometric vectors toward the Sun (`#F59E0B`) and Earth (`#06B6D4`).
  - *Configurable Hardware Support*: Interactive `HardwareProfile` height profiles (`0.5 m` CSA LEAP, `1.5 m` **CSA Utility Rover**, `2.0 m` Artemis EVA, `2.2 m` Artemis LTV, `3.5 m` NASA CLPS Lander) that recalculate instrument height (`observer_height_m`) live in the comparator.

---

## 5. Cross-Device Experience (Responsive Cross-Device)

### 5.1 Desktop (`>= 1024px` — Docked Multi-Panel Interface)
- **Top Bar (`HeaderHUD`)**: NASA Mission Control identity, JPL Horizons Seal ($\le 0.000009^\circ$), prominent **Educational Mode / Engineer Mode** toggle, and bilingual **`ES | EN`** interface language switcher.
- **Left (Globe / 3D Viewer)**: `LunarGlobe3D.tsx` paired with `HorizonDome.tsx` (360°) and `Terrain3D.tsx` (LOLA DEM relief).
- **Center / Right (`ComparisonGrid`)**: Side-by-side site and date comparator with key metrics (% sunlit, % DTE, % Golden Sun+DTE Window, longest night) and `EventCountdown` timers (*Sunset* / *Earthset* with exact UTC time).
- **Bottom (`ElevationTimeline` + `TimeControls`)**: Interactive solar illumination and DTE visibility timeline (Apache ECharts) with synchronized scrubber and playback animation.

### 5.2 Mobile & Tablet (`< 1024px` — Fluid Touch Interface)
- Navigation based on **touch tabs** (`3D Globe & Horizon` · `Site Comparator` · `Timeline`) and **swipeable cards**.
- Adapted timeline scrubbers for smooth, frictionless touch exploration.
- Automatic WebGL pixel density scaling (`dpr = Math.min(window.devicePixelRatio, 1.5)`) and adaptive `mobile` (`32×32`) or `tablet` (`48×48`) terrain meshes.

---

## 6. Official Integration & Links (NASA Portals)

- All curated sites and custom coordinates include direct *deep-links* in the interface to:
  1. **NASA LROC QuickMap** on its official Intuitive Machines domain: `https://quickmap.lroc.im-ldi.com` (`quickmap.lroc.asu.edu` deprecated).
  2. **NASA Moon Trek**: `https://trek.nasa.gov/moon/`.
- **Open Value Proposition**: Whereas advanced illumination and slope-analysis tools in NASA Moon Trek require restricted scientist/JPL accounts, *Lunar Landing Site Navigator* provides 360° horizon, solar illumination, and DTE visibility analysis instantly and openly.
