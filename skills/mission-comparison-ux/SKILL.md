---
name: mission-comparison-ux
description: >-
  Use this skill when designing or implementing any frontend view of the Lunar Landing Site Navigator: NASA Mission
  Control Minimal look & feel, LunarGlobe3D interactive globe, side-by-side or swipeable site comparison, Sun/Earth
  horizon dome, elevation timelines, Sunset/Earthset countdowns, 3D LOLA terrain, and dual Engineer / Education modes.
---

# Mission Comparison UX — "NASA Mission Control Minimal" & Responsive Cross-Device

Requirements: RF-01..RF-07, RT-04 (`docs/CHALLENGE_SPEC.md`, `docs/UI_DESIGN.md`). Owner: `fullstack-visualizer` (`frontend/src/`).

## 1. Visual Identity "NASA Mission Control Minimal" (Mandatory)

Always consult `docs/UI_DESIGN.md` before creating or editing components:
- **Minimalist Deep-Space Dark Mode:** Main background `#0B0F19`, translucent panels `rgba(17, 24, 39, 0.75)` with `backdrop-filter: blur(12px)`, and subtle borders `1px solid rgba(255, 255, 255, 0.08)`.
- **NASA Institutional Palette:**
  - NASA Insignia Blue `#0B3D91` and interactive accent `#1E62D0`.
  - Pure white text `#FFFFFF` and light slate `#E2E8F0`.
  - Amber/gold `#F59E0B` / `#FBBF24` for solar illumination and power.
  - Electric cyan `#06B6D4` / `#38BDF8` for Direct-to-Earth (DTE) communications.
  - Emerald green `#10B981` for simultaneous Sun + DTE ("Golden Window").
  - NASA Crimson `#E03C31` for critical occultation alerts (imminent *Sunset* / *Earthset*).
- **Typography Hierarchy:**
  - Clean sans-serif (`Inter`, `Roboto`, `system-ui`) for general text, narrative, and menus.
  - Tabular monospace (`JetBrains Mono`, `Fira Code`, `monospace` with `tabular-nums`) reserved strictly for selenographic coordinates, angles, UTC timestamps, JPL Horizons errors, and countdowns.

## 2. Dual-Mode System in `HeaderHUD`

Prominent toggle in the top bar:
- **Educational / Outreach Mode (`edu`):** Narrative and visual focus. Highlights lunar mission history, explains why craters in permanent shadow (PSRs with water ice) and peaks of near-eternal light coexist at the South Pole, and translates metrics into everyday language.
- **Engineer / Scientific Mode (`eng`):** High-density analytical view. Shows telemetry with 3–4 decimal places, the **Interactive NASA JPL Horizons Scientific Verification Seal (`<= 0.000009°`)**, horizon source indicator (`lola_dem_cached` vs `spherical_analytical`), selectable vertical exaggeration, and direct links to **LROC QuickMap (`https://quickmap.lroc.im-ldi.com`)** and **NASA Moon Trek (`https://trek.nasa.gov/moon/`)**.

## 3. The 3D Lunar Globe (`LunarGlobe3D.tsx`) & Paired Views

1. **`LunarGlobe3D.tsx` (Shared Visual Core in both modes):**
   - Interactive 3D lunar sphere (Three.js / WebGL) with free rotation, quick focus on the South Pole or any curated site, and coordinate selection by clicking the surface.
   - In **Educational Mode (`edu`)**: visually shows **historical mission trajectories and pins** (Apollo 11, Apollo 17, CLPS targets, Artemis, Chang'e-4, Chandrayaan-3) with **interactive info cards on click**, along with global lunar terminator lighting and **permanently shadowed regions (PSRs / water ice)** rings.
   - In **Engineer Mode (`eng`)**: overlays real-time 3D geometric vectors toward Sun and Earth and pairs/switches with:
     - **`HorizonDome.tsx`**: 360° dome with LOLA skyline, Sun and Earth disks at true angular scale, and explicit vertical exaggeration selector (`×1`, `×5`, `×10`, `×20`).
     - **`Terrain3D.tsx`**: Local LOLA topographic mesh (`32×32` mobile, `48×48` tablet, `96×96` desktop) with real-time directional sunlight.
2. **Hardware Height Selector (`HardwareProfile`):**
   - Lets users toggle `observer_height_m` live among the 5 official profiles (`0.5 m` CSA LEAP, `1.5 m` **CSA Utility Rover** from the Canadian Space Agency, `2.0 m` Artemis EVA, `2.2 m` Artemis LTV, `3.5 m` CLPS Lander).

## 4. Responsive Cross-Device Layout (Desktop, Tablet & Mobile)

- **Desktop (`>= 1024px`):** Docked multi-panel workbench:
  - Left: 3D Globe / Viewer (`LunarGlobe3D` + switcher to 360° `HorizonDome` / local `Terrain3D`).
  - Center/Right: Side-by-side site and date comparator (`ComparisonGrid`) with `EventCountdown` timers (*Sunset* / *Earthset* + exact UTC instant).
  - Bottom: Interactive power and telemetry timeline (`ElevationTimeline` with Apache ECharts + `TimeControls` featuring playback and synchronized scrubber).
- **Mobile & Tablet (`< 1024px`):** Top/bottom touch tabs, swipeable comparison cards, ergonomic touch timeline scrubber, and `dpr = Math.min(window.devicePixelRatio, 1.5)` in WebGL.

## 5. Official Integration & Links (NASA Portals)

- Includes direct *deep-links* across all landing sites to the new official domain of **NASA LROC QuickMap** (`https://quickmap.lroc.im-ldi.com`) and **NASA Moon Trek** (`https://trek.nasa.gov/moon/`).

## 6. Accessibility (WCAG 2.2 AA)

- Contrast ≥ 4.5:1, keyboard navigation, descriptive `aria-label` attributes on controls and 3D/2D canvases, `prefers-reduced-motion` respected, and explicit units on every quantity.
