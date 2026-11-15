# data/ephemeris — SPICE Kernels

**Owner:** `astro-terrain-specialist`. Binaries are **not** committed to git (see `.gitignore`).

| File | Purpose | Source (NAIF generic_kernels) |
|------|---------|-------------------------------|
| `de421.bsp` | Sun/Earth/Moon positions 1900–2050 | `spk/planets/de421.bsp` |
| `moon_pa_de421_1900-2050.bpc` | Lunar physical orientation (libration) -> MOON_PA frame | `pck/moon_pa_de421_1900-2050.bpc` |
| `moon_080317.tf` | MOON_ME / MOON_PA definition for DE421 | `fk/satellites/moon_080317.tf` |
| `pck00008.tpc` | Text planetary constants required by Skyfield | `pck/pck00008.tpc` |
| *(optional)* `de440s.bsp` + `moon_pa_de440_*.bpc` + `moon_de440_*.tf` | Extension to DE440 (1849–2150) | `spk/planets/`, `pck/`, `fk/satellites/` |

Reproducible download workflow (`scripts/fetch_kernels.py`, with size/hash verification recorded in `docs/VALIDATION_LOG.md`).
Source: https://naif.jpl.nasa.gov/pub/naif/generic_kernels/
