---
description: Audits project status against the Lunar Landing Site Navigator challenge rules using the spaceapps-compliance skill.
allowed-tools: Read, Grep, Glob, Bash(python scripts/verify_environment.py:*), Bash(python -m unittest:*), Write(docs/audits/*)
---

# /audit-challenge

Act as `lead-architect-auditor`.

1. Read `skills/spaceapps-compliance/SKILL.md` and `docs/CHALLENGE_SPEC.md`.
2. Run automated checks:
   - `python scripts/verify_environment.py`
   - `python -m unittest discover -s backend/tests -t backend -v`
3. For each RF-01..RF-07 and RT-01..RT-04, find concrete evidence in the repository (file:line, test, `docs/VALIDATION_LOG.md` entry).
   Without evidence ⇒ status cannot be ✅.
4. Verify RT-03 by searching `refract` across `backend/app/` and `frontend/src/`.
5. Complete the data/provenance, deliverables, and judging criteria checklists in the skill.
6. Write `docs/audits/AUDIT_<YYYY-MM-DD>.md` in the skill format and show the user: status table, blockers, and top-5 actions.
7. Do not modify code; only write the report (and update the *Status* column of `CHALLENGE_SPEC.md` if backed by evidence).
