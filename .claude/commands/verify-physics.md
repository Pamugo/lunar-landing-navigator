---
description: Runs the physics-math test suite (horizon, visibility, and ephemeris oracles) in backend/tests and summarizes tolerances.
argument-hint: "[optional test pattern, e.g. test_horizon_geometry]"
allowed-tools: Bash(python -m unittest:*), Bash(python3 -m unittest:*), Bash(python -m pytest:*), Read
---

# /verify-physics

1. Run the suite (stdlib, zero dependencies):

   ```
   python -m unittest discover -s backend/tests -t backend -v
   ```

   If `$ARGUMENTS` is non-empty, run only that module: `python -m unittest tests.$ARGUMENTS -v` from `backend/`.
   If pytest is installed, alternative: `cd backend && python -m pytest -q`.

2. Summarize in a table: module · passed · failed · skipped (*skip* = oracle awaiting implementation or fixture).
3. For each failure, note the relevant equation (`docs/MATH_MODELS.md §x.y`) and the code owner to fix it.
   **Never** modify a test to make it pass.
4. Propose (do not write, unless you are `qa-verification-agent`) the corresponding entry for `docs/VALIDATION_LOG.md`.
