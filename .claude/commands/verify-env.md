---
description: Verifies repository structure, skills, agents, commands, contracts (Python/TS parity), curated sites, and toolchains.
argument-hint: "[--json] [--strict]"
allowed-tools: Bash(python scripts/verify_environment.py:*), Bash(python3 scripts/verify_environment.py:*), Read
---

# /verify-env

1. Run (Windows: `python`, Linux/macOS: `python3`):

   ```
   python scripts/verify_environment.py $ARGUMENTS
   ```

2. Interpret the output:
   - `[FAIL]` → blocker. Identify the file owner per `AGENTS.md §3` and propose a fix (do not apply if the path isn't yours).
   - `[WARN]` → optional missing tool or dependency (e.g., Node, numpy). State how to install it.
   - `[PASS]` → no action needed.
3. Report a summary table: category · PASS · WARN · FAIL, and the exit code.
4. Do not modify files in this command.
