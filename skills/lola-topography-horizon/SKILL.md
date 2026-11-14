---
name: lola-topography-horizon
description: >-
  Use this skill when reading LOLA digital elevation models (GeoTIFF/IMG in south polar stereographic projection),
  converting between lat/lon and projected coordinates, sampling terrain heights, or computing the 360-degree local
  topographic horizon profile on the airless Moon (no refraction, sphere R = 1737.4 km) by great-circle raycasting.
---

# LOLA Topography & Horizon — Horizonte 360° sin atmósfera

Ecuaciones: `docs/MATH_MODELS.md §2`. Oráculos: `backend/tests/oracles/horizon_oracle.py`, `backend/tests/test_horizon_geometry.py`.
Propietario del código: `astro-terrain-specialist` (`backend/app/services/terrain.py`, `horizon.py`).

## 1. Datos

- Producto principal: DEM polar sur LOLA (20 m/px, 80°S–90°S) de NASA GSFC PGDA / PDS Geosciences. Ver `data/lola_dem/README.md`.
- Antes de usar un producto, **leer sus metadatos** y anotar en `VALIDATION_LOG.md`: CRS, resolución, unidades de altura, `nodata`, *pixel-is-area* vs *pixel-is-point*.

## 2. Proyección estereográfica polar sur (esfera R = 1 737 400 m, verdadera escala en el polo)

```
+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs
```

Fórmulas de referencia (oráculo para tests; en producción usar `pyproj.Transformer` con el CRS del GeoTIFF):

- Directa: `rho = 2R·tan(π/4 + φ/2)`, `x = rho·sin λ`, `y = rho·cos λ`
- Inversa: `rho = hypot(x, y)`, `φ = −(π/2 − 2·atan(rho / 2R))`, `λ = atan2(x, y)`
- Factor de escala: `k = 2 / (1 − sin φ)` (=1 en el polo sur, φ = −90°).

## 3. Lectura con Rasterio

```python
import rasterio
from rasterio.windows import from_bounds

with rasterio.open(path) as ds:
    crs, transform, nodata = ds.crs, ds.transform, ds.nodata
    win = from_bounds(x0 - L, y0 - L, x0 + L, y0 + L, transform)   # solo la ventana del alcance L
    z = ds.read(1, window=win, masked=True).astype("float64")      # convertir unidades si km
    win_transform = ds.window_transform(win)
```

- Muestreo **bilineal** en coordenadas de píxel fraccionarias (`~win_transform * (x, y)`); `nodata` → `NaN` y se ignora en el máximo.
- Nunca cargar el DEM completo de 80°S–90°S en memoria por petición; ventana + caché.

## 4. Algoritmo de perfil de horizonte

Para cada acimut `A_k = k·ΔA` (ΔA = 0.5° por defecto; 0.1° en Modo Ingeniero):

1. Generar distancias `s_j` desde `Δs` hasta `L` (Δs ≈ resolución DEM; adaptativo `max(p, s·tan(ΔA/2))` permitido).
2. Punto de destino sobre **círculo máximo** (no recta en el plano proyectado):
   `φ_j = asin(sin φ0·cos δ + cos φ0·sin δ·cos A)`, `λ_j = λ0 + atan2(sin A·sin δ·cos φ0, cos δ − sin φ0·sin φ_j)`, con `δ = s_j / R`.
3. Proyectar `(φ_j, λ_j)` → `(x, y)` → altura `h_j` (bilineal).
4. `γ_j = atan2((h_j − h0) − 2·r_j·sin²(δ/2), r_j·sin δ)` con `r_j = R + h_j`, `h0 = h_DEM(sitio) + h_mástil`.
5. `γ_h(A_k) = max_j γ_j`; guardar también la distancia del máximo (para 3D y explicación educativa).
6. Si algún `(x, y)` sale del DEM → `truncated = True`.

Vectorizar con NumPy: matriz `(n_A, n_s)` (720 × 7500 ≈ 5.4 M muestras para L = 150 km, Δs = 20 m) — cabe en memoria.
Caché: `data/lola_dem/cache/horizon_<site>_<dem>_<ΔA>_<L>_<h_mast>.npz`.

## 5. Parámetros por defecto

| Parámetro | Valor | Motivo |
|-----------|-------|--------|
| `L` (alcance) | 150 km | Macizos de ~5 km visibles hasta ≈ 134 km (`MATH_MODELS §2.2.4`) |
| `ΔA` | 0.5° | Disco solar ≈ 0.53°: resolución comparable |
| `h_mástil` | 2 m | Altura típica de panel/antena; configurable |

## 6. Verificación obligatoria antes de usar datos reales

1. DEM sintético plano (alturas 0) → `γ_h(A) = −arccos(R/(R+h0))` para todo A (error < 1e-6 rad).
2. DEM sintético con muro/cono conocido → `γ_h` coincide con la fórmula analítica en su acimut.
3. Ida y vuelta de proyección `(φ, λ) → (x, y) → (φ, λ)` con error < 1e-9°.
4. Comparación cualitativa con mapas de iluminación publicados (Mazarico et al., 2011) para Shackleton y Malapert.

## 7. Errores frecuentes

- Alturas en km tratadas como m (o viceversa) → horizontes absurdos de ±80°.
- Rayos como rectas en el plano estereográfico → error creciente con la distancia y cerca del polo.
- Olvidar la curvatura (`2·r·sin²(δ/2)`) → horizonte sobreestimado a > 10 km.
- Acimut "norte" cerca del polo: el norte local apunta en dirección opuesta al polo, no hacia +y del mapa.
- Añadir refracción: **prohibido** (RT-03).
