# backend/app/services — Motor científico

**Propietario exclusivo:** `astro-terrain-specialist`. Ningún otro agente edita este directorio.

Módulos previstos (Sprint 1), cada uno precedido por su test de oráculo en `backend/tests/`:

| Módulo | Función | Oráculo |
|--------|---------|---------|
| `ephemeris.py` | Az/El aparentes sin refracción de Sol/Tierra en MOON_ME (Skyfield) | `test_ephemeris_oracle.py` (fixtures JPL Horizons) |
| `terrain.py` | Carga GeoTIFF LOLA, proyección estereográfica polar, muestreo bilineal | `test_terrain_projection.py` (Sprint 1) |
| `horizon.py` | Perfil de horizonte 360° por raycasting sobre círculos máximos | `test_horizon_geometry.py` (`tests/oracles/horizon_oracle.py`) |
| `visibility.py` | Estados, fracción de disco, eventos sunset/earthset, métricas | `test_horizon_geometry.py`, `test_visibility_metrics.py` (Sprint 2) |

Reglas: funciones puras, radianes internamente, sin I/O de red, ecuaciones referenciadas a `docs/MATH_MODELS.md` (§ número) en el docstring.
