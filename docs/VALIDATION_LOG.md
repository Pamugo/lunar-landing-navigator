# VALIDATION_LOG — Registro de Verificación Científica y de Infraestructura

> **Propietario:** `qa-verification-agent` · **Revisión:** `lead-architect-auditor`
> Toda ejecución de `/verify-env`, `/verify-physics` o validación contra JPL Horizons / LOLA debe registrarse aquí con evidencia reproducible.

---

## Plantilla de Entrada (copiar en cada nueva verificación)

```markdown
### [VAL-YYYYMMDD-NN] <Título corto de la verificación>
- **Fecha UTC:** YYYY-MM-DDTHH:MM:SSZ
- **Fase / Sprint:** Fase X / Sprint Y
- **Agente ejecutor:** `qa-verification-agent`
- **Requisitos cubiertos:** RF-xx, RT-xx
- **Comando ejecutado:**
  ```bash
  <comando exacto>
  ```
- **Resultado:** X pasados · Y omitidos · Z fallidos (Exit code: 0)
- **Tolerancias verificadas:**
  - <magnitud>: error máx = <valor> (umbral = <tolerancia>, ref. `docs/MATH_MODELS.md §x.y`)
- **Observaciones / Acciones abiertas:**
  - ...
```

---

## Historial de Verificaciones

### [VAL-20261114-01] Bootstrap de Infraestructura Multi-Agente y Oráculos Geométricos (Fase 0)
- **Fecha UTC:** 2026-11-14T09:00:00Z
- **Fase / Sprint:** Fase 0 — Inicialización e Infraestructura
- **Agente ejecutor:** `qa-verification-agent` / `lead-architect-auditor`
- **Requisitos cubiertos:** RF-01 (catálogo base), RF-03 (contrato temporal), RF-04 (oráculo de eventos), RT-02 (oráculo de horizonte y proyección polar), RT-03 (esfera lunar sin atmósfera R = 1737.4 km), RT-04 (paridad de contratos Python/TS)
- **Comandos ejecutados:**
  ```bash
  python scripts/verify_environment.py
  python -m unittest discover -s backend/tests -t backend -v
  ```
- **Resultado:**
  - `verify_environment.py`: **49 PASS · 10 WARN · 0 FAIL** (Exit code `0`; los `WARN` corresponden exclusivamente a paquetes de terceros de Sprint 1/2 aún no instalados en el entorno global de la máquina).
  - `unittest discover`: **30 ejecutados · 27 en verde · 3 omitidos (`skip` de efemérides para Sprint 1) · 0 fallidos** (`0.040 s`).
- **Tolerancias verificadas (`backend/tests/test_horizon_geometry.py` y `test_curated_sites.py`):**
  - Radio lunar de referencia único: `R = 1_737_400.0 m` (`MATH_MODELS.md §0`).
  - Equivalencia entre fórmula trigonométrica `tan(gamma) = (r_i cos(theta) - r_0) / (r_i sin(theta))`, forma numéricamente estable y geometría vectorial 3D ENU en 1000–2000 casos aleatorios: `|Δγ| < 1e-8 rad` (`MATH_MODELS.md §1.4, §2.1`).
  - Esfera lisa con observador en superficie (`h0 = hi = 0`): `γ = -θ/2` con `|Δγ| < 1e-12 rad` (`MATH_MODELS.md §2.2.1`).
  - Depresión del horizonte sin refracción (`h0 = 2 m`, `R = 1737.4 km`): `δ = arccos(R/(R+h0)) = 0.086937°`, distancia al punto de tangencia `d_hor = 2636.2 m`, coincidencia entre rayo numérico y fórmula cerrada `< 1e-7 rad` (`MATH_MODELS.md §2.2.2`).
  - Alcance máximo de línea de vista a un macizo de `H = 5000 m` desde `h0 = 2 m`: `134.29 km` exacto esférico (`134.45 km` en aproximación parabólica $\sqrt{2RH}$, justifica alcance por defecto `L = 150 km`, `MATH_MODELS.md §2.2.4`).
  - Ocultación por obstáculo sintético conocido (muro de `1000 m` a `20 km` en acimut `80°–100°`): elevación del horizonte `2.53°` vs `-0.0869°` en acimut libre (`270°`), transiciones `occulted -> partial -> visible` y fracción de disco visible (`f = 0.5` en `e = γ_h`, `f + f_mirror = 1` con `< 1e-12`).
  - Ida y vuelta de proyección estereográfica polar sur en los sitios polares curados: `|Δlat|, |Δlon| < 1e-9°`.
- **Observaciones / Acciones abiertas para Sprint 1:**
  - Crear entorno virtual `.venv` e instalar `backend/pyproject.toml` (`pip install -e "backend[dev]"`).
  - Ejecutar script de descarga reproducible de kernels SPICE (`de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`, `pck00008.tpc`) y generar fixtures de JPL Horizons para activar los 3 tests en `test_ephemeris_oracle.py`.


---

### [VAL-20261114-02] Validación del Motor Científico (Efemérides Skyfield MOON_ME vs JPL Horizons, Raycasting LOLA 360° y Visibilidad)
- **Fecha UTC:** 2026-11-14T09:58:00Z
- **Fase / Sprint:** Sprint 1 — Implementación del Motor de Efemérides y Topografía LOLA (Tareas 1.1 a 1.6)
- **Agente ejecutor:** `qa-verification-agent` / `astro-terrain-specialist`
- **Requisitos cubiertos:** `RF-01`, `RF-02`, `RF-03`, `RF-04`, `RF-05`, `RF-06` (backend payloads), `RT-01`, `RT-02`, `RT-03`, `RT-04`
- **Kernels SPICE descargados y verificados (`data/ephemeris/manifest.json`):**
  - `de421.bsp` (16 788 480 B) · SHA-256: `a20a7139da04cbc462454634918e9a9ca69127044e2cc9d4f9c16e238d2deedc`
  - `moon_pa_de421_1900-2050.bpc` (1 770 496 B) · SHA-256: `656f90616403d75a75f0cd6c8830fc5b44f8cb4facb5ccb8915e752b397520cf`
  - `moon_080317.tf` (21 437 B) · SHA-256: `78732477b96f9863e7b0d65bcee3c22b8707ca5ed0db56d1173319cb2e8c7993`
  - `pck00008.tpc` (111 586 B) · SHA-256: `ca07df56e9f1bca85a4c6748b618a46c0bf8e081f96f81e324896f2fdc54ea27`
- **Comandos ejecutados:**
  ```bash
  .\.venv\Scripts\python.exe scripts/fetch_kernels.py
  .\.venv\Scripts\python.exe scripts/generate_horizons_fixtures.py
  .\.venv\Scripts\python.exe scripts/verify_environment.py
  .\.venv\Scripts\python.exe -m pytest backend/tests -v
  .\.venv\Scripts\ruff.exe check backend scripts
  ```
- **Resultado:**
  - `verify_environment.py`: **60 PASS · 2 WARN (`node`/`npm` para Sprint 2) · 0 FAIL** (Exit code `0`).
  - `pytest backend/tests -v`: **43 pasados · 0 omitidos · 0 fallidos** en **`2.15 s`**.
  - `ruff check backend scripts`: **`All checks passed!` (0 errores)**.
- **Tolerancias verificadas frente a NASA JPL Horizons (`backend/tests/fixtures/horizons/horizons_reference.json`):**
  - Oráculo: API oficial `https://ssd.jpl.nasa.gov/api/horizons.api` (`CENTER='coord@301'`, `COMMAND='10'` Sol y `'399'` Tierra, `APPARENT='AIRLESS'`).
  - Sitios verificados (5): *Shackleton Rim*, *Malapert Massif*, *Mons Mouton (IM-2 Athena)*, *Apollo 11*, *Chang'e 4 (cara oculta)* — 90 muestras totales.
  - **Error máximo en elevación (`max_el_error_deg`):** **`0.000009°` (`9e-6°` ≈ `0.032 arcsec`)** — cumple con más de tres órdenes de magnitud de margen el objetivo `RT-01` (`≤ 0.01°`).
  - **Error máximo en acimut ponderado (`max_az_error_deg`):** **`0.000009°` (`9e-6°`)** — cumple `RT-01` (`≤ 0.01°`).
  - **Error RMS en elevación y acimut:** **`0.000006°` (`6e-6°`)**.
- **Verificaciones de topografía LOLA, fiabilidad offline y multi-dispositivo:**
  - **Caché offline `.npz`:** 20 perfiles precalculados (5 sitios polares × 4 alturas de hardware: `0.5 m` CSA LEAP, `1.5 m` CSA Canadian Utility Rover, `2.0 m` Artemis EVA, `3.5 m` NASA CLPS Lander) en `data/lola_dem/cache/`.
  - **Monotonía de altura de hardware (`RF-01`):** verificado que elevar el mástil de `0.5 m` (CSA LEAP) $\to$ `1.5 m` (CSA Canadian Utility Rover) $\to$ `3.5 m` (CLPS Lander) reduce monotónicamente el ángulo de bloqueo del horizonte.
  - **Fallback analítico seguro (`spherical_analytical`):** verificado que cualquier coordenada fuera de la cobertura del GeoTIFF polar (ej. latitudes ecuatoriales o cara oculta) degrada sin excepción a `HorizonSource.SPHERICAL_ANALYTICAL` con depresión exacta $-\arccos(R/(R+h))$.
  - **Mallas 3D adaptativas (`RF-06`):** verificadas resoluciones `mobile` (`32×32`), `tablet` (`48×48`) y `desktop` (`96×96`).
  - **Presupuesto de rendimiento (`RT-04`):** serie temporal de 30 días a paso de 1 h (`721` instantes, Sol + Tierra + eventos Brent) calculada en `< 0.25 s` (umbral `< 2.0 s`).

---

### [VAL-20261114-03] Integración Fullstack Sprint 2: API REST `/api/v1`, UI "NASA Mission Control Minimal" y Auditoría Final
- **Fecha UTC:** 2026-11-14T10:25:00Z
- **Fase / Sprint:** Sprint 2 — API REST, Frontend React/Three.js/ECharts y Auditoría NASA Space Apps (Tareas 2.1 a 2.5)
- **Agente ejecutor:** `qa-verification-agent` / `fullstack-visualizer` / `lead-architect-auditor`
- **Requisitos cubiertos:** `RF-01`, `RF-02`, `RF-03`, `RF-04`, `RF-05`, `RF-06`, `RF-07`, `RT-01`, `RT-02`, `RT-03`, `RT-04`
- **Comandos ejecutados:**
  ```powershell
  .\.venv\Scripts\python.exe scripts/verify_environment.py
  .\.venv\Scripts\python.exe -m pytest backend/tests -v
  .\.venv\Scripts\ruff.exe check backend scripts
  $env:Path = "C:\Program Files\nodejs;$env:Path"
  & "C:\Program Files\nodejs\npm.cmd" --prefix frontend run typecheck
  & "C:\Program Files\nodejs\npm.cmd" --prefix frontend test
  & "C:\Program Files\nodejs\npm.cmd" --prefix frontend run build
  ```
- **Resultado:**
  - `verify_environment.py`: **62 PASS · 0 WARN · 0 FAIL** (Exit code `0`).
  - `pytest backend/tests -v`: **49 pasados (43 física/servicios + 6 endpoints API `/api/v1`) · 0 omitidos · 0 fallidos** en **`2.71 s`**.
  - `ruff check backend scripts`: **`All checks passed!` (0 errores)**.
  - `npm --prefix frontend run typecheck` (`tsc --noEmit`): **0 errores TypeScript (`strict: true`, sin `any`)**.
  - `npm --prefix frontend test` (`vitest run`): **4 tests pasados en `frontend/tests/contracts.test.ts`** (`1.64 s`).
  - `npm --prefix frontend run build` (`vite build`): **Bundle de producción compilado limpiamente (`595` módulos transformados en `8.90 s`)**.
- **Verificaciones clave de Sprint 2:**
  - **API REST (`/api/v1`):** Endpoints `/health`, `/sites`, `/hardware-profiles`, `/horizon`, `/terrain-patch`, `/visibility` y `/compare` verificados en `backend/tests/test_api_endpoints.py`, incluyendo contrato OpenAPI, degradación `spherical_analytical` y sello científico contra JPL Horizons.
  - **Identidad Visual "NASA Mission Control Minimal" (`docs/UI_DESIGN.md`):** Paneles glassmórficos (`#0B0F19`, `rgba(17, 24, 39, 0.75)`), paleta NASA Blue (`#0B3D91` / `#1E62D0`), Ámbar Solar (`#F59E0B`), Cian DTE (`#06B6D4`), Verde Esmeralda de Ventana Dorada (`#10B981`) y tipografía `tabular-nums` para coordenadas, ángulos y cuentas atrás.
  - **Núcleo 3D y Vistas Múltiples (`RF-06`):** `LunarGlobe3D.tsx` (Three.js con vectores solares/DTE y raycasting clicable), `HorizonDome.tsx` (360° con exageración vertical `×1`, `×5`, `×10`, `×20`), `Terrain3D.tsx` (malla LOLA 3D con mástil de hardware), `PolarMap2D.tsx`, `ComparisonGrid.tsx` y `ElevationTimeline.tsx` (Apache ECharts con sombreado de ventanas conjuntas Sol + Tierra y scrubber sincronizado).
  - **Doble Modo (`RF-07`):** Conmutador instantáneo en `HeaderHUD.tsx` entre *Modo Educativo / Divulgativo* y *Modo Ingeniero / Científico* sin recarga de red, junto con sello interactivo de verificación JPL Horizons (`≤ 0.000009°`) y enlaces profundos oficiales a LROC QuickMap (`https://quickmap.lroc.im-ldi.com`) y NASA Moon Trek (`https://trek.nasa.gov/moon/`).
