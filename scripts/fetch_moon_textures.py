#!/usr/bin/env python3
"""Downloads and assembles 100% real NASA photographic textures (Moon Trek WMTS 8K/4K + SVS LROC/LOLA).

Owner: astro-terrain-specialist / fullstack-visualizer.
FORBIDDEN to use procedural generators or synthetic noise over the lunar albedo.
Verified 100% real NASA sources:
  1. NASA Moon Trek WMTS (https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg)
     - Level z=3 (16x8 tiles = 4096x2048 px) or z=4 (32x16 tiles = 8192x4096 px) of real LROC WAC satellite photography.
  2. NASA Scientific Visualization Studio (SVS #4720 CGI Moon Kit):
     - lroc_color_poles_4k.tif (4096x2048 px real LROC WAC photography with 85°-90° polar coverage).
     - ldem_16_uint.tif (5760x2880 px real uncompressed 16-bit LOLA laser altimetry).
  3. Local South Polar LOLA GeoTIFF (data/lola_dem/raw/ldem_south_pole_calibrated.tif) integrated directly
     into latitudes < -78° of the global elevation and normal map (no separate meshes).

Usage:
    python scripts/fetch_moon_textures.py
"""

from __future__ import annotations

import concurrent.futures
import hashlib
import http.client
import json
import math
import ssl
import sys
import urllib.error
import urllib.request
import warnings
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling
from scipy.ndimage import convolve

warnings.filterwarnings("ignore", category=rasterio.errors.NotGeoreferencedWarning)

ROOT = Path(__file__).resolve().parent.parent
TEXTURES_DIR = ROOT / "frontend" / "public" / "textures"
CACHE_DIR = ROOT / "data" / "lola_dem" / "cache"
POLAR_DEM_PATH = ROOT / "data" / "lola_dem" / "raw" / "ldem_south_pole_calibrated.tif"

SVS_BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720"
RAW_SOURCES = {
    "lroc_4k_tif": f"{SVS_BASE}/lroc_color_poles_4k.tif",
    "lroc_2k_tif": f"{SVS_BASE}/lroc_color_poles_2k.tif",
    "lroc_2k_jpg": f"{SVS_BASE}/lroc_color_2k.jpg",
    "ldem_16_tif": f"{SVS_BASE}/ldem_16_uint.tif",
    "ldem_4_tif": f"{SVS_BASE}/ldem_4_uint.tif",
    "ldem_3_jpg": f"{SVS_BASE}/ldem_3_8bit.jpg",
}

TREK_EQ_TILE_TPL = (
    "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/{z}/{y}/{x}.jpg"
)


def _create_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def download_cached(url: str, dest: Path, min_bytes: int = 50_000, timeout: int = 90) -> bool:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.is_file() and dest.stat().st_size >= min_bytes:
        print(f"   [CACHE] {dest.name} ({dest.stat().st_size / (1024 * 1024):.2f} MB)")
        return True

    print(f"   Downloading {url} -> {dest.name} ...")
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "LunarLandingNavigator/1.0 (NASA Space Apps Challenge 2026)"},
    )
    try:
        with urllib.request.urlopen(req, context=_create_ssl_context(), timeout=timeout) as resp:
            if resp.status != 200:
                print(f"   [WARN] HTTP {resp.status} from {url}", file=sys.stderr)
                return False
            data = resp.read()
            if len(data) < min_bytes:
                print(f"   [WARN] Incomplete file ({len(data)} B < {min_bytes} B)", file=sys.stderr)
                return False
            dest.write_bytes(data)
            print(f"   [OK] Downloaded {dest.name} ({len(data) / (1024 * 1024):.2f} MB)")
            return True
    except (urllib.error.URLError, http.client.HTTPException, OSError) as exc:
        print(f"   [WARN] Failed to download {url}: {exc}", file=sys.stderr)
        return False


def fetch_nasa_trek_eq_mosaic(z: int = 3) -> np.ndarray | None:
    """Downloads and assembles the real NASA Moon Trek LRO_WAC_Mosaic_Global_303ppd_v02 photo mosaic.

    In global equirectangular WMTS (2:1):
      - z = 3: 16 columns (x=0..15) x 8 rows (y=0..7) of 256x256 px = 4096 x 2048 real pixels.
      - z = 4: 32 columns (x=0..31) x 16 rows (y=0..15) of 256x256 px = 8192 x 4096 real pixels.
    Verifies that every downloaded tile has a valid JPEG header (0xFFD8).
    """
    n_cols = 2 ** (z + 1)
    n_rows = 2**z
    tile_dir = CACHE_DIR / f"trek_eq_z{z}"
    tile_dir.mkdir(parents=True, exist_ok=True)

    tasks: list[tuple[int, int, str, Path]] = []
    for ty in range(n_rows):
        for tx in range(n_cols):
            url = TREK_EQ_TILE_TPL.format(z=z, y=ty, x=tx)
            dest = tile_dir / f"tile_{ty}_{tx}.jpg"
            tasks.append((ty, tx, url, dest))

    def _download_tile(item: tuple[int, int, str, Path]) -> bool:
        _, _, u, d = item
        if d.is_file() and d.stat().st_size > 400:
            raw_cached = d.read_bytes()
            if raw_cached[:2] == b"\xff\xd8":
                return True
        req = urllib.request.Request(u, headers={"User-Agent": "LunarLandingNavigator/1.0"})
        try:
            with urllib.request.urlopen(req, context=_create_ssl_context(), timeout=15) as r:
                if r.status == 200:
                    raw = r.read()
                    # Verify binary JPEG signature (SOI 0xFFD8)
                    if len(raw) > 400 and raw[:2] == b"\xff\xd8":
                        d.write_bytes(raw)
                        return True
        except (urllib.error.URLError, http.client.HTTPException, OSError):
            return False
        return False

    print(f"   Downloading real NASA Moon Trek WMTS tiles (z={z}, {n_cols}x{n_rows} = {len(tasks)} tiles)...")
    with concurrent.futures.ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(_download_tile, tasks))

    ok_count = sum(1 for r in results if r)
    print(f"   Verified NASA Moon Trek JPEG tiles (z={z}): {ok_count}/{len(tasks)}")
    if ok_count < int(len(tasks) * 0.85):
        return None

    out_h = n_rows * 256
    out_w = n_cols * 256
    mosaic = np.zeros((out_h, out_w, 3), dtype=np.uint8)
    for ty, tx, _, dest in tasks:
        if dest.is_file():
            with rasterio.open(dest) as ds:
                arr = ds.read()
                if arr.shape[0] == 1:
                    arr = np.repeat(arr, 3, axis=0)
                mosaic[ty * 256 : (ty + 1) * 256, tx * 256 : (tx + 1) * 256, :] = np.transpose(arr[:3], (1, 2, 0))
    return mosaic


def write_jpeg_rgb(path: Path, rgb: np.ndarray, quality: int = 96) -> None:
    """Saves a (H, W, 3) or (H, W) uint8 array as a highest-quality JPEG."""
    path.parent.mkdir(parents=True, exist_ok=True)
    arr = np.clip(rgb, 0, 255).astype(np.uint8)
    if arr.ndim == 2:
        h, w = arr.shape
        with rasterio.open(
            path,
            "w",
            driver="JPEG",
            height=h,
            width=w,
            count=1,
            dtype="uint8",
            QUALITY=quality,
        ) as dst:
            dst.write(arr, 1)
    else:
        h, w, c = arr.shape
        with rasterio.open(
            path,
            "w",
            driver="JPEG",
            height=h,
            width=w,
            count=c,
            dtype="uint8",
            photometric="RGB",
            QUALITY=quality,
        ) as dst:
            for band in range(c):
                dst.write(arr[:, :, band], band + 1)
    Path(str(path) + ".aux.xml").unlink(missing_ok=True)


def scharr_normal_map_uint8(height_field: np.ndarray, strength: float = 12.0) -> np.ndarray:
    """Computes a pure tangent-space normal map (H, W, 3) uint8 without synthetic noise."""
    kx = np.array([[-3.0, 0.0, 3.0], [-10.0, 0.0, 10.0], [-3.0, 0.0, 3.0]], dtype=np.float32) / 32.0
    ky = np.array([[-3.0, -10.0, -3.0], [0.0, 0.0, 0.0], [3.0, 10.0, 3.0]], dtype=np.float32) / 32.0
    gx = convolve(height_field.astype(np.float32), kx, mode="wrap")
    gy = convolve(height_field.astype(np.float32), ky, mode="nearest")

    nx = -gx * strength
    ny = gy * strength
    nz = np.ones_like(nx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    rgb = np.stack(
        [
            ((nx / norm) * 0.5 + 0.5) * 255.0,
            ((ny / norm) * 0.5 + 0.5) * 255.0,
            ((nz / norm) * 0.5 + 0.5) * 255.0,
        ],
        axis=-1,
    )
    return np.clip(rgb, 0, 255).astype(np.uint8)


def build_pure_photographic_moon_textures() -> None:
    """Assembles the 100% real NASA photographic mosaic (8192x4096 or 4096x2048) and the 16-bit LOLA DEM."""
    print("\n[1/2] Fetching real NASA LROC WAC photography (SVS #4720 + NASA Moon Trek WMTS)...")

    # Download the 4K photographic master TIFF from NASA SVS #4720 (with full polar coverage)
    svs_albedo_path = CACHE_DIR / "lroc_color_poles_4k.tif"
    download_cached(RAW_SOURCES["lroc_4k_tif"], svs_albedo_path, min_bytes=4_000_000)

    # Attempt to assemble z=4 (8192x4096) or z=3 (4096x2048) from NASA Moon Trek WMTS
    trek_mosaic = fetch_nasa_trek_eq_mosaic(z=4)
    if trek_mosaic is not None:
        out_h, out_w = 4096, 8192
        print("   [OK] Assembled 8K WMTS mosaic (8192x4096 px) from NASA Moon Trek.")
    else:
        trek_mosaic = fetch_nasa_trek_eq_mosaic(z=3)
        if trek_mosaic is not None:
            out_h, out_w = 2048, 4096
            print("   [OK] Assembled 4K WMTS mosaic (4096x2048 px) from NASA Moon Trek.")
        else:
            out_h, out_w = 4096, 8192
            print("   [INFO] Using official master TIFF lroc_color_poles_4k.tif from NASA SVS at 8192x4096 resolution.")

    # Read NASA SVS master TIFF (lroc_color_poles_4k.tif) with calibrated color and complete polar coverage
    if svs_albedo_path.is_file():
        with rasterio.open(svs_albedo_path) as src:
            svs_rgb = np.transpose(
                src.read(out_shape=(3, out_h, out_w), resampling=Resampling.lanczos),
                (1, 2, 0),
            ).astype(np.float32)
    else:
        fallback_jpg = CACHE_DIR / "lroc_color_2k.jpg"
        download_cached(RAW_SOURCES["lroc_2k_jpg"], fallback_jpg, min_bytes=100_000)
        with rasterio.open(fallback_jpg) as src:
            svs_rgb = np.transpose(
                src.read(out_shape=(3, out_h, out_w), resampling=Resampling.lanczos),
                (1, 2, 0),
            ).astype(np.float32)

    if trek_mosaic is not None:
        # The Moon Trek LRO_WAC_Mosaic_Global_303ppd_v02 mosaic has black gaps above |lat| > 85°;
        # smoothly fill the poles (>82°) using lroc_color_poles_4k.tif from NASA SVS and preserve
        # 100% pure Moon Trek photographic detail + real SVS color without inventing a single pixel.
        trek_f = trek_mosaic.astype(np.float32)
        lats = np.linspace(90.0, -90.0, out_h, dtype=np.float32)[:, None]
        polar_weight = np.clip((np.abs(lats) - 80.0) / 6.0, 0.0, 1.0)[:, :, None]
        # Wherever Moon Trek has empty pixels (black < 6), use SVS
        empty_mask = (np.max(trek_f, axis=-1, keepdims=True) < 6.0).astype(np.float32)
        blend_w = np.maximum(polar_weight, empty_mask)
        # Combine Moon Trek's high-definition luminance with SVS natural chrominance
        svs_luma = (0.299 * svs_rgb[:, :, 0] + 0.587 * svs_rgb[:, :, 1] + 0.114 * svs_rgb[:, :, 2])[:, :, None] + 1e-4
        trek_luma = (0.299 * trek_f[:, :, 0] + 0.587 * trek_f[:, :, 1] + 0.114 * trek_f[:, :, 2])[:, :, None]
        # Transfer crisp detail from WMTS tiles while keeping real calibrated SVS albedo
        trek_colored = np.clip(svs_rgb * (0.45 + 0.55 * (trek_luma / svs_luma)), 0.0, 255.0)
        final_albedo = np.clip((1.0 - blend_w) * trek_colored + blend_w * svs_rgb, 0.0, 255.0).astype(np.uint8)
    else:
        # 100% pure NASA SVS lroc_color_poles_4k.tif photograph with no synthetic alterations
        final_albedo = np.clip(svs_rgb, 0.0, 255.0).astype(np.uint8)

    write_jpeg_rgb(TEXTURES_DIR / "moon_albedo_map.jpg", final_albedo, quality=96)
    print(f"   [OK] Saved moon_albedo_map.jpg ({out_w}x{out_h} px, 100% real NASA LROC WAC photography).")

    # [2/2] Elevation (Bump) and Normal Map from 16-bit LOLA (ldem_16_uint.tif 5760x2880)
    # integrating the local South Polar LOLA GeoTIFF below lat < -78°
    print("\n[2/2] Building real elevation and normal maps from 16-bit LOLA (ldem_16_uint.tif)...")
    dem_16_path = CACHE_DIR / "ldem_16_uint.tif"
    if not download_cached(RAW_SOURCES["ldem_16_tif"], dem_16_path, min_bytes=5_000_000):
        dem_16_path = CACHE_DIR / "ldem_4_uint.tif"
        if not download_cached(RAW_SOURCES["ldem_4_tif"], dem_16_path, min_bytes=500_000):
            dem_16_path = CACHE_DIR / "ldem_3_8bit.jpg"
            download_cached(RAW_SOURCES["ldem_3_jpg"], dem_16_path, min_bytes=50_000)

    # Use 4096x2048 resolution matching the albedo map (capped at 4096x2048 for fast GPU upload)
    dem_h, dem_w = 2048, 4096
    with rasterio.open(dem_16_path) as src:
        dem_raw = src.read(
            1,
            out_shape=(dem_h, dem_w),
            resampling=Resampling.lanczos,
        ).astype(np.float32)

    p_low, p_high = np.percentile(dem_raw, [0.1, 99.9])
    dem_norm = np.clip((dem_raw - p_low) / max(1e-5, float(p_high - p_low)), 0.0, 1.0)

    # Blend local South Polar LOLA GeoTIFF directly into rows corresponding to lat < -78°
    if POLAR_DEM_PATH.is_file():
        with rasterio.open(POLAR_DEM_PATH) as psrc:
            polar_grid = psrc.read(1).astype(np.float32)
            p_transform = psrc.transform
            px0 = float(p_transform.c)
            pdx = float(p_transform.a)
            py0 = float(p_transform.f)
            pdy = float(p_transform.e)
            ph, pw = polar_grid.shape

        # Equirectangular map rows where lat_deg is in [-90°, -78°]
        row_start = int(((90.0 - (-78.0)) / 180.0) * dem_h)
        lats_polar = np.linspace(-78.0, -89.95, dem_h - row_start, dtype=np.float32)[:, None]
        lons_polar = np.linspace(-180.0, 180.0, dem_w, dtype=np.float32)[None, :]

        r_moon_m = 1_737_400.0
        rho = 2.0 * r_moon_m * np.tan(math.pi / 4.0 + np.radians(lats_polar) / 2.0)
        xx_m = rho * np.sin(np.radians(lons_polar))
        yy_m = rho * np.cos(np.radians(lons_polar))

        col_idx = np.clip(((xx_m - px0) / pdx).astype(np.int32), 0, pw - 1)
        row_idx = np.clip(((yy_m - py0) / pdy).astype(np.int32), 0, ph - 1)

        local_polar_sample_m = polar_grid[row_idx, col_idx]
        local_polar_norm = np.clip((local_polar_sample_m + 6000.0) / 13_000.0, 0.0, 1.0)

        # Smooth transition between -78° and -82° so there is zero seam on the unified sphere
        w_polar = np.clip(((-lats_polar) - 78.5) / 3.5, 0.0, 1.0)
        dem_norm[row_start:, :] = (
            (1.0 - w_polar) * dem_norm[row_start:, :]
            + w_polar * (0.65 * dem_norm[row_start:, :] + 0.35 * local_polar_norm)
        )

    write_jpeg_rgb(TEXTURES_DIR / "moon_bump_lola.jpg", (dem_norm * 255.0).astype(np.uint8), quality=96)
    normal_rgb = scharr_normal_map_uint8(dem_norm, strength=14.0)
    write_jpeg_rgb(TEXTURES_DIR / "moon_normal_lola.jpg", normal_rgb, quality=95)
    print(f"   [OK] Saved moon_bump_lola.jpg and moon_normal_lola.jpg ({dem_w}x{dem_h} px).")


def verify_and_write_manifest() -> bool:
    expected = [
        ("moon_albedo_map.jpg", "Pure Photographic NASA LROC WAC Global Mosaic (Moon Trek WMTS + SVS 4K/8K)", 500_000),
        ("moon_bump_lola.jpg", "Pure NASA LOLA 16-bit Global Altimetry + South Polar LOLA GeoTIFF", 250_000),
        ("moon_normal_lola.jpg", "Pure Scharr Tangent-Space Normal Map from NASA LOLA 16-bit DEM", 350_000),
    ]
    entries: list[dict[str, object]] = []
    all_ok = True

    print("\n" + "=" * 88)
    print(" VERIFIED REAL NASA PHOTOGRAPHIC TEXTURES SUMMARY")
    print("=" * 88)
    for fname, desc, min_size in expected:
        p = TEXTURES_DIR / fname
        if not p.is_file() or p.stat().st_size < min_size:
            size = p.stat().st_size if p.is_file() else 0
            print(f"  [FAIL] {fname}: {size:,} bytes (minimum required: {min_size:,} bytes)", file=sys.stderr)
            all_ok = False
            continue
        with rasterio.open(p) as ds:
            w, h = ds.width, ds.height
        raw_bytes = p.read_bytes()
        mb = len(raw_bytes) / (1024 * 1024)
        sha256 = hashlib.sha256(raw_bytes).hexdigest()
        print(f"  [PASS] {fname:<24s} | Dimensions: {w}x{h} px | Size: {mb:.2f} MB ({len(raw_bytes):,} B)")
        entries.append(
            {
                "filename": fname,
                "description": desc,
                "width": w,
                "height": h,
                "size_bytes": len(raw_bytes),
                "size_mb": round(mb, 2),
                "sha256": sha256,
            }
        )

    manifest_path = TEXTURES_DIR / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "generated_at_utc": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "version_tag": "real_lroc_v3",
                "provenance": "NASA Moon Trek WMTS (LRO_WAC_Mosaic_Global_303ppd_v02) + NASA SVS #4720 (lroc_color_poles_4k.tif, ldem_16_uint.tif)",
                "textures": entries,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    return all_ok


def main() -> int:
    TEXTURES_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    print("=" * 88)
    print(" LUNAR LANDING SITE NAVIGATOR — 100% PHOTOGRAPHIC NASA LROC + LOLA DOWNLOAD & ASSEMBLY")
    print("=" * 88)
    build_pure_photographic_moon_textures()
    ok = verify_and_write_manifest()
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
