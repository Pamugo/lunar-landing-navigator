# Lunar Landing Site Navigator — NASA Space Apps Challenge 2026

Aplicación interactiva de planificación de misiones y divulgación científica que traduce **efemérides lunares JPL (`de421.bsp` con libración física `MOON_ME_DE421`)** y **topografía real del Lunar Orbiter Laser Altimeter (LOLA)** en visualizaciones comparables para evaluar sitios y fechas de alunizaje en el Polo Sur de la Luna, sin atmósfera (`R = 1737.4 km`, `APPARENT = AIRLESS`).

- **Especificación del Reto y Recursos Oficiales**: [docs/CHALLENGE_SPEC.md](docs/CHALLENGE_SPEC.md)
- **Arquitectura y Contratos JSON (`v0.2.0`)**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Modelos Físico-Matemáticos**: [docs/MATH_MODELS.md](docs/MATH_MODELS.md)
- **Identidad Visual ("NASA Mission Control Minimal")**: [docs/UI_DESIGN.md](docs/UI_DESIGN.md)
- **Registro de Validación Científica (`<= 0.000009°` vs JPL Horizons)**: [docs/VALIDATION_LOG.md](docs/VALIDATION_LOG.md)
- **Reglas Globales Multi-Agente**: [AGENTS.md](AGENTS.md)

---

## Requisitos Previos

- **Python**: `>= 3.12`
- **Node.js**: `>= 18` (incluye `npm`)
- **Git**

---

## Instalación Inicial (Primer Clonado)

### 1. Entorno Backend y Descarga de Kernels SPICE
```bash
# Crear y activar entorno virtual
python -m venv .venv

# En Windows PowerShell:
.\.venv\Scripts\Activate.ps1
# En Linux/macOS:
# source .venv/bin/activate

# Instalar dependencias del backend
pip install -e "backend[dev]"

# Descargar y verificar los 4 kernels NAIF SPICE oficiales (de421.bsp, libración física)
python scripts/fetch_kernels.py
```

### 2. Dependencias del Frontend
```bash
cd frontend
npm install
cd ..
```

---

## Arranque Rápido en Local (Backend FastAPI + Frontend Vite)

### Opción A — Lanzador unificado (1 solo comando)
```bash
python scripts/start_dev.py
```
Esto levanta simultáneamente:
- **Frontend Web ("NASA Mission Control Minimal")**: `http://localhost:5173`
- **Backend Científico FastAPI (Swagger/OpenAPI)**: `http://localhost:8000/docs`
- **Sello de Verificación Científica JPL Horizons**: `http://localhost:8000/api/v1/health`

### Opción B — En dos terminales separadas
**Terminal 1 (Backend FastAPI):**
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 (Frontend Vite + React + Three.js + ECharts):**
```bash
cd frontend
npm run dev
```

---

## Verificación Científica y Suite de Tests

```powershell
# 1. Verificador integral de entorno, contratos AST Python<->TS y guardia sin refracción
.\.venv\Scripts\python.exe scripts/verify_environment.py

# 2. Suite científica y de endpoints backend (49 tests, incluyendo oráculo NASA JPL Horizons)
.\.venv\Scripts\python.exe -m pytest backend/tests -v

# 3. Typecheck, tests unitarios y build de producción del frontend
$env:Path = "C:\Program Files\nodejs;$env:Path"
& "C:\Program Files\nodejs\npm.cmd" --prefix frontend run typecheck
& "C:\Program Files\nodejs\npm.cmd" --prefix frontend test
& "C:\Program Files\nodejs\npm.cmd" --prefix frontend run build
```

---

## Auto-Sincronización Continua con GitHub (`scripts/auto_sync_github.py`)

Para vigilar automáticamente los cambios en el repositorio y ejecutar `git add -A` + `git commit` + `git push origin main` cada pocos minutos:

```powershell
# Modo watcher continuo (revisa y sube cambios cada 60 segundos por defecto)
.\.venv\Scripts\python.exe scripts/auto_sync_github.py

# Personalizar el intervalo (ej. cada 120 segundos)
.\.venv\Scripts\python.exe scripts/auto_sync_github.py --interval 120

# Ejecutar una única sincronización inmediata y salir
.\.venv\Scripts\python.exe scripts/auto_sync_github.py --once
```
