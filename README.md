# Lunar Landing Site Navigator — NASA Space Apps Challenge 2026

Interactive mission-planning and science outreach application that translates **JPL lunar ephemerides (`de421.bsp` with physical libration `MOON_ME_DE421`)** and **real Lunar Orbiter Laser Altimeter (LOLA) topography** into comparable visualizations for evaluating landing sites and dates at the Moon's South Pole, airless (`R = 1737.4 km`, `APPARENT = AIRLESS`).

- **Challenge Specification & Official Resources**: [docs/CHALLENGE_SPEC.md](docs/CHALLENGE_SPEC.md)
- **Architecture & JSON Contracts (`v0.2.0`)**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Physical & Mathematical Models**: [docs/MATH_MODELS.md](docs/MATH_MODELS.md)
- **Visual Identity ("NASA Mission Control Minimal")**: [docs/UI_DESIGN.md](docs/UI_DESIGN.md)
- **Scientific Validation Log (`<= 0.000009°` vs JPL Horizons)**: [docs/VALIDATION_LOG.md](docs/VALIDATION_LOG.md)
- **Global Multi-Agent Rules**: [AGENTS.md](AGENTS.md)

---

## Prerequisites

- **Python**: `>= 3.12`
- **Node.js**: `>= 18` (includes `npm`)
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

### Option A — Unified launcher (single command)
```bash
python scripts/start_dev.py
```
This simultaneously starts:
- **Web Frontend ("NASA Mission Control Minimal")**: `http://localhost:5173`
- **FastAPI Scientific Backend (Swagger/OpenAPI)**: `http://localhost:8000/docs`
- **JPL Horizons Scientific Verification Seal**: `http://localhost:8000/api/v1/health`

### Option B — In two separate terminals
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
