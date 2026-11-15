# data/lola_dem — LOLA Digital Elevation Models

**Owner:** `astro-terrain-specialist`. GeoTIFF files and cache are **not** committed to git.

## Candidate Products (confirm exact name and license before downloading)

| Product | Resolution | Coverage | Source |
|---------|------------|----------|--------|
| LOLA south polar DEM (e.g. `LDEM_80S_20M*`) | 20 m/px | 80°S–90°S | NASA GSFC PGDA / PDS Geosciences Node |
| LOLA high-res site DEMs (Barker et al.) | 5 m/px | Artemis candidate sites | NASA GSFC PGDA |
| LOLA global (`LDEM_64` / `SLDEM2015`) | ~118 m / ~59 m | Global (non-polar sites) | PDS Geosciences Node |

## Expected Projection (verify in `.lbl` label / GeoTIFF metadata)

```
+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs
```

Heights relative to the 1737.4 km reference sphere (verify units: m vs km and `SCALING_FACTOR`).

## Structure

```
lola_dem/
├── README.md        (this manifest)
├── raw/             (downloaded GeoTIFFs, gitignored)
└── cache/           (.npz horizon profiles by site/DEM/parameters)
```
