# data/lola_dem — Modelos digitales de elevación LOLA

**Propietario:** `astro-terrain-specialist`. Los GeoTIFF y la caché **no** se versionan en git.

## Productos candidatos (confirmar nombre exacto y licencia antes de descargar)

| Producto | Resolución | Cobertura | Fuente |
|----------|-----------|-----------|--------|
| LOLA south polar DEM (p. ej. `LDEM_80S_20M*`) | 20 m/px | 80°S–90°S | NASA GSFC PGDA / PDS Geosciences Node |
| LOLA high-res site DEMs (Barker et al.) | 5 m/px | Sitios candidatos Artemis | NASA GSFC PGDA |
| LOLA global (`LDEM_64` / `SLDEM2015`) | ~118 m / ~59 m | Global (sitios no polares) | PDS Geosciences Node |

## Proyección esperada (verificar en la etiqueta `.lbl` / metadatos GeoTIFF)

```
+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs
```

Alturas relativas a la esfera de 1737.4 km (comprobar unidades: m vs km y `SCALING_FACTOR`).

## Estructura

```
lola_dem/
├── README.md        (este manifiesto)
├── raw/             (GeoTIFF descargados, ignorados por git)
└── cache/           (perfiles de horizonte .npz por sitio/DEM/parámetros)
```
