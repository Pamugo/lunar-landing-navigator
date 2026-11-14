# AGENTS.md — Reglas globales del proyecto *Lunar Landing Site Navigator*

> Aplica a **todos** los agentes (Claude Code, Antigravity u otros). `CLAUDE.md` importa este archivo.
> Propietario: `lead-architect-auditor`. Reto: NASA Space Apps Challenge 2026 — *Lunar Landing Site Navigator*.

## 1. Fuentes de verdad (leer antes de actuar)

| Tema | Documento |
|------|-----------|
| Requisitos y trazabilidad (RF-01..07, RT-01..04) | `docs/CHALLENGE_SPEC.md` |
| Arquitectura y contratos JSON | `docs/ARCHITECTURE.md`, `backend/app/models/schemas.py` |
| Ecuaciones | `docs/MATH_MODELS.md` |
| Evidencia de verificación | `docs/VALIDATION_LOG.md` |
| Procedimientos especializados | `skills/*/SKILL.md` |

## 2. Convenciones de unidades y formatos (obligatorias)

| Magnitud | API / JSON / UI | Motor interno (`backend/app/services`) |
|----------|-----------------|------------------------------------------|
| Ángulos | **grados decimales** (`*_deg`) | **radianes** (convertir solo en la frontera API↔servicio) |
| Distancias | **metros** (`*_m`); kilómetros solo con sufijo `*_km` | metros |
| Tiempo | **UTC ISO-8601** con `Z` (`2027-01-01T00:00:00Z`) | `skyfield.Time` / `datetime` con `tzinfo=UTC` |
| Duraciones | segundos (`*_s`) u horas (`*_hours`) explícitas | segundos |
| Coordenadas | lat planetocéntrica [-90, 90]; lon **este-positiva** [-180, 180]; marco **MOON_ME** | ídem |
| Acimut | desde norte local, horario, [0, 360) | ídem (radianes) |
| Radio lunar | `R = 1737.4 km` = `1_737_400.0 m` (constante única, no redefinir) | ídem |

Reglas físicas no negociables:
- **Sin refracción atmosférica** en ninguna capa (la Luna no tiene atmósfera). Cualquier PR que introduzca un término de refracción se rechaza.
- Nunca usar hora local en cálculos; la conversión a hora local es solo cosmética en Modo Educativo.
- Las variables llevan el sufijo de unidad (`elevation_deg`, `distance_km`, `theta_rad`).

## 3. Propiedad exclusiva de directorios (File Ownership Boundaries)

Un agente **solo escribe** en los paths que posee. Para cambiar algo ajeno, emite una *Change Request* (CR) al propietario
(en el plan de `/plan-feature` o como comentario en el PR). Leer es libre para todos.

| Agente | Paths de escritura exclusiva |
|--------|------------------------------|
| `lead-architect-auditor` | `docs/` (excepto `docs/MATH_MODELS.md` y `docs/VALIDATION_LOG.md`), `backend/app/models/schemas.py`, `data/curated_sites.json`, `backend/pyproject.toml`, `skills/`, `.claude/`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore` |
| `astro-terrain-specialist` | `backend/app/services/`, `docs/MATH_MODELS.md`, `data/ephemeris/`, `data/lola_dem/` |
| `fullstack-visualizer` | `frontend/src/`, `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `backend/app/api/`, `backend/app/main.py` |
| `qa-verification-agent` | `backend/tests/`, `frontend/tests/`, `scripts/`, `docs/VALIDATION_LOG.md` |

Reglas de colisión:
1. Un archivo tiene **un único** propietario. Si no aparece en la tabla, pertenece a `lead-architect-auditor`.
2. El contrato (`schemas.py`) solo lo cambia el lead; `frontend/src/types/contracts.ts` lo actualiza el visualizer **en el mismo cambio** que el lead aprueba.
3. Los tests de oráculo los escribe **QA**, no el implementador (separación autor/verificador).
4. Ningún agente modifica un test para hacerlo pasar; si el oráculo es incorrecto, CR a QA con la derivación.

## 4. Protocolo de trabajo

```
Diseño → Contrato → Test de Oráculo → Implementación → Verificación
```

| Fase | Responsable | Entregable | Puerta de salida |
|------|-------------|-----------|------------------|
| 1. Diseño | lead + astro | Ecuación en `MATH_MODELS.md` / requisito trazado en `CHALLENGE_SPEC.md` | ID RF/RT asignado |
| 2. Contrato | lead (+ visualizer espejo TS) | Modelos Pydantic + `contracts.ts` | `verify_environment.py` en verde (paridad) |
| 3. Test de Oráculo | QA | Test analítico o fixture JPL Horizons, **en rojo o skip** | Test revisado por astro |
| 4. Implementación | astro (servicios) / visualizer (API+UI) | Código mínimo para pasar el oráculo | Tests en verde localmente |
| 5. Verificación | QA + lead | Entrada en `VALIDATION_LOG.md` + `/audit-challenge` | Estado RF/RT actualizado con evidencia |

## 5. Comandos estándar

| Acción | Comando (Windows: `python`; Linux/macOS: `python3`) |
|--------|------------------------------------------------------|
| Verificar entorno | `python scripts/verify_environment.py` |
| Tests de física | `python -m unittest discover -s backend/tests -t backend -v` (o `cd backend && python -m pytest`) |
| Backend dev | `cd backend && uvicorn app.main:app --reload` |
| Frontend dev | `cd frontend && npm install && npm run dev` |

Slash-commands (Claude Code: `.claude/commands/`; Antigravity: pedir "ejecuta el flujo de `.claude/commands/<nombre>.md`"):
`/verify-env`, `/verify-physics`, `/audit-challenge`, `/plan-feature`.

## 6. Skills y agentes

- Skills: `skills/lunar-ephemeris`, `skills/lola-topography-horizon`, `skills/mission-comparison-ux`, `skills/spaceapps-compliance`.
  Antigravity las descubre vía `.agents/skills.json`; en Claude Code, leer el `SKILL.md` correspondiente antes de trabajar en su área.
- Agentes: definiciones en `.claude/agents/*.md` (Claude Code las carga como subagentes; en Antigravity se usan como *system prompt* al definir subagentes).

## 7. Calidad mínima

- Python: tipado completo, `ruff`, docstrings con referencia `MATH_MODELS.md §x.y` en toda función física.
- TypeScript: `strict`, sin `any`, sin cálculos astronómicos en el cliente.
- Nada de llamadas de red en tests: las fixtures de JPL Horizons se generan con un script y se versionan.
- Datos de NASA siempre citados (producto, versión, URL) en `CHALLENGE_SPEC.md §5` y en la UI.
