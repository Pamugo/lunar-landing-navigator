---
name: spaceapps-compliance
description: >-
  Use this skill when auditing the Lunar Landing Site Navigator project against the NASA Space Apps Challenge 2026
  rules and the "Lunar Landing Site Navigator" challenge requirements (RF-01..RF-07, RT-01..RT-04), checking data
  provenance, submission deliverables, AI-use disclosure, and producing a dated audit report with evidence.
---

# Space Apps Compliance — Auditoría frente a las bases del reto

Propietario: `lead-architect-auditor`. Disparador: `/audit-challenge`. Salida: `docs/audits/AUDIT_<YYYY-MM-DD>.md`.

## 1. Procedimiento

1. Ejecutar `python scripts/verify_environment.py` y `python -m unittest discover -s backend/tests -t backend -v`; adjuntar resumen.
2. Recorrer la matriz de `docs/CHALLENGE_SPEC.md §2` y, para cada ID, exigir **evidencia concreta** (archivo + línea, test, captura). Sin evidencia → no puede estar ✅.
3. Completar los checklists §2–§5 de esta skill.
4. Escribir el informe con: fecha, commit, tabla de estados, bloqueos, top-5 acciones priorizadas.
5. Actualizar la columna *Estado* de `CHALLENGE_SPEC.md` solo con estados respaldados por evidencia.

## 2. Requisitos del reto (contenido)

- [ ] RF-01 Sitios curados (Apollo, CLPS, Artemis, internacionales/comerciales) + coordenadas personalizadas.
- [ ] RF-02 Comparación lado a lado / secuencial con parámetros idénticos.
- [ ] RF-03 Fechas/horas flexibles (días y estaciones lunares).
- [ ] RF-04 Sol y Tierra vs horizonte local + tiempo restante hasta Sunset/Earthset.
- [ ] RF-05 Elevación solar, duración de luz, ventanas DTE.
- [ ] RF-06 Mapa 2D, superficie 3D, cúpula 360°, líneas de tiempo/animaciones.
- [ ] RF-07 Modo técnico + modo educativo.
- [ ] RT-01 Efemérides JPL (DE421/DE440) con libración; validado contra Horizons.
- [ ] RT-02 Topografía real LOLA para el horizonte.
- [ ] RT-03 Sin refracción; horizonte = topografía + curvatura (R = 1737.4 km). Buscar con grep `refract` en `backend/app/` → solo debe aparecer en comentarios que lo prohíben o en `refraction=False`.
- [ ] RT-04 Contratos versionados, rendimiento, reproducibilidad.

## 3. Datos y procedencia

- [ ] Cada dataset de NASA citado con nombre de producto, versión, URL y fecha de descarga (`CHALLENGE_SPEC.md §5`, pantalla "Créditos" de la UI).
- [ ] Coordenadas de `curated_sites.json` con `source` y `verification_status`; ninguna `approximate_pending_lola` presentada como precisa en Modo Ingeniero.
- [ ] Licencias de terceros compatibles (Skyfield MIT, Three.js MIT, ECharts Apache-2.0, React MIT).
- [ ] Sin logotipos de NASA ni insinuación de respaldo oficial (verificar en las bases 2026).

## 4. Entregables de Space Apps (⚠️ confirmar contra las bases oficiales 2026 antes de la entrega)

- [ ] Página de proyecto: título, resumen, descripción detallada, desafío elegido.
- [ ] Demo: vídeo corto o presentación (históricamente ~30 s de vídeo o ≤ 7 diapositivas — **verificar**).
- [ ] Enlace al repositorio público con instrucciones de ejecución.
- [ ] Lista de datos y recursos de NASA y de otras agencias utilizados.
- [ ] Declaración de uso de herramientas de IA (qué, dónde, cómo) y etiquetado de contenido generado por IA si las bases lo requieren.
- [ ] Equipo registrado y entrega antes del plazo del evento local/global.

## 5. Criterios de evaluación (alinear el pitch; nombres a verificar en las bases 2026)

| Criterio | Evidencia a preparar |
|----------|----------------------|
| Impacto / influencia | Caso de uso: retraso de lanzamiento → nueva fecha en < 1 min |
| Creatividad | Cúpula 360° con exageración vertical explícita; "ventanas doradas" Sol+DTE |
| Validez | Tabla de validación vs JPL Horizons y oráculos analíticos (`VALIDATION_LOG.md`) |
| Relevancia | Sitios Artemis III/CLPS reales; polo sur |
| Presentación | Modo Educativo + demo guiada |

## 6. Formato del informe

```markdown
# Auditoría Space Apps — <fecha> — commit <hash>
| ID | Estado | Evidencia | Acción |
|----|--------|-----------|--------|
...
## Bloqueos
## Top-5 acciones
```
