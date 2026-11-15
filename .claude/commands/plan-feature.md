---
description: Plans a new feature coordinating all 4 agents without file collisions (Design → Contract → Oracle → Implementation → Verification).
argument-hint: "<feature description>"
allowed-tools: Read, Grep, Glob
---

# /plan-feature

Requested feature: **$ARGUMENTS**

Act as `lead-architect-auditor`. **Do not write code**: produce a plan and wait for user approval.

## 1. Traceability
- Which IDs in `docs/CHALLENGE_SPEC.md` does it cover (RF-xx / RT-xx)? If none fit, propose a new ID and justify.

## 2. Impact
- New or modified equations (`docs/MATH_MODELS.md`).
- Contract changes (`schemas.py` + `contracts.ts`) → does it bump `CONTRACT_VERSION`?
- New data (kernels, DEM, sites).

## 3. Phased Plan by Agent (respecting `AGENTS.md §3`)

| Phase | Agent | Files it will write (exclusively its own) | Deliverable | Exit Gate |
|-------|-------|-------------------------------------------|-------------|-----------|
| 1. Design | lead-architect-auditor / astro-terrain-specialist | `docs/CHALLENGE_SPEC.md` / `docs/MATH_MODELS.md` | … | … |
| 2. Contract | lead-architect-auditor + fullstack-visualizer (TS mirror) | `backend/app/models/schemas.py`, `frontend/src/types/contracts.ts` | … | `verify_environment.py` PASS |
| 3. Oracle | qa-verification-agent | `backend/tests/…`, `frontend/tests/…` | red/skipped tests | review by astro |
| 4. Implementation | astro-terrain-specialist / fullstack-visualizer | `backend/app/services/…` / `backend/app/api/…`, `frontend/src/…` | … | tests green |
| 5. Verification | qa-verification-agent + lead-architect-auditor | `docs/VALIDATION_LOG.md`, `docs/audits/…` | evidence | `/audit-challenge` |

## 4. Collision Control
- List every touched file with **a single** owner. If two agents need the same file, split the work or sequence the phases.
- Identify which phases can run in parallel (e.g., QA oracle ‖ UI design) and which are strictly sequential.

## 5. Risks & Acceptance Criteria
- Scientific risks (frame, units, tolerances) and UX risks.
- Measurable acceptance criteria.

End by asking: "Do you approve this plan for execution?"
