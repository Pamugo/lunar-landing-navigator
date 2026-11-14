# CHALLENGE_SPEC — Lunar Landing Site Navigator (NASA Space Apps Challenge 2026)

> **Propietario:** `lead-architect-auditor` · **Estado:** v0.2 (Sprint 2 — Fullstack y Recursos Oficiales) · **Última revisión:** 2026-11-14
> Este documento es la **base de verdad** de requisitos. Cualquier funcionalidad nueva debe trazarse a un ID de esta matriz.

## 1. Enunciado del problema y propuesta de valor diferencial

Las misiones al polo sur lunar (programa CLPS de la NASA, Artemis, rovers de agencias asociadas como la CSA) están limitadas por **iluminación solar** (generación fotovoltaica, supervivencia térmica) y por la **visibilidad directa de la Tierra** (comunicaciones *Direct-to-Earth*, DTE). Cambios pequeños de fecha, coordenadas o altura del mástil/hardware alteran drásticamente la viabilidad operativa.

### Propuesta de valor frente a las herramientas existentes (confirmado en la pestaña *Resources*)
1. **Frente a NASA Moon Trek (`https://trek.nasa.gov/moon/`)**: En Moon Trek, las herramientas avanzadas de iluminación solar y análisis de pendientes/horizonte están **restringidas a cuentas registradas de científicos/JPL**. *Lunar Landing Site Navigator* ofrece análisis topográfico de horizonte 360°, iluminación solar y visibilidad DTE **de forma instantánea, pública y sin registro**.
2. **Frente a LROC QuickMap (`https://quickmap.lroc.im-ldi.com`) y JPL Horizons**: Permite comparar hasta 4 sitios y múltiples alturas de hardware (ej. *CSA Canadian Utility Rover* a 1.5 m vs. *lander CLPS* a 3.5 m) en milisegundos, incluyendo enlaces profundos (*deep-links*) directos al nuevo dominio oficial de QuickMap (alojado en Intuitive Machines) y a Moon Trek.
3. **Fiabilidad 100 % determinista y tolerante a fallos**:
   - **Modo Offline / Pre-cacheado**: Los 9 sitios curados cuentan con perfiles de horizonte `.npz` y parches DEM LOLA locales precalculados y verificados para responder en milisegundos sin llamadas de red.
   - **Fallback analítico seguro (`spherical_analytical`)**: Cualquier coordenada personalizada fuera de la cobertura del GeoTIFF polar degrada limpiamente al horizonte esférico analítico sin atmósfera ($R = 1737.4\text{ km}$), declarando `horizon_source` en el JSON y garantizando cero errores HTTP 500.

## 2. Matriz de requisitos trazable

Leyenda de estado: ⬜ No iniciado · 🟡 En progreso · ✅ Verificado (con evidencia) · ❌ Bloqueado

### 2.1 Requisitos Funcionales (RF)

| ID | Requisito | Criterio de aceptación verificable | Componente(s) | Verificación / Oráculo | Estado |
|----|-----------|------------------------------------|---------------|------------------------|--------|
| RF-01 | Selección interactiva de sitios curados (Apollo, CLPS, Artemis, internacionales/comerciales), perfiles de altura de hardware (CSA/NASA) y coordenadas personalizadas con enlaces a QuickMap y Moon Trek | ≥ 9 sitios curados con `quickmap_url` (`quickmap.lroc.im-ldi.com`) y `moontrek_url`; ≥ 5 perfiles de hardware (`observer_height_m`, incl. CSA Canadian Utility Rover 1.5 m y lander CLPS 3.5 m); coordenadas personalizadas con fallback limpio `spherical_analytical` | `data/curated_sites.json`, `services/terrain.py`, `services/horizon.py`, `GET /api/v1/sites` | `backend/tests/test_curated_sites.py`, `backend/tests/test_horizon_service.py` | ✅ (catálogo, links, perfiles CSA y fallback verificados) |
| RF-02 | Comparación rápida lado a lado (hasta 4 sitios) o secuencial (A/B) | Mismos parámetros temporales para todos los sitios; cursores temporales sincronizados; respuesta < 2 s con horizonte cacheado | `services/visibility.py`, `POST /api/v1/compare`, `ComparisonGrid` | `backend/tests/test_visibility_service.py` | ✅ (motor backend y UI comparadora verificados) |
| RF-03 | Flexibilidad de fecha/hora para explorar días y estaciones lunares | Ventana arbitraria UTC ISO-8601 dentro del rango del kernel (`de421.bsp`: 1900–2050); paso configurable (≥ 1 min) | `services/ephemeris.py`, `TimeWindow`, `TimeControls` | `backend/tests/test_ephemeris_oracle.py` | ✅ (motor Skyfield vectorizado verificado) |
| RF-04 | Posición del Sol y la Tierra respecto al horizonte local + tiempo restante hasta Sunset / Earthset | Az/El de ambos cuerpos, elevación del horizonte topográfico en su acimut, cuenta atrás hasta el evento con instante UTC absoluto (refinado por Brent a ≤ 1 s) | `services/visibility.py`, `HorizonDome`, `EventCountdown` | `backend/tests/test_visibility_service.py` + fixtures JPL Horizons | ✅ (motor de eventos verificado) |
| RF-05 | Evaluación de energía y comunicación: elevación solar, duración de luz, ventanas DTE | Métricas por sitio: % iluminado, periodo iluminado más largo, noche más larga, % DTE, ventanas simultáneas Sol+Tierra | `services/visibility.py`, `SiteSummaryMetrics` | `backend/tests/test_visibility_service.py` | ✅ (cálculo de métricas verificado) |
| RF-06 | Visualización múltiple: mapa 2D, superficie 3D (malla adaptativa móvil/escritorio), cúpula de horizonte 360°, líneas de tiempo/animaciones | Mallas 3D adaptativas (`mobile` 32×32, `tablet` 48×48, `desktop` 96×96) en `terrain.py`; las 5 vistas sincronizadas en tiempo | `services/terrain.py`, `LunarGlobe3D`, `PolarMap2D`, `Terrain3D`, `HorizonDome`, `ElevationTimeline` | `backend/tests/test_terrain_projection.py` + Vitest | ✅ (payloads backend y vistas 3D/2D verificados) |
| RF-07 | Accesibilidad dual (Modo Ingeniero / Modo Educativo) y diseño Responsive Multi-dispositivo (Móvil, Tablet, Escritorio) | Estética *NASA Mission Control Minimal*; comparador lado a lado en escritorio y tarjetas táctiles en móvil; sello de verificación científica JPL Horizons; WCAG 2.2 AA | `HeaderHUD`, `docs/UI_DESIGN.md`, `skills/mission-comparison-ux/SKILL.md` | Checklist a11y + auditoría `/audit-challenge` | ✅ (verificado en Sprint 2) |

### 2.2 Requisitos Técnicos (RT)

| ID | Requisito | Criterio de aceptación verificable | Componente(s) | Verificación / Oráculo | Estado |
|----|-----------|------------------------------------|---------------|------------------------|--------|
| RT-01 | Efemérides JPL (`de421.bsp`) con libración lunar física (`MOON_ME_DE421`) | Marco `MOON_ME` construido desde `moon_pa_de421_1900-2050.bpc` + `moon_080317.tf` + `pck00008.tpc`; error Az/El vs JPL Horizons (`APPARENT=AIRLESS`) ≤ 0.01° (objetivo), ≤ 0.05° (aceptación) | `services/ephemeris.py` (Skyfield) | `backend/tests/test_ephemeris_oracle.py` con fixtures reales de JPL Horizons | ✅ (verificado contra JPL Horizons API) |
| RT-02 | Topografía LOLA para horizonte local en el polo sur y parches 3D adaptativos | Lectura de GeoTIFF estereográfico polar sur (`+proj=stere +lat_0=-90 +R=1737400`); perfil 360° con paso 0.5° (720 muestras); caché `.npz` offline para los 9 sitios; fallback `spherical_analytical` fuera de cobertura | `services/terrain.py`, `services/horizon.py` | `test_horizon_geometry.py`, `test_terrain_projection.py`, `test_horizon_service.py` | ✅ (verificado con GeoTIFF LOLA y caché `.npz`) |
| RT-03 | Sin atmósfera: sin refracción; horizonte = topografía + curvatura ($R = 1737.4\text{ km}$) | Ningún término de refracción en el código; depresión de esfera lisa = $\arccos(R/(R+h))$ con error < $10^{-9}\text{ rad}$ | `services/horizon.py`, `docs/MATH_MODELS.md` | `test_horizon_geometry.py`, guardia en `verify_environment.py` | ✅ (verificado) |
| RT-04 | Precisión trazable, rendimiento, modo offline y sello científico | Contratos JSON v0.2.0 sincronizados; serie de 30 días a paso 1 h en < 2 s con horizonte cacheado; `ScientificVerificationSeal` expuesto con errores máximos/RMS frente a JPL Horizons | `schemas.py`, `contracts.ts`, `services/visibility.py` | `verify_environment.py` + benchmark en `test_visibility_service.py` | ✅ (verificado) |

## 3. Lista de verificación — Pestaña oficial "Resources" (NASA Space Apps 2026)

| # | Recurso Oficial | URL / Referencia | Integración en el proyecto | Estado |
|---|-----------------|------------------|----------------------------|--------|
| R-01 | **NASA/JPL Horizons System** | `https://ssd.jpl.nasa.gov/horizons/` · API `https://ssd.jpl.nasa.gov/api/horizons.api` | Oráculo de validación científica (`COMMAND='10'` Sol, `'399'` Tierra, `CENTER='coord@301'`, `APPARENT='AIRLESS'`) y sello `ScientificVerificationSeal` | ✅ Integrado y verificado |
| R-02 | **NAIF SPICE Kernels** | `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/` (`de421.bsp`, `moon_pa_de421_1900-2050.bpc`, `moon_080317.tf`, `pck00008.tpc`) | Motor `services/ephemeris.py` con libración física en marco `MOON_ME_DE421` | ✅ Descargado y verificado por SHA-256 |
| R-03 | **LOLA South Polar DEMs (PGDA / PDS)** | `https://pgda.gsfc.nasa.gov/` · `https://pds-geosciences.wustl.edu/missions/lro/lola.htm` | Lectura GeoTIFF en `services/terrain.py`, raycasting 360° en `services/horizon.py` y caché `.npz` precalculada | ✅ Integrado con caché offline y fallback esférico |
| R-04 | **NASA LROC QuickMap (Nuevo Dominio)** | `https://quickmap.lroc.im-ldi.com` *(migrado desde `quickmap.lroc.asu.edu`, alojado en Intuitive Machines)* | Generador de *deep-links* `build_quickmap_url(lat, lon)` e integración en los 9 sitios de `curated_sites.json` | ✅ Integrado |
| R-05 | **NASA Moon Trek** | `https://trek.nasa.gov/moon/` | Generador `build_moontrek_url(lat, lon)` + desbloqueo abierto de las funciones de iluminación/horizonte que en Moon Trek requieren cuenta científica/JPL | ✅ Integrado |
| R-06 | **NASA Scientific Visualization Studio (SVS)** | `https://svs.gsfc.nasa.gov/` (Moon Phase and Libration) | Referencia visual y pedagógica para las tarjetas del Modo Educativo sobre libración lunar | ✅ Documentado |
| R-07 | **Partner Agency: CSA (Canadian Space Agency)** | `https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/` (*Canadian Utility Rover*, *Canadarm3*, *Gateway*, *LEAP*) | Catálogo `hardware_profiles` en `curated_sites.json` y contrato `HardwareProfile` para evaluar el impacto de la altura del mástil (`1.5 m` CSA Utility Rover, `0.5 m` LEAP payload, `3.5 m` lander CLPS, `2.0 m` EVA) | ✅ Integrado |
| R-08 | **Coordenadas de sitios Apollo, CLPS y Artemis III** | NASA NSSDCA, LROC y selección de regiones Artemis III | 9 sitios curados en `data/curated_sites.json` con citas y estado de verificación | ✅ Integrado |

## 4. Registro de cambios

| Fecha | Versión | Cambio | Autor |
|-------|---------|--------|-------|
| 2026-11-14 | 0.1 | Creación de la matriz RF-01..RF-07 / RT-01..RT-04 | lead-architect-auditor |
| 2026-11-14 | 0.2 | Incorporación de la pestaña oficial *Resources* (nuevo dominio QuickMap `quickmap.lroc.im-ldi.com`, propuesta de valor frente a Moon Trek, perfiles de hardware CSA/CLPS), blindaje offline + fallback analítico, sello científico JPL Horizons y payloads adaptativos multi-dispositivo | lead-architect-auditor |
