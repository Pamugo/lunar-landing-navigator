---
name: spaceapps-compliance
description: >-
  Use this skill when auditing the Lunar Landing Site Navigator project against the NASA Space Apps Challenge 2026
  rules and the "Lunar Landing Site Navigator" challenge requirements (RF-01..RF-07, RT-01..RT-04), checking data
  provenance, submission deliverables, AI-use disclosure, and producing a dated audit report with evidence.
---

# Space Apps Compliance — Audit Against Challenge Rules

Owner: `lead-architect-auditor`. Trigger: `/audit-challenge`. Output: `docs/audits/AUDIT_<YYYY-MM-DD>.md`.

## 1. Procedure

1. Run `python scripts/verify_environment.py` and `python -m unittest discover -s backend/tests -t backend -v`; attach summary.
2. Walk through the `docs/CHALLENGE_SPEC.md §2` matrix and, for each ID, require **concrete evidence** (file + line, test, screenshot). Without evidence → cannot be marked ✅.
3. Complete checklists §2–§5 of this skill.
4. Write the report with: date, commit, status table, blockers, top-5 prioritized actions.
5. Update the *Status* column of `CHALLENGE_SPEC.md` only with evidence-backed statuses.

## 2. Challenge Requirements (Content)

- [ ] RF-01 Curated sites (Apollo, CLPS, Artemis, international/commercial) + custom coordinates.
- [ ] RF-02 Side-by-side / sequential comparison with identical parameters.
- [ ] RF-03 Flexible dates/times (lunar days and seasons).
- [ ] RF-04 Sun and Earth vs local horizon + time remaining until Sunset/Earthset.
- [ ] RF-05 Solar elevation, sunlight duration, DTE windows.
- [ ] RF-06 2D map, 3D surface, 360° dome, timelines/animations.
- [ ] RF-07 Engineer mode + educational mode.
- [ ] RT-01 JPL ephemerides (DE421/DE440) with libration; validated against Horizons.
- [ ] RT-02 Real LOLA topography for horizon.
- [ ] RT-03 Zero atmospheric refraction; horizon = topography + curvature (R = 1737.4 km). Grep `refract` in `backend/app/` → must only appear in comments forbidding it or `refraction=False`.
- [ ] RT-04 Versioned contracts, performance, reproducibility.

## 3. Data and Provenance

- [ ] Every NASA dataset cited with product name, version, URL, and download date (`CHALLENGE_SPEC.md §5`, UI credits).
- [ ] `curated_sites.json` coordinates carry `source` and `verification_status`; none marked `approximate_pending_lola` presented as exact in Engineer Mode.
- [ ] Compatible third-party licenses (Skyfield MIT, Three.js MIT, ECharts Apache-2.0, React MIT).
- [ ] No NASA logos or implication of official endorsement (check against 2026 rules).

## 4. Space Apps Deliverables (⚠️ confirm against official 2026 rules before submission)

- [ ] Project page: title, summary, detailed description, selected challenge.
- [ ] Demo: short video or pitch deck (historically ~30 s video or ≤ 7 slides — **verify**).
- [ ] Link to public repository with run instructions.
- [ ] List of NASA and partner-agency data and resources used.
- [ ] AI tool usage disclosure (what, where, how) and labeling of AI-generated content if required by rules.
- [ ] Team registered and submission filed before local/global event deadline.

## 5. Judging Criteria (align pitch; verify criterion names in 2026 rules)

| Criterion | Evidence to Prepare |
|-----------|---------------------|
| Impact | Use case: launch delay → new landing date in < 1 min |
| Creativity | 360° dome with explicit vertical exaggeration; "Golden Windows" (Sun+DTE) |
| Validity | Validation table vs JPL Horizons and analytical oracles (`VALIDATION_LOG.md`) |
| Relevance | Real Artemis III / CLPS sites; south pole |
| Presentation | Educational Mode + guided demo |

## 6. Report Format

```markdown
# Space Apps Audit — <date> — commit <hash>
| ID | Status | Evidence | Action |
|----|--------|----------|--------|
...
## Blockers
## Top-5 Actions
```
