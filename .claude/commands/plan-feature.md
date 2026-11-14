---
description: Planifica una nueva funcionalidad coordinando a los 4 agentes sin colisiones de archivos (Diseño → Contrato → Oráculo → Implementación → Verificación).
argument-hint: "<descripción de la funcionalidad>"
allowed-tools: Read, Grep, Glob
---

# /plan-feature

Funcionalidad solicitada: **$ARGUMENTS**

Actúa como `lead-architect-auditor`. **No escribas código**: produce un plan y espera aprobación del usuario.

## 1. Trazabilidad
- ¿Qué IDs de `docs/CHALLENGE_SPEC.md` cubre (RF-xx / RT-xx)? Si no encaja en ninguno, propón un nuevo ID y justifica.

## 2. Impacto
- Ecuaciones nuevas o modificadas (`docs/MATH_MODELS.md`).
- Cambios de contrato (`schemas.py` + `contracts.ts`) → ¿incrementa `CONTRACT_VERSION`?
- Datos nuevos (kernels, DEM, sitios).

## 3. Plan por fases y agentes (respetando `AGENTS.md §3`)

| Fase | Agente | Archivos que escribirá (solo los suyos) | Entregable | Puerta de salida |
|------|--------|------------------------------------------|-----------|------------------|
| 1. Diseño | lead-architect-auditor / astro-terrain-specialist | `docs/CHALLENGE_SPEC.md` / `docs/MATH_MODELS.md` | … | … |
| 2. Contrato | lead-architect-auditor + fullstack-visualizer (espejo TS) | `backend/app/models/schemas.py`, `frontend/src/types/contracts.ts` | … | `verify_environment.py` PASS |
| 3. Oráculo | qa-verification-agent | `backend/tests/…`, `frontend/tests/…` | tests en rojo/skip | revisión de astro |
| 4. Implementación | astro-terrain-specialist / fullstack-visualizer | `backend/app/services/…` / `backend/app/api/…`, `frontend/src/…` | … | tests verdes |
| 5. Verificación | qa-verification-agent + lead-architect-auditor | `docs/VALIDATION_LOG.md`, `docs/audits/…` | evidencia | `/audit-challenge` |

## 4. Control de colisiones
- Lista cada archivo tocado con **un único** propietario. Si dos agentes necesitan el mismo archivo, divide el trabajo o secuencia las fases.
- Identifica qué fases pueden ejecutarse en paralelo (p. ej. oráculo QA ‖ diseño UI) y cuáles son estrictamente secuenciales.

## 5. Riesgos y criterios de aceptación
- Riesgos científicos (marco, unidades, tolerancias) y de UX.
- Criterios de aceptación medibles.

Termina preguntando: "¿Apruebas este plan para ejecutarlo?"
