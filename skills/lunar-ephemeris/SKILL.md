---
name: lunar-ephemeris
description: >-
  Use this skill when computing or validating the apparent azimuth/elevation of the Sun and the Earth as seen from a
  point on the lunar surface (selenographic lat/lon), including physical libration (MOON_PA/MOON_ME frames), SPICE
  kernels DE421/DE440, Skyfield usage, light-time/aberration, and validation against JPL Horizons fixtures.
---

# Lunar Ephemeris — Sol y Tierra desde la superficie lunar

Ecuaciones: `docs/MATH_MODELS.md §1` y `§3.1`. Propietario del código: `astro-terrain-specialist` (`backend/app/services/ephemeris.py`).

## 1. Kernels necesarios (ver `data/ephemeris/README.md`)

| Kernel | Para qué |
|--------|----------|
| `de421.bsp` | Posiciones de Sol, Tierra, Luna (1900–2050) |
| `moon_pa_de421_1900-2050.bpc` | Libración física (ángulos de Euler) → MOON_PA |
| `moon_080317.tf` | Rotación fija MOON_PA → **MOON_ME** (marco de LOLA) |
| `pck00008.tpc` | Constantes de texto requeridas por `PlanetaryConstants` |

Para DE440 usar `de440s.bsp` + `moon_pa_de440_*.bpc` + `moon_de440_*.tf` (comprobar nombres exactos en NAIF). **Nunca** mezclar el `.bpc` de un DE con el `.tf` de otro.

## 2. Receta Skyfield (patrón de la documentación oficial "Planetary reference frames")

```python
from skyfield.api import load, PlanetaryConstants

ts = load.timescale()
eph = load("data/ephemeris/de421.bsp")
pc = PlanetaryConstants()
pc.read_text(load("data/ephemeris/moon_080317.tf"))
pc.read_text(load("data/ephemeris/pck00008.tpc"))
pc.read_binary(load("data/ephemeris/moon_pa_de421_1900-2050.bpc"))
frame = pc.build_frame_named("MOON_ME_DE421")          # MOON_ME, incluye libración física

moon = eph["moon"]
site = moon + pc.build_latlon_degrees(frame, lat_deg, lon_deg, elevation_m)

t = ts.utc(2027, 1, 1, range(0, 24 * 30))               # vectorizado: 30 días, paso 1 h
for body_name in ("sun", "earth"):
    app = site.at(t).observe(eph[body_name]).apparent()  # tiempo-luz + aberración; SIN refracción
    alt, az, dist = app.altaz()                         # alt/az respecto a la normal de la esfera
```

Reglas:
- `altaz()` **sin** argumentos de temperatura/presión (no hay atmósfera).
- `elevation_m` = altura DEM + mástil, relativa a R = 1737.4 km.
- Cargar kernels **una vez** (singleton/`lru_cache`), no por petición.
- Convertir a grados solo en la frontera de la API.
- Usar `load` con directorio explícito (`Loader("data/ephemeris")`) y **sin descarga implícita** en producción/tests.

## 3. Validación contra JPL Horizons (oráculo RT-01)

Generación de fixtures (script de QA, única parte con red; resultados versionados en `backend/tests/fixtures/horizons/`):

```
GET https://ssd.jpl.nasa.gov/api/horizons.api
  format=json  MAKE_EPHEM=YES  EPHEM_TYPE=OBSERVER
  COMMAND='10'            (Sol)   |  '399' (Tierra)
  CENTER='coord@301'      COORD_TYPE='GEODETIC'
  SITE_COORD='<lon_E_deg>,<lat_deg>,<alt_km>'
  START_TIME='2027-01-01'  STOP_TIME='2027-01-31'  STEP_SIZE='1 h'
  QUANTITIES='4'          (Az/El aparentes)
  ANG_FORMAT='DEG'  APPARENT='AIRLESS'  CSV_FORMAT='YES'  TIME_ZONE='+00:00'
```

- Confirmar en la cabecera de la respuesta qué marco de cuerpo usa Horizons para la Luna (ME vs PA) y anotarlo en la fixture.
- Horizons mide Az desde el norte hacia el este (igual que nuestro contrato).
- Tolerancias (`MATH_MODELS.md §6`): ≤ 0.01° objetivo, ≤ 0.05° aceptación. Error > 0.05° → revisar marco (PA vs ME ≈ 0.02°–0.03°), escala de tiempo (UTC vs TDB) y signo de longitud.

## 4. Sanity checks físicos (tests baratos sin Horizons)

| Caso | Expectativa |
|------|-------------|
| Polo sur (≈ −89.9°) durante 1 año | \|e_Sol\| ≲ 1.6° (oblicuidad lunar 1.54° + paralaje) |
| Polo sur, 1 mes | e_Tierra oscila ≈ ±6.7° (libración en latitud) |
| Apollo 11 | e_Tierra ≈ 60°–75°, siempre > 0 |
| Chang'e 4 (cara oculta) | e_Tierra < 0 siempre → DTE = 0 % |
| Cualquier sitio | α_Sol ∈ [0.262°, 0.272°]; α_Tierra ∈ [0.89°, 1.03°] |

## 5. Errores frecuentes

- Usar el marco IAU_MOON (modelo de rotación simplificado) en vez de MOON_ME → errores de cientos de metros en superficie.
- Longitudes 0–360 vs ±180 mezcladas → normalizar en la entrada.
- Pedir a Horizons `APPARENT='REFRACTED'` (no aplica en la Luna y falsea el oráculo).
- Kernels fuera de rango temporal (DE421 termina en 2050) → validar `TimeWindow` y devolver `ErrorResponse`.
