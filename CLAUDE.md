# CLAUDE.md

Este proyecto usa `AGENTS.md` como **única fuente** de reglas globales, compartida entre Claude Code y Antigravity.
No dupliques reglas aquí: edita `AGENTS.md`.

@AGENTS.md

## Notas específicas de Claude Code

- **Subagentes:** `.claude/agents/` → `lead-architect-auditor`, `astro-terrain-specialist`, `fullstack-visualizer`, `qa-verification-agent`.
  Respeta la tabla de *File Ownership Boundaries* de `AGENTS.md §3` al delegar.
- **Comandos:** `.claude/commands/` → `/verify-env`, `/verify-physics`, `/audit-challenge`, `/plan-feature`.
- **Skills:** viven en `skills/` (raíz, compartidas con Antigravity vía `.agents/skills.json`). Claude Code no las autodescubre en esa ruta:
  antes de trabajar en un área, lee el `SKILL.md` correspondiente:
  - Efemérides / libración / JPL Horizons → `skills/lunar-ephemeris/SKILL.md`
  - DEM LOLA / horizonte 360° → `skills/lola-topography-horizon/SKILL.md`
  - UI de comparación / Sunset-Earthset / modos → `skills/mission-comparison-ux/SKILL.md`
  - Auditoría frente a las bases del reto → `skills/spaceapps-compliance/SKILL.md`
- En Windows el intérprete es `python` (el alias `python3` de la Microsoft Store no está operativo en esta máquina).
