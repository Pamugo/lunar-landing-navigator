# UI_DESIGN — Especificación Visual y Arquitectura UX ("NASA Mission Control Minimal")

> **Propietario:** `lead-architect-auditor` · **Implementador:** `fullstack-visualizer` · **Revisión:** Sprint 2 (`v0.2.0`)
> Este documento define la identidad visual obligatoria del frontend de *Lunar Landing Site Navigator* y rige junto con [skills/mission-comparison-ux/SKILL.md](../skills/mission-comparison-ux/SKILL.md).

---

## 1. Look & Feel y Paleta Institucional ("NASA Mission Control Minimal")

Estética de **consola de vuelo limpia, seria y sobria**, inspirada en el software de telemetría moderna de la NASA, Vercel y Stripe. Prioriza la elegancia, el minimalismo y la legibilidad profesional evitando ornamentos *sci-fi* innecesarios.

| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--bg-space-deep` | `#0B0F19` | Fondo espacial profundo principal |
| `--bg-panel-glass` | `rgba(17, 24, 39, 0.75)` | Paneles translúcidos con `backdrop-filter: blur(12px)` |
| `--bg-panel-elevated` | `rgba(30, 41, 59, 0.65)` | Tarjetas interactivas, cabeceras de tabla y controles |
| `--border-subtle` | `1px solid rgba(255, 255, 255, 0.08)` | Bordes luminosos sutiles de separación |
| `--nasa-blue` | `#0B3D91` | Azul insignia institucional de la NASA (fondos activos, insignias) |
| `--nasa-blue-accent` | `#1E62D0` | Acento interactivo primario, foco y controles activos |
| `--text-primary` | `#FFFFFF` | Títulos, métricas clave y lectura principal |
| `--text-secondary` | `#E2E8F0` | Subtítulos, descripciones y etiquetas |
| `--text-muted` | `#94A3B8` | Unidades secundarias, metadatos y ejes |
| `--solar-amber` | `#F59E0B` / `#FBBF24` | Iluminación solar, elevación del Sol y potencia fotovoltaica |
| `--dte-cyan` | `#06B6D4` / `#38BDF8` | Visibilidad terrestre y enlaces Direct-to-Earth (DTE) |
| `--golden-window` | `#10B981` | Ventana simultánea Sol + DTE ("Golden Operational Window") |
| `--nasa-crimson` | `#E03C31` | Alertas críticas de ocultación (*Sunset* / *Earthset* inminente o sombra permanente) |

---

## 2. Tipografía y Jerarquía de Datos

- **Textos Generales, Navegación y Narrativa (`--font-sans`)**:
  `'Inter', 'Roboto', system-ui, -apple-system, sans-serif` — lectura cristalina en pantallas móviles, tablets y monitores de escritorio.
- **Telemetría, Coordenadas y Cuentas Atrás (`--font-mono`)**:
  `'JetBrains Mono', 'Fira Code', ui-monospace, SFMono-Regular, monospace` con `font-variant-numeric: tabular-nums` — reservada exclusivamente para coordenadas selenográficas (`lat_deg`, `lon_deg`), ángulos (`Az`, `El`, `clearance_deg`), instantes UTC ISO-8601, errores frente a JPL Horizons (`≤ 0.000009°`) y cuentas atrás (*countdowns*).

---

## 3. Sistema de Doble Modo (Conmutador Superior en `HeaderHUD.tsx`)

La barra superior (`HeaderHUD`) incluye un conmutador prominente e instantáneo entre dos modos que consumen **exactamente los mismos datos científicos**:

### 3.1 Modo Educativo / Divulgativo (`mode = "edu"`)
- **Propósito**: Enfoque narrativo, limpio y visual. Diseñado para educadores, estudiantes y público general.
- **Contenido destacado**:
  - Historia de las misiones lunares (`description_edu`, hitos históricos de Apollo 11, Apollo 17, objetivos CLPS como IM-2 Athena, Artemis III y misiones internacionales como Chang'e-4 y Chandrayaan-3).
  - Explicaciones intuitivas de los extremos polares: por qué existen **Regiones en Sombra Permanente (PSRs)** que albergan hielo de agua milenario (ej. *Cabeus Crater*) a pocos kilómetros de **Picos de Luz Casi Eterna** (ej. *Shackleton Rim* y *Malapert Massif*).
  - Animaciones fluidas del ciclo lunar y traducción de ángulos y métricas a lenguaje natural ("Atardecer eterno pegado al horizonte", "Llamada directa a casa disponible", "Batería necesaria para X días de noche").

### 3.2 Modo Ingeniero / Científico (`mode = "eng"`)
- **Propósito**: Enfoque analítico de alta densidad para planificadores de misiones.
- **Contenido destacado**:
  - Curvas técnicas completas en Apache ECharts (`ElevationTimeline.tsx`), ángulos solares exactos y ventanas de visibilidad *Direct-to-Earth* (DTE) con 3–4 decimales (`Az`, `El`, `horizon_elevation_deg`, `clearance_deg`, `visible_fraction`, irradiancia solar estimada en $\text{W/m}^2$).
  - **Sello Interactivo y Tabla de Errores frente a JPL Horizons (`ScientificVerificationSeal`)**: Modal/popover con la tabla de validación frente al oráculo NASA JPL Horizons ($\le 0.000009^\circ$: `max_az_error_deg = 0.000009°`, `max_el_error_deg = 0.000009°`, `rms_el_error_deg = 0.000006°`, kernel `de421.bsp`, marco `MOON_ME_DE421`, `APPARENT=AIRLESS`).
  - Perfiles de horizonte en $360^\circ$ (`HorizonDome.tsx`) con exageración vertical seleccionable e indicador explícito de fuente topográfica (`LOLA DEM 20m/px Cached` vs `Spherical Analytical Fallback R=1737.4km`).

---

## 4. El Globo Lunar 3D (`LunarGlobe3D.tsx` — Núcleo Visual Común)

- **Presencia Dual**: El globo 3D interactivo (WebGL / Three.js) se muestra **tanto en el modo divulgativo como en el científico** como el eje central y unificador de la aplicación.
- **Capas Dinámicas según el Modo**:
  - *En Modo Divulgativo (`edu`)*: Muestra de forma muy visual las **rutas orbitales/de aproximación e hitos del histórico de misiones** (Apollo 11, Apollo 17, objetivos CLPS, Artemis, Chang'e-4, Chandrayaan-3) con **fichas informativas interactivas al hacer clic**, junto con la iluminación global del terminador lunar y los anillos de **zonas de sombra permanente (PSRs / hielo de agua)**.
  - *En Modo Científico (`eng`)*: Se acopla y alterna con el relieve topográfico local real (`Terrain3D.tsx` basado en LOLA DEM), la cúpula de horizonte en $360^\circ$ (`HorizonDome.tsx`), el mapa estereográfico 2D (`PolarMap2D.tsx`) y los vectores geométricos 3D en tiempo real hacia el Sol (`#F59E0B`) y la Tierra (`#06B6D4`).
  - *Soporte de Hardware Configurable*: Selector interactivo de los perfiles de hardware (`HardwareProfile`) que recalibran en vivo la altura del instrumento (`observer_height_m`), incluyendo landers CLPS (`3.5 m`), mástil EVA Artemis (`2.0 m`), rover LTV (`2.2 m`), micro-payload LEAP (`0.5 m`) y el **CSA Utility Rover (`1.5 m`) de la Agencia Espacial Canadiense**.

---

## 5. Experiencia Multi-dispositivo (Responsive Cross-Device)

### 5.1 Escritorio (`>= 1024px` — Interfaz Multitarea de Paneles Acoplados)
- **Barra Superior (`HeaderHUD`)**: Identidad NASA Mission Control, Sello JPL Horizons ($\le 0.000009^\circ$), Selector de Perfil de Hardware CSA/CLPS y Conmutador prominente **Modo Educativo / Modo Ingeniero**.
- **Izquierda (Globo / Visor 3D)**: `LunarGlobe3D.tsx` acoplado con `HorizonDome.tsx` ($360^\circ$), `Terrain3D.tsx` (relieve LOLA DEM) y `PolarMap2D.tsx`.
- **Centro / Derecha (`ComparisonGrid`)**: Comparador lado a lado (*side-by-side*) de sitios y fechas con métricas clave (% luz solar, % DTE, % Ventana Dorada Sol+DTE, noche más larga) y cuentas atrás `EventCountdown` (*Sunset* / *Earthset* con hora UTC exacta).
- **Abajo (`ElevationTimeline` + `TimeControls`)**: Cronograma temporal interactivo de potencia solar y comunicación DTE (Apache ECharts) con *scrubber* y animación sincronizada.

### 5.2 Móvil y Tablet (`< 1024px` — Interfaz Táctil Fluida)
- Navegación basada en **pestañas táctiles superiores/inferiores** (`Globo 3D & Horizonte` · `Comparador` · `Línea Temporal`) y **tarjetas deslizables (*swiping*)**.
- Controles deslizantes (*timeline scrubbers*) adaptados para una navegación táctil cómoda, limpia y sin fricción.
- Escalado automático de densidad de píxeles en WebGL (`dpr = Math.min(window.devicePixelRatio, 1.5)`) y solicitud automática de malla `mobile` (`32×32`) o `tablet` (`48×48`).

---

## 6. Integración y Enlaces Oficiales (Portales NASA)

- Todos los sitios curados y coordenadas personalizadas incluyen *deep-links* directos en la interfaz hacia:
  1. **NASA LROC QuickMap** en su nuevo dominio oficial alojado en Intuitive Machines: `https://quickmap.lroc.im-ldi.com` (`quickmap.lroc.asu.edu` en retirada).
  2. **NASA Moon Trek**: `https://trek.nasa.gov/moon/`.
- **Propuesta de Valor Abierta**: Mientras que en NASA Moon Trek las herramientas avanzadas de iluminación y análisis de pendientes requieren cuentas restringidas de científicos/JPL, *Lunar Landing Site Navigator* proporciona ese análisis de horizonte $360^\circ$, iluminación solar y visibilidad DTE de forma instantánea y abierta.
