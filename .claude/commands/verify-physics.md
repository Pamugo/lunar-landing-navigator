---
description: Ejecuta la suite físico-matemática (oráculos de horizonte, visibilidad y efemérides) de backend/tests y resume tolerancias.
argument-hint: "[patrón de test opcional, p. ej. test_horizon_geometry]"
allowed-tools: Bash(python -m unittest:*), Bash(python3 -m unittest:*), Bash(python -m pytest:*), Read
---

# /verify-physics

1. Ejecuta la suite (stdlib, sin dependencias):

   ```
   python -m unittest discover -s backend/tests -t backend -v
   ```

   Si `$ARGUMENTS` no está vacío, ejecuta solo ese módulo: `python -m unittest tests.$ARGUMENTS -v` desde `backend/`.
   Si pytest está instalado, alternativa: `cd backend && python -m pytest -q`.

2. Resume en una tabla: módulo · pasados · fallidos · omitidos (*skip* = oráculo pendiente de implementación o de fixture).
3. Para cada fallo, indica la ecuación implicada (`docs/MATH_MODELS.md §x.y`) y el propietario del código a corregir.
   **Nunca** modifiques un test para que pase.
4. Propón (no escribas, salvo que seas `qa-verification-agent`) la entrada correspondiente para `docs/VALIDATION_LOG.md`.
