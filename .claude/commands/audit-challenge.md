---
description: Audita el estado del proyecto frente a las bases del reto Lunar Landing Site Navigator usando la skill spaceapps-compliance.
allowed-tools: Read, Grep, Glob, Bash(python scripts/verify_environment.py:*), Bash(python -m unittest:*), Write(docs/audits/*)
---

# /audit-challenge

Actúa como `lead-architect-auditor`.

1. Lee `skills/spaceapps-compliance/SKILL.md` y `docs/CHALLENGE_SPEC.md`.
2. Ejecuta las verificaciones automáticas:
   - `python scripts/verify_environment.py`
   - `python -m unittest discover -s backend/tests -t backend -v`
3. Para cada RF-01..RF-07 y RT-01..RT-04 busca evidencia concreta en el repositorio (archivo:línea, test, entrada de `docs/VALIDATION_LOG.md`).
   Sin evidencia ⇒ el estado no puede ser ✅.
4. Comprueba RT-03 con una búsqueda de `refract` en `backend/app/` y `frontend/src/`.
5. Completa los checklists de datos/procedencia, entregables y criterios de evaluación de la skill.
6. Escribe `docs/audits/AUDIT_<YYYY-MM-DD>.md` con el formato de la skill y muestra al usuario: tabla de estados, bloqueos y top-5 acciones.
7. No modifiques código; solo el informe (y la columna *Estado* de `CHALLENGE_SPEC.md` si la evidencia lo respalda).
