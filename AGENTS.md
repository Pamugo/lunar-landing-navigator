# AGENTS.md — Global Rules for *Lunar Landing Site Navigator*

> Applies to **all** agents (Claude Code, Antigravity, or others). `CLAUDE.md` imports this file.
> Owner: `lead-architect-auditor`. Challenge: NASA Space Apps Challenge 2026 — *Lunar Landing Site Navigator*.

## 1. Sources of Truth (read before acting)

| Topic | Document |
|-------|----------|
| Requirements & traceability (RF-01..07, RT-01..04) | `docs/CHALLENGE_SPEC.md` |
| Architecture & JSON contracts | `docs/ARCHITECTURE.md`, `backend/app/models/schemas.py` |
| Equations | `docs/MATH_MODELS.md` |
| Verification evidence | `docs/VALIDATION_LOG.md` |
| Specialized procedures | `skills/*/SKILL.md` |

## 2. Unit and Formatting Conventions (mandatory)

| Quantity | API / JSON / UI | Internal Engine (`backend/app/services`) |
|----------|-----------------|------------------------------------------|
| Angles | **decimal degrees** (`*_deg`) | **radians** (convert only at the API↔service boundary) |
| Distances | **meters** (`*_m`); kilometers only with `*_km` suffix | meters |
| Time | **UTC ISO-8601** with `Z` (`2027-01-01T00:00:00Z`) | `skyfield.Time` / `datetime` with `tzinfo=UTC` |
| Durations | explicit seconds (`*_s`) or hours (`*_hours`) | seconds |
| Coordinates | planetocentric lat [-90, 90]; **east-positive** lon [-180, 180]; **MOON_ME** frame | same |
| Azimuth | from local north, clockwise, [0, 360) | same (radians) |
| Lunar radius | `R = 1737.4 km` = `1_737_400.0 m` (single constant, do not redefine) | same |

Non-negotiable physical rules:
- **Zero atmospheric refraction** in any layer (the Moon has no atmosphere). Any PR introducing a refraction term is rejected.
- Never use local time in calculations; local time conversion is purely cosmetic in Educational Mode.
- Variables carry a unit suffix (`elevation_deg`, `distance_km`, `theta_rad`).

## 3. Exclusive Directory Ownership (File Ownership Boundaries)

An agent **only writes** within paths it owns. To change someone else's files, issue a *Change Request* (CR) to the owner
(in the `/plan-feature` plan or as a PR comment). Reading is open to all.

| Agent | Exclusive write paths |
|-------|-----------------------|
| `lead-architect-auditor` | `docs/` (except `docs/MATH_MODELS.md` and `docs/VALIDATION_LOG.md`), `backend/app/models/schemas.py`, `data/curated_sites.json`, `backend/pyproject.toml`, `skills/`, `.claude/`, `.agents/`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `.gitignore` |
| `astro-terrain-specialist` | `backend/app/services/`, `docs/MATH_MODELS.md`, `data/ephemeris/`, `data/lola_dem/` |
| `fullstack-visualizer` | `frontend/src/`, `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `backend/app/api/`, `backend/app/main.py` |
| `qa-verification-agent` | `backend/tests/`, `frontend/tests/`, `scripts/`, `docs/VALIDATION_LOG.md` |

Collision rules:
1. Every file has **a single** owner. If not listed in the table, it belongs to `lead-architect-auditor`.
2. The contract (`schemas.py`) is changed only by the lead; `frontend/src/types/contracts.ts` is updated by the visualizer **in the same change** approved by the lead.
3. Oracle tests are written by **QA**, not the implementer (author/verifier separation).
4. No agent modifies a test just to make it pass; if the oracle is wrong, submit a CR to QA with the derivation.

## 4. Workflow Protocol

```
Design → Contract → Oracle Test → Implementation → Verification
```

| Phase | Owner | Deliverable | Exit Gate |
|-------|-------|-------------|-----------|
| 1. Design | lead + astro | Equation in `MATH_MODELS.md` / requirement traced in `CHALLENGE_SPEC.md` | RF/RT ID assigned |
| 2. Contract | lead (+ visualizer TS mirror) | Pydantic models + `contracts.ts` | `verify_environment.py` green (parity) |
| 3. Oracle Test | QA | Analytical test or JPL Horizons fixture, **red or skipped** | Test reviewed by astro |
| 4. Implementation | astro (services) / visualizer (API+UI) | Minimal code to pass the oracle | Tests green locally |
| 5. Verification | QA + lead | Entry in `VALIDATION_LOG.md` + `/audit-challenge` | RF/RT status updated with evidence |

## 5. Standard Commands

| Action | Command (Windows: `python`; Linux/macOS: `python3`) |
|--------|------------------------------------------------------|
| Verify environment | `python scripts/verify_environment.py` |
| Physics tests | `python -m unittest discover -s backend/tests -t backend -v` (or `cd backend && python -m pytest`) |
| Backend dev | `cd backend && uvicorn app.main:app --reload` |
| Frontend dev | `cd frontend && npm install && npm run dev` |

Slash commands (Claude Code: `.claude/commands/`; Antigravity: request "run the workflow in `.claude/commands/<name>.md`"):
`/verify-env`, `/verify-physics`, `/audit-challenge`, `/plan-feature`.

## 6. Skills and Agents

- Skills: `skills/lunar-ephemeris`, `skills/lola-topography-horizon`, `skills/mission-comparison-ux`, `skills/spaceapps-compliance`.
  Antigravity discovers them via `.agents/skills.json`; in Claude Code, read the corresponding `SKILL.md` before working in its domain.
- Agents: definitions in `.claude/agents/*.md` (Claude Code loads them as subagents; in Antigravity they serve as *system prompts* when defining subagents).

## 7. Minimum Quality

- Python: full type annotations, `ruff`, docstrings referencing `MATH_MODELS.md §x.y` in every physics function.
- TypeScript: `strict`, no `any`, no astronomical calculations on the client.
- No network calls in tests: JPL Horizons fixtures are generated by a script and versioned.
- NASA data always cited (product, version, URL) in `CHALLENGE_SPEC.md §5` and in the UI.
