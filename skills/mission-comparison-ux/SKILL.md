---
name: mission-comparison-ux
description: >-
  Use this skill when designing or implementing any frontend view of the Lunar Landing Site Navigator: NASA Mission
  Control Minimal look & feel, LunarGlobe3D interactive globe, side-by-side or swipeable site comparison, Sun/Earth
  horizon dome, elevation timelines, Sunset/Earthset countdowns, 3D LOLA terrain, and dual Engineer / Education modes.
---

# Mission Comparison UX — "NASA Mission Control Minimal" & Responsive Cross-Device

Requisitos: RF-01..RF-07, RT-04 (`docs/CHALLENGE_SPEC.md`, `docs/UI_DESIGN.md`). Propietario: `fullstack-visualizer` (`frontend/src/`).

## 1. Identidad Visual "NASA Mission Control Minimal" (Obligatoria)

Consulta siempre `docs/UI_DESIGN.md` antes de crear o editar componentes:
- **Modo Oscuro Espacial Minimalista:** Fondo principal `#0B0F19`, paneles translúcidos `rgba(17, 24, 39, 0.75)` con `backdrop-filter: blur(12px)` y bordes sutiles `1px solid rgba(255, 255, 255, 0.08)`.
- **Paleta Institucional NASA:**
  - Azul insignia NASA `#0B3D91` y acento interactivo `#1E62D0`.
  - Texto blanco puro `#FFFFFF` y gris claro `#E2E8F0`.
  - Ámbar/dorado `#F59E0B` / `#FBBF24` para iluminación y potencia solar.
  - Cian eléctrico `#06B6D4` / `#38BDF8` para comunicación Direct-to-Earth (DTE).
  - Verde esmeralda `#10B981` para ventanas simultáneas Sol + DTE ("Ventana Dorada").
  - Carmesí NASA `#E03C31` para alertas críticas de ocultación (*Sunset* / *Earthset* inminente).
- **Jerarquía Tipográfica:**
  - Sans-serif limpia (`Inter`, `Roboto`, `system-ui`) para textos generales, narrativa y menús.
  - Monospace tabular (`JetBrains Mono`, `Fira Code`, `monospace` con `tabular-nums`) reservada exclusivamente para coordenadas selenográficas, ángulos, instantes UTC, errores JPL Horizons y cuentas atrás.

## 2. Sistema de Doble Modo en `HeaderHUD`

Conmutador prominente en la barra superior:
- **Modo Educativo / Divulgativo (`edu`):** Enfoque narrativo y visual. Destaca la historia de las misiones lunares, explica por qué en el Polo Sur coexisten cráteres en sombra permanente (PSRs con hielo de agua) y picos de luz casi eterna, y traduce las métricas a lenguaje cotidiano.
- **Modo Ingeniero / Científico (`eng`):** Enfoque analítico de alta densidad. Muestra telemetría con 3–4 decimales, el **Sello Interactivo de Verificación Científica contra NASA JPL Horizons (`<= 0.000009°`)**, el indicador de fuente de horizonte (`lola_dem_cached` vs `spherical_analytical`), exageración vertical seleccionable y enlaces directos a **LROC QuickMap (`https://quickmap.lroc.im-ldi.com`)** y **NASA Moon Trek (`https://trek.nasa.gov/moon/`)**.

## 3. El Globo Lunar 3D (`LunarGlobe3D.tsx`) y Vistas Acopladas

1. **`LunarGlobe3D.tsx` (Núcleo Visual Común en ambos modos):**
   - Esfera lunar 3D interactiva (Three.js / WebGL) con rotación libre, enfoque rápido al Polo Sur o a cualquier sitio curado, y selección de coordenadas haciendo clic sobre la superficie.
   - En **Modo Educativo (`edu`)**: muestra de forma muy visual las **rutas e hitos del histórico de misiones** (Apollo 11, Apollo 17, objetivos CLPS, Artemis, Chang'e-4, Chandrayaan-3) con **fichas informativas al hacer clic**, junto con la iluminación global del terminador lunar y los anillos de **zonas de sombra permanente (PSRs / hielo de agua)**.
   - En **Modo Ingeniero (`eng`)**: superpone vectores geométricos 3D en tiempo real hacia el Sol y la Tierra y se acopla o alterna con:
     - **`HorizonDome.tsx`**: Cúpula 360° con silueta LOLA, discos de Sol y Tierra a escala angular real y selector explícito de exageración vertical (`×1`, `×5`, `×10`, `×20`).
     - **`Terrain3D.tsx`**: Malla topográfica local LOLA (`32×32` móvil, `48×48` tablet, `96×96` escritorio) con iluminación direccional solar en tiempo real.
     - **`PolarMap2D.tsx`**: Mapa estereográfico polar sur 2D.
2. **Selector de Hardware (`HardwareProfile`):**
   - Permite alternar en vivo `observer_height_m` entre los 5 perfiles oficiales (`0.5 m` CSA LEAP, `1.5 m` **CSA Canadian Utility Rover** de la Agencia Espacial Canadiense, `2.0 m` Artemis EVA, `2.2 m` Artemis LTV, `3.5 m` CLPS Lander).

## 4. Layout Responsive Cross-Device (Escritorio, Tablet y Móvil)

- **Escritorio (`>= 1024px`):** Interfaz multitarea de paneles acoplados:
  - Izquierda: Globo/Visor 3D (`LunarGlobe3D` + conmutador a `HorizonDome` 360° / `Terrain3D` local / `PolarMap2D`).
  - Centro/Derecha: Comparador lado a lado (`ComparisonGrid`) de sitios y fechas con cuentas atrás `EventCountdown` (*Sunset* / *Earthset* + instante UTC absoluto).
  - Abajo: Cronograma temporal interactivo de potencia y comunicación (`ElevationTimeline` con Apache ECharts + `TimeControls` con reproducción y *scrubber* sincronizado).
- **Móvil y Tablet (`< 1024px`):** Pestañas táctiles superiores/inferiores, tarjetas comparativas deslizables (*swiping*), *timeline scrubber* ergonómico adaptado al tacto y `dpr = Math.min(window.devicePixelRatio, 1.5)` en WebGL.

## 5. Integración y Enlaces Oficiales (Portales NASA)

- Incluye *deep-links* directos en todos los sitios de alunizaje hacia el nuevo dominio oficial de **NASA LROC QuickMap** (`https://quickmap.lroc.im-ldi.com`) y **NASA Moon Trek** (`https://trek.nasa.gov/moon/`).

## 6. Accesibilidad (WCAG 2.2 AA)

- Contraste ≥ 4.5:1, navegación por teclado, `aria-label` descriptivos en controles y lienzos 3D/2D, `prefers-reduced-motion` respetado y unidades visibles en toda magnitud.
