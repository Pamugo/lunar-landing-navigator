---
description: Verifica estructura del repo, skills, agentes, comandos, contratos (paridad Python/TS), sitios curados y herramientas.
argument-hint: "[--json] [--strict]"
allowed-tools: Bash(python scripts/verify_environment.py:*), Bash(python3 scripts/verify_environment.py:*), Read
---

# /verify-env

1. Ejecuta (en Windows `python`, en Linux/macOS `python3`):

   ```
   python scripts/verify_environment.py $ARGUMENTS
   ```

2. Interpreta la salida:
   - `[FAIL]` → bloqueante. Identifica el propietario del archivo según `AGENTS.md §3` y propón la corrección (no la apliques si el path no es tuyo).
   - `[WARN]` → herramienta o dependencia opcional ausente (p. ej. Node, numpy). Indica cómo instalarla.
   - `[PASS]` → sin acción.
3. Reporta una tabla resumen: categoría · PASS · WARN · FAIL, y el código de salida.
4. No modifiques archivos en este comando.
