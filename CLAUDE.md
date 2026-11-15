# CLAUDE.md

This project uses `AGENTS.md` as its **single source** of global rules, shared between Claude Code and Antigravity.
Do not duplicate rules here: edit `AGENTS.md`.

@AGENTS.md

## Claude Code-Specific Notes

- **Subagents:** `.claude/agents/` → `lead-architect-auditor`, `astro-terrain-specialist`, `fullstack-visualizer`, `qa-verification-agent`.
  Respect the *File Ownership Boundaries* table in `AGENTS.md §3` when delegating.
- **Commands:** `.claude/commands/` → `/verify-env`, `/verify-physics`, `/audit-challenge`, `/plan-feature`.
- **Skills:** live in `skills/` (root, shared with Antigravity via `.agents/skills.json`). Claude Code does not auto-discover them at that path:
  before working in a domain, read the corresponding `SKILL.md`:
  - Ephemerides / libration / JPL Horizons → `skills/lunar-ephemeris/SKILL.md`
  - LOLA DEM / 360° horizon → `skills/lola-topography-horizon/SKILL.md`
  - Comparison UI / Sunset-Earthset / modes → `skills/mission-comparison-ux/SKILL.md`
  - Challenge rules audit → `skills/spaceapps-compliance/SKILL.md`
- On Windows, the Python interpreter is `python` (the Microsoft Store `python3` alias is not functional on this machine).
