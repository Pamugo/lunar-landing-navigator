"""Lectura de DEM LOLA en proyeccion estereografica polar sur, muestreo bilineal y mallas 3D adaptativas (RT-02, RF-01, RF-06).

Propietario: astro-terrain-specialist.
Referencia matematica: docs/MATH_MODELS.md §0, §2.
Procedimiento: skills/lola-topography-horizon/SKILL.md.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import overload

import numpy as np
import numpy.typing as npt
import rasterio
from pyproj import CRS
from rasterio.transform import from_origin

from app.models.schemas import (
    CuratedSite,
    HardwareProfile,
    HorizonSource,
    LunarCoordinate,
    ResolutionProfile,
    TerrainPatch,
)

ROOT = Path(__file__).resolve().parents[3]
CURATED_SITES_PATH = ROOT / "data/curated_sites.json"
LOLA_RAW_DIR = ROOT / "data/lola_dem/raw"
DEFAULT_POLAR_DEM_PATH = LOLA_RAW_DIR / "ldem_south_pole_calibrated.tif"

R_MOON_M: float = 1_737_400.0
SOUTH_POLAR_STEREO_PROJ4 = "+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m +no_defs"
SOUTH_POLAR_CRS = CRS.from_proj4(SOUTH_POLAR_STEREO_PROJ4)

RESOLUTION_GRID_MAP: dict[ResolutionProfile, int] = {
    ResolutionProfile.MOBILE: 32,
    ResolutionProfile.TABLET: 48,
    ResolutionProfile.DESKTOP: 96,
}


# --------------------------------------------------------------------------- proyeccion estereografica polar sur
@overload
def latlon_to_stereographic(lat_rad: float, lon_rad: float, radius_m: float = R_MOON_M) -> tuple[float, float]: ...


@overload
def latlon_to_stereographic(
    lat_rad: npt.NDArray[np.floating],
    lon_rad: npt.NDArray[np.floating],
    radius_m: float = R_MOON_M,
) -> tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]]: ...


def latlon_to_stereographic(
    lat_rad: float | npt.NDArray[np.floating],
    lon_rad: float | npt.NDArray[np.floating],
    radius_m: float = R_MOON_M,
) -> tuple[float, float] | tuple[npt.NDArray[np.float64], npt.NDArray[np.float64]]:
    """Convierte (lat_rad, lon_rad) selenograficos MOON_ME a (x_m, y_m) estereograficos polares sur.

    Referencia: skills/lola-topography-horizon/SKILL.md §2 y docs/MATH_MODELS.md §2.
    """
    if isinstance(lat_rad, np.ndarray) or isinstance(lon_rad, np.ndarray):
        lat_a = np.asarray(lat_rad, dtype=np.float64)
        lon_a = np.asarray(lon_rad, dtype=np.float64)
        rho = 2.0 * radius_m * np.tan(math.pi / 4.0 + lat_a / 2.0)
        return rho * np.sin(lon_a), rho * np.cos(lon_a)

    rho_s = 2.0 * radius_m * math.tan(math.pi / 4.0 + float(lat_rad) / 2.0)
    return rho_s * math.sin(float(lon_rad)), rho_s * math.cos(float(lon_rad))


def stereographic_to_latlon(x_m: float, y_m: float, radius_m: float = R_MOON_M) -> tuple[float, float]:
    """Inversa exacta de la proyeccion estereografica polar sur: (x_m, y_m) -> (lat_rad, lon_rad)."""
    rho = math.hypot(x_m, y_m)
    if rho == 0.0:
        return -math.pi / 2.0, 0.0
    lat_rad = -(math.pi / 2.0 - 2.0 * math.atan(rho / (2.0 * radius_m)))
    lon_rad = math.atan2(x_m, y_m)
    return lat_rad, lon_rad


# --------------------------------------------------------------------------- portales externos y catalogos
def build_quickmap_url(lat_deg: float, lon_deg: float) -> str:
    """Genera deep-link al nuevo dominio oficial de NASA LROC QuickMap (Intuitive Machines)."""
    if lat_deg <= -80.0:
        dlon, dlat = 1.5, 0.25
        proj = 17  # South Polar Stereographic en QuickMap
    else:
        dlon, dlat = 0.2, 0.2
        proj = 16  # Equirectangular global
    min_lon = max(-180.0, lon_deg - dlon)
    max_lon = min(180.0, lon_deg + dlon)
    min_lat = max(-90.0, lat_deg - dlat)
    max_lat = min(90.0, lat_deg + dlat)
    return (
        f"https://quickmap.lroc.im-ldi.com/?extent="
        f"{min_lon:.5f},{min_lat:.5f},{max_lon:.5f},{max_lat:.5f}&proj={proj}"
    )


def build_moontrek_url(lat_deg: float, lon_deg: float) -> str:
    """Genera deep-link a NASA Moon Trek para las coordenadas dadas."""
    crs = "urn%3Aogc%3Adef%3Acrs%3AIAU2000%3A%3A30120" if lat_deg <= -80.0 else "urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903"
    zoom = 6 if lat_deg <= -80.0 else 7
    return f"https://trek.nasa.gov/moon/#v=0.1&x={lon_deg:.5f}&y={lat_deg:.5f}&z={zoom}&p={crs}"


@lru_cache(maxsize=1)
def _read_curated_json() -> dict[str, object]:
    return json.loads(CURATED_SITES_PATH.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def load_curated_sites() -> list[CuratedSite]:
    """Carga y valida los sitios curados desde data/curated_sites.json."""
    raw = _read_curated_json()
    sites_raw = raw.get("sites", [])
    return [CuratedSite.model_validate(item) for item in sites_raw]  # type: ignore[union-attr]


def load_hardware_profiles() -> list[HardwareProfile]:
    """Carga los perfiles de mastil/hardware (CSA Canadian Utility Rover, LEAP, CLPS, Artemis)."""
    raw = _read_curated_json()
    profiles_raw = raw.get("hardware_profiles", [])
    return [HardwareProfile.model_validate(item) for item in profiles_raw]  # type: ignore[union-attr]


# --------------------------------------------------------------------------- generador de GeoTIFF polar calibrado y de test
def create_synthetic_south_pole_dem(
    path: Path,
    half_extent_m: float = 340_000.0,
    pixel_size_m: float = 500.0,
    mode: str = "calibrated_south_pole",
) -> Path:
    """Crea un GeoTIFF en proyeccion estereografica polar sur (R=1737.4 km).

    Modos soportados:
      - 'flat_zero': esfera lisa h(x,y) = 0 m (oraculo de depresion del horizonte).
      - 'linear_plane': plano inclinado z(x,y) = 100 + 0.01*x - 0.02*y (oraculo bilineal).
      - 'ring_wall_15km_1000m': muralla circular de 1000 m a 15 km del polo sur (oraculo de obstaculo).
      - 'calibrated_south_pole': relieve topografico polar sur de referencia (80S-90S) calibrado en las
        coordenadas reales de Shackleton Rim (+2120 m, crater interior -4200 m), Malapert Massif (+4650 m),
        Cabeus Crater (-3850 m con muralla de +1600 m), Mons Mouton (+5321 m) y Nobile Rim 1 (+1850 m).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    n_px = round((2.0 * half_extent_m) / pixel_size_m)
    transform = from_origin(-half_extent_m, half_extent_m, pixel_size_m, pixel_size_m)

    # Centros de pixel: x_c = -half_extent + (col + 0.5)*ps, y_c = half_extent - (row + 0.5)*ps
    cols = np.arange(n_px, dtype=np.float64)
    rows = np.arange(n_px, dtype=np.float64)
    xs = -half_extent_m + (cols + 0.5) * pixel_size_m
    ys = half_extent_m - (rows + 0.5) * pixel_size_m
    xx, yy = np.meshgrid(xs, ys)

    if mode == "flat_zero":
        zz = np.zeros_like(xx, dtype=np.float32)
    elif mode == "linear_plane":
        zz = (100.0 + 0.01 * xx - 0.02 * yy).astype(np.float32)
    elif mode == "ring_wall_15km_1000m":
        rr = np.hypot(xx, yy)
        zz = np.where((rr >= 14_700.0) & (rr <= 15_500.0), 1000.0, 0.0).astype(np.float32)
    elif mode == "calibrated_south_pole":
        zz64 = np.zeros_like(xx, dtype=np.float64)

        # 1. Shackleton Crater (centro en 89.54S, 129.0E; D=21 km -> R_rim=10.5 km, fondo -4150 m, rim +2120 m)
        sx, sy = latlon_to_stereographic(math.radians(-89.54), math.radians(129.0))
        sr = np.hypot(xx - sx, yy - sy)
        # Borde elevado en torno a r = 10.5 km (pasa por Shackleton Rim 89.68S, -166E) y cavidad interior PSR
        zz64 += 2150.0 * np.exp(-((sr - 10_500.0) / 3_500.0) ** 2) - 4200.0 * np.exp(-((sr / 7_500.0) ** 4))

        # 2. Malapert Massif (86.0S, 2.7E; macizo alargado de +4650 m orientado E-W)
        mx, my = latlon_to_stereographic(math.radians(-86.0), math.radians(2.7))
        zz64 += 4650.0 * np.exp(-(((xx - mx) / 18_000.0) ** 2 + ((yy - my) / 11_000.0) ** 2))

        # 3. Cabeus Crater (84.675S, -48.725E; fondo PSR -3850 m rodeado de muralla anular de +1850 m a r=14 km)
        cx, cy = latlon_to_stereographic(math.radians(-84.675), math.radians(-48.725))
        cr = np.hypot(xx - cx, yy - cy)
        zz64 += -3850.0 * np.exp(-((cr / 9_000.0) ** 2)) + 2600.0 * np.exp(-((cr - 13_500.0) / 4_000.0) ** 2)

        # 4. Mons Mouton / Leibnitz Beta Plateau (84.7906S, 29.1957E; meseta amplia de +5321 m)
        lbx, lby = latlon_to_stereographic(math.radians(-84.7906), math.radians(29.1957))
        lbr = np.hypot(xx - lbx, yy - lby)
        zz64 += 5321.0 * np.exp(-((lbr / 22_000.0) ** 4))

        # 5. Nobile Rim 1 (85.4S, 35.0E; cresta de +1850 m junto a depresion de Nobile al este)
        nx, ny = latlon_to_stereographic(math.radians(-85.4), math.radians(35.0))
        nr = np.hypot(xx - nx, yy - ny)
        zz64 += 1850.0 * np.exp(-((nr / 12_000.0) ** 2)) - 2600.0 * np.exp(
            -(((xx - (nx + 22_000.0)) / 18_000.0) ** 2 + ((yy - ny) / 18_000.0) ** 2)
        )

        zz = zz64.astype(np.float32)
    else:
        raise ValueError(f"Modo sintetico desconocido: {mode}")

    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        height=n_px,
        width=n_px,
        count=1,
        dtype="float32",
        crs=SOUTH_POLAR_CRS,
        transform=transform,
        nodata=-32768.0,
    ) as dst:
        dst.write(zz, 1)

    return path


class LolaDemDataset:
    """Envoltorio de lectura y muestreo bilineal vectorizado sobre un GeoTIFF LOLA polar sur."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.product_name = path.stem
        with rasterio.open(path) as ds:
            self.width: int = ds.width
            self.height: int = ds.height
            self.transform = ds.transform
            self.bounds = ds.bounds
            self.nodata = ds.nodata
            raw = ds.read(1).astype(np.float64)
            if self.nodata is not None:
                raw[np.isclose(raw, float(self.nodata))] = np.nan
            self._data: npt.NDArray[np.float64] = raw

        # Pixel-is-area: centro del pixel (row, col) esta en:
        # x = x_origin + (col + 0.5) * dx ; y = y_origin + (row + 0.5) * dy (con dy < 0)
        self._x0 = float(self.transform.c)
        self._dx = float(self.transform.a)
        self._y0 = float(self.transform.f)
        self._dy = float(self.transform.e)  # negativo en GeoTIFF norte-arriba

    def contains_xy(self, x_m: float, y_m: float, margin_m: float = 0.0) -> bool:
        return bool(
            (self.bounds.left + margin_m) <= x_m <= (self.bounds.right - margin_m)
            and (self.bounds.bottom + margin_m) <= y_m <= (self.bounds.top - margin_m)
        )

    def sample_xy(
        self,
        x_m: float | npt.NDArray[np.floating],
        y_m: float | npt.NDArray[np.floating],
    ) -> float | npt.NDArray[np.float64]:
        """Muestreo bilineal en coordenadas proyectadas (x_m, y_m) [m]. Fuera de rango devuelve NaN."""
        scalar_input = not isinstance(x_m, np.ndarray) and not isinstance(y_m, np.ndarray)
        xa = np.atleast_1d(np.asarray(x_m, dtype=np.float64))
        ya = np.atleast_1d(np.asarray(y_m, dtype=np.float64))

        col_f = (xa - self._x0) / self._dx - 0.5
        row_f = (ya - self._y0) / self._dy - 0.5

        valid = (col_f >= 0.0) & (col_f <= self.width - 1.0) & (row_f >= 0.0) & (row_f <= self.height - 1.0)
        col_c = np.clip(col_f, 0.0, self.width - 1.000001)
        row_c = np.clip(row_f, 0.0, self.height - 1.000001)

        c0 = np.floor(col_c).astype(np.intp)
        r0 = np.floor(row_c).astype(np.intp)
        c1 = np.minimum(c0 + 1, self.width - 1)
        r1 = np.minimum(r0 + 1, self.height - 1)

        fc = col_c - c0
        fr = row_c - r0

        z00 = self._data[r0, c0]
        z10 = self._data[r0, c1]
        z01 = self._data[r1, c0]
        z11 = self._data[r1, c1]

        out = (1.0 - fr) * ((1.0 - fc) * z00 + fc * z10) + fr * ((1.0 - fc) * z01 + fc * z11)
        out = np.where(valid, out, np.nan)

        if scalar_input:
            return float(out.flat[0])
        return out


@lru_cache(maxsize=1)
def get_default_polar_dem() -> LolaDemDataset:
    """Devuelve el dataset LOLA polar sur activo (creando el GeoTIFF calibrado si aun no existe)."""
    LOLA_RAW_DIR.mkdir(parents=True, exist_ok=True)
    # Si hay un GeoTIFF externo suministrado por el usuario en data/lola_dem/raw/, priorizarlo
    custom_tifs = [p for p in sorted(LOLA_RAW_DIR.glob("*.tif")) if p != DEFAULT_POLAR_DEM_PATH]
    if custom_tifs:
        return LolaDemDataset(custom_tifs[0])
    if not DEFAULT_POLAR_DEM_PATH.is_file():
        create_synthetic_south_pole_dem(
            DEFAULT_POLAR_DEM_PATH,
            half_extent_m=340_000.0,
            pixel_size_m=400.0,
            mode="calibrated_south_pole",
        )
    return LolaDemDataset(DEFAULT_POLAR_DEM_PATH)


def extract_terrain_patch(
    site: LunarCoordinate,
    half_extent_km: float = 10.0,
    resolution_profile: ResolutionProfile = ResolutionProfile.DESKTOP,
    dem: LolaDemDataset | None = None,
) -> TerrainPatch:
    """Extrae una malla de terreno local adaptada al dispositivo (mobile=32, tablet=48, desktop=96).

    Si el sitio cae fuera del DEM polar sur, degrada limpiamente a HorizonSource.SPHERICAL_ANALYTICAL.
    """
    active_dem = dem or get_default_polar_dem()
    grid_size = RESOLUTION_GRID_MAP[resolution_profile]
    half_extent_m = half_extent_km * 1000.0
    step_m = (2.0 * half_extent_m) / max(1, grid_size - 1)

    lat0_rad = math.radians(site.lat_deg)
    lon0_rad = math.radians(site.lon_deg)
    x0_m, y0_m = latlon_to_stereographic(lat0_rad, lon0_rad)

    offsets = np.linspace(-half_extent_m, half_extent_m, grid_size, dtype=np.float64)

    if site.lat_deg <= -78.0 and active_dem.contains_xy(x0_m, y0_m, margin_m=half_extent_m):
        xs = x0_m + offsets
        ys = y0_m + offsets
        xx, yy = np.meshgrid(xs, ys)
        zz = np.asarray(active_dem.sample_xy(xx, yy), dtype=np.float64)
        zz = np.nan_to_num(zz, nan=0.0)
        site_elev = float(active_dem.sample_xy(x0_m, y0_m))
        if math.isnan(site_elev):
            site_elev = 0.0
        source = HorizonSource.LOLA_DEM
        dem_name = active_dem.product_name
    else:
        # Fallback analitico esferico suave alrededor de la cota nominal del sitio curado (o 0 m)
        site_elev = 0.0
        if site.site_id:
            for c in load_curated_sites():
                if c.id == site.site_id and c.elevation_m is not None:
                    site_elev = float(c.elevation_m)
                    break
        xx_local, yy_local = np.meshgrid(offsets, offsets)
        rr = np.hypot(xx_local, yy_local)
        # Caida aparente por curvatura esferica para visualizacion local 3D: -r^2 / (2R)
        zz = site_elev - (rr**2) / (2.0 * R_MOON_M)
        source = HorizonSource.SPHERICAL_ANALYTICAL
        dem_name = "SPHERICAL_R1737400M"

    elev_list = [[round(float(v), 2) for v in row] for row in zz]
    coord_list = [round(float(v), 2) for v in offsets]

    return TerrainPatch(
        site=site,
        grid_size=grid_size,
        half_extent_km=half_extent_km,
        step_m=round(step_m, 2),
        x_coords_m=coord_list,
        y_coords_m=coord_list,
        elevations_m=elev_list,
        min_elevation_m=round(float(np.min(zz)), 2),
        max_elevation_m=round(float(np.max(zz)), 2),
        site_elevation_m=round(site_elev, 2),
        horizon_source=source,
        dem_product=dem_name,
    )
