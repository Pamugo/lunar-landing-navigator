# data/ephemeris — Kernels SPICE

**Propietario:** `astro-terrain-specialist`. Los binarios **no** se versionan en git (ver `.gitignore`).

| Fichero | Uso | Origen (NAIF generic_kernels) |
|---------|-----|-------------------------------|
| `de421.bsp` | Posiciones Sol/Tierra/Luna 1900–2050 | `spk/planets/de421.bsp` |
| `moon_pa_de421_1900-2050.bpc` | Orientación física de la Luna (libración) → marco MOON_PA | `pck/moon_pa_de421_1900-2050.bpc` |
| `moon_080317.tf` | Definición de MOON_ME / MOON_PA para DE421 | `fk/satellites/moon_080317.tf` |
| `pck00008.tpc` | Constantes planetarias de texto requeridas por Skyfield | `pck/pck00008.tpc` |
| *(opcional)* `de440s.bsp` + `moon_pa_de440_*.bpc` + `moon_de440_*.tf` | Ampliación a DE440 (1849–2150) | `spk/planets/`, `pck/`, `fk/satellites/` |

Descarga reproducible prevista en Sprint 1 (`scripts/fetch_kernels.py`, con verificación de tamaño/hash registrada en `docs/VALIDATION_LOG.md`).
Fuente: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
