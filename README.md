# Lunar Landing Site Navigator — NASA Space Apps Challenge 2026

Interactive mission-planning and science outreach platform that translates **JPL lunar ephemerides (`de421.bsp` with physical libration `MOON_ME_DE421`)** and **real Lunar Orbiter Laser Altimeter (LOLA) topography** into comparable 2D/3D visualizations for evaluating landing sites, mast heights, solar power, and Direct-to-Earth (DTE) communications under airless lunar physics (`R = 1737.4 km`, `APPARENT = AIRLESS`).

> **Live Public Demo (no login required):** https://pamugo.github.io/lunar-landing-navigator/

---

## Highlights & Key Capabilities

| Capability | Details |
|---|---|
| **Live 3D Lunar Globe & Local DEM** | Photographic 8K LROC WAC texture + 16-bit LOLA bump/normal maps (`Three.js`), auto-transitioning into 96×96 local topographic terrain patches (`Terrain3D`). |
| **Side-by-Side Mission Comparator** | Compare up to **9 curated sites** (Apollo, CLPS, Artemis III, Chandrayaan-3, Chang'e 4) and **custom Moon coordinates** side by side across **5 CSA/NASA hardware mast heights** (`0.5 m` – `3.5 m`). |
| **Solar Power & DTE Link Budgets** | Sunlit %, longest continuous sunlit/dark streaks, AM0 PV yields (horizontal, tracking vertical, fixed + 360° optimal azimuth finder), ITU-R P.525-4 FSPL (S/X/Ka bands), light-time, and *Sunset* / *Earthset* countdowns. |
| **360° Horizon Dome & Timeline** | Polar Azimuth/Elevation dome (`HorizonDome`) and synchronized interactive ECharts elevation timeline (`ElevationTimeline`) up to `2053 UTC`. |
| **Dual Mode & Bilingual UI** | Instant switch between **Educational** & **Engineer** profiles, **EN / ES** languages, and **Dark / Light** themes. |
| **Offline Static + Client Engine** | Works both against the local FastAPI engine and standalone on GitHub Pages with pre-exported DE421/LOLA bundles plus real-time Cassini/Meeus browser computation. |

---

## Documentation Index

- **Challenge Specification & Official Resources:** [docs/CHALLENGE_SPEC.md](docs/CHALLENGE_SPEC.md)
- **Architecture & JSON Contracts (`v0.2.0`):** [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Physical & Mathematical Models:** [docs/MATH_MODELS.md](docs/MATH_MODELS.md)
- **Visual Identity ("NASA Mission Control Minimal"):** [docs/UI_DESIGN.md](docs/UI_DESIGN.md)
- **Scientific Validation Log (`<= 0.000009°` vs JPL Horizons):** [docs/VALIDATION_LOG.md](docs/VALIDATION_LOG.md)
- **Global Multi-Agent Rules:** [AGENTS.md](AGENTS.md)

---

## Prerequisites

- **Python:** `>= 3.12`
- **Node.js:** `>= 18` (includes `npm`)
- **Git**

---

## Initial Setup (Fresh Clone)

### 1. Backend Environment & SPICE Kernel Download

```bash
# Create and activate virtual environment
python -m venv .venv

# On Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# On Linux/macOS:
# source .venv/bin/activate

# Install backend dependencies
pip install -e "backend[dev]"

# Download and verify the 4 official NAIF SPICE kernels (de421.bsp, physical libration)
python scripts/fetch_kernels.py
```

### 2. Frontend Dependencies

```bash
cd frontend
npm install
cd ..
```

---

## Quick Local Start (FastAPI Backend + Vite Frontend)

### Option A — Unified Launcher (Single Command)

```bash
python scripts/start_dev.py
```

This simultaneously starts:
- **Web Frontend ("NASA Mission Control Minimal"):** `http://localhost:5173`
- **FastAPI Scientific Backend (Swagger/OpenAPI):** `http://localhost:8000/docs`
- **JPL Horizons Scientific Verification Seal:** `http://localhost:8000/api/v1/health`

### Option B — Two Separate Terminals

**Terminal 1 (FastAPI Backend):**
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 (Vite + React + Three.js + ECharts Frontend):**
```bash
cd frontend
npm run dev
```

---

## Scientific Verification & Test Suite

```powershell
# 1. Comprehensive verifier for environment, Python<->TS AST contracts, and airless guard
.\.venv\Scripts\python.exe scripts/verify_environment.py

# 2. Backend scientific & endpoint suite (including NASA JPL Horizons oracle)
.\.venv\Scripts\python.exe -m pytest backend/tests -v

# 3. Frontend typecheck, unit tests, and production build
$env:Path = "C:\Program Files\nodejs;$env:Path"
& "C:\Program Files\nodejs\npm.cmd" --prefix frontend run typecheck
& "C:\Program Files\nodejs\npm.cmd" --prefix frontend test
& "C:\Program Files\nodejs\npm.cmd" --prefix frontend run build
```

---

## Continuous GitHub Auto-Sync (`scripts/auto_sync_github.py`)

To automatically watch repository changes and run `git add -A` + `git commit` + `git push origin main` periodically:

```powershell
# Continuous watcher mode (checks and pushes changes every 60 seconds by default)
.\.venv\Scripts\python.exe scripts/auto_sync_github.py

# Customize interval (e.g., every 120 seconds)
.\.venv\Scripts\python.exe scripts/auto_sync_github.py --interval 120

# Run a single immediate sync and exit
.\.venv\Scripts\python.exe scripts/auto_sync_github.py --once
```

---

## AI Tools & Sources Used (Space Apps Transparency Disclosure)

In accordance with NASA Space Apps Challenge 2026 transparency guidelines, below are **only the AI systems/tools actually used** during the design, engineering, and verification of this repository:

| AI Tool / Platform | Role in Development | Repository Configuration & Artifacts |
|---|---|---|
| **Google Antigravity (AGY)** | Agentic IDE assistant used for full-stack TypeScript/Python implementation, Three.js/ECharts UI refinements, bilingual ES/EN localization, theme adaptation, static GitHub Pages pipeline setup, client-side Cassini/Meeus fallback engine, and test execution. | [AGENTS.md](AGENTS.md) · [.agents/skills.json](.agents/skills.json) · [skills/](skills/) |
| **Anthropic Claude Code** | Multi-agent coding assistant used under structured file-ownership boundaries (`lead-architect-auditor`, `astro-terrain-specialist`, `fullstack-visualizer`, `qa-verification-agent`) for specification traceability, physics service architecture, and verification workflows. | [CLAUDE.md](CLAUDE.md) · [.claude/agents/](.claude/agents/) · [.claude/commands/](.claude/commands/) |

### Strict Boundary on AI Usage
- **No AI-generated scientific data or planetary imagery:** All orbital/topocentric ephemerides come strictly from Skyfield running official NASA JPL SPICE kernels (`de421.bsp`, `moon_pa_de421_1900-2050.bpc`) verified to `<= 0.000009°` against JPL Horizons (`coord@301`), and all lunar surface maps/elevation meshes come from real NASA LROC WAC and LOLA data products.
- **Human & oracle verification:** All AI-assisted code changes were checked against `scripts/verify_environment.py`, backend physics oracles (`pytest` / `unittest`), TypeScript strict compilation (`tsc --noEmit`), and Vitest UI suites.
