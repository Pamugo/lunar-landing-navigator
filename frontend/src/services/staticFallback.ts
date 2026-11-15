/**
 * Static / offline scientific fallback for GitHub Pages and backend-less deployments.
 *
 * Uses backend-generated Skyfield DE421 + LOLA GeoTIFF JSON bundles under
 * `${import.meta.env.BASE_URL}static-api/` for all curated sites and preset windows,
 * with calibrated analytical selenocentric ephemeris & spherical horizon fallback
 * for arbitrary custom coordinates or dates outside the precomputed windows.
 */

import type {
  AdvancedDteMetrics,
  BodyPosition,
  ComparisonRequest,
  ComparisonResult,
  ComputationInfo,
  CuratedSite,
  EventPrediction,
  EventType,
  HardwareProfile,
  HealthResponse,
  HorizonProfile,
  HorizonRequest,
  HorizonSource,
  LunarCoordinate,
  SolarArchitectureEnergy,
  SolarEnergyRequest,
  SolarEnergySummary,
  TerrainPatch,
  TerrainPatchRequest,
  TimeWindow,
  VisibilityRequest,
  VisibilitySample,
  VisibilityState,
  VisibilityTimeSeries,
} from "../types/contracts";

const R_MOON_M = 1_737_400.0;
const R_MOON_KM = 1_737.4;
const R_SUN_KM = 695_700.0;
const R_EARTH_EQ_KM = 6_378.137;
const SOLAR_CONSTANT_AM0_W_M2 = 1368.0;
const AU_KM = 149_597_870.7;
const SPEED_OF_LIGHT_KM_S = 299_792.458;
const FREQ_S_BAND_GHZ = 2.2;
const FREQ_X_BAND_GHZ = 8.4;
const FREQ_KA_BAND_GHZ = 32.0;

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

interface BootstrapBundle {
  health: HealthResponse;
  sites: CuratedSite[];
  hardware_profiles: HardwareProfile[];
}

interface StoredHorizonEntry {
  site_elevation_m: number;
  azimuth_step_deg: number;
  dem_product: string;
  horizon_source: HorizonSource;
  max_distance_km: number;
  truncated: boolean;
  obstacle_distance_km: number[];
  elevations_by_height: Record<string, number[]>;
}

interface HorizonsBundle {
  heights_m: number[];
  sites: Record<string, StoredHorizonEntry>;
}

interface StoredTerrainPatchEntry {
  grid_size: number;
  half_extent_km: number;
  step_m: number;
  x_coords_m: number[];
  y_coords_m: number[];
  elevations_m: number[][];
  min_elevation_m: number;
  max_elevation_m: number;
  site_elevation_m: number;
  horizon_source: HorizonSource;
  dem_product: string;
}

type TerrainPatchesBundle = Record<string, StoredTerrainPatchEntry>;

/** Compact ephemeris sample: [sunAz, sunEl, sunDistKm, sunAngR, earthAz, earthEl, earthDistKm, earthAngR] */
type PackedEphemerisTuple = [number, number, number, number, number, number, number, number];

interface PresetsBundle {
  step_minutes: number;
  days: number;
  windows: Record<
    string,
    {
      times_utc: string[];
      sites: Record<string, PackedEphemerisTuple[]>;
    }
  >;
}

const jsonCache = new Map<string, Promise<unknown>>();

function loadStaticJson<T>(filename: string): Promise<T> {
  const cached = jsonCache.get(filename);
  if (cached) {
    return cached as Promise<T>;
  }
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const url = `${normalizedBase}static-api/${filename}`;
  const promise = fetch(url).then(async (res) => {
    if (!res.ok) {
      throw new Error(`Failed to load static bundle ${filename}: HTTP ${res.status}`);
    }
    return (await res.json()) as T;
  });
  jsonCache.set(filename, promise);
  return promise;
}

function roundTo(val: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(val * factor) / factor;
}

function normAzDeg(az: number): number {
  const m = az % 360.0;
  return m < 0 ? m + 360.0 : m;
}

function interpAzDeg(a: number, b: number, t: number): number {
  const diff = ((b - a + 540.0) % 360.0) - 180.0;
  return normAzDeg(a + t * diff);
}

async function resolveCuratedSiteId(site: LunarCoordinate): Promise<string | null> {
  if (site.site_id) return site.site_id;
  try {
    const boot = await loadStaticJson<BootstrapBundle>("bootstrap.json");
    for (const s of boot.sites) {
      if (Math.abs(s.lat_deg - site.lat_deg) < 1e-3 && Math.abs(s.lon_deg - site.lon_deg) < 1e-3) {
        return s.id;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function sphericalHorizonProfile(req: HorizonRequest, siteElevM = 0.0): HorizonProfile {
  const hMast = Math.max(0.0, req.site.observer_height_m);
  const dipRad = Math.acos(R_MOON_M / (R_MOON_M + hMast));
  const dipDeg = roundTo(-dipRad * RAD2DEG, 6);
  const dHorKm = roundTo((R_MOON_M * dipRad) / 1000.0, 4);
  const step = Math.max(0.1, req.azimuth_step_deg);
  const nAz = Math.max(1, Math.round(360.0 / step));

  const azimuths_deg: number[] = [];
  const horizon_elevation_deg: number[] = [];
  const obstacle_distance_km: number[] = [];
  for (let k = 0; k < nAz; k++) {
    azimuths_deg.push(roundTo(k * step, 4));
    horizon_elevation_deg.push(dipDeg);
    obstacle_distance_km.push(dHorKm);
  }

  return {
    site: req.site,
    site_elevation_m: roundTo(siteElevM, 2),
    azimuths_deg,
    horizon_elevation_deg,
    obstacle_distance_km,
    dem_product: "SPHERICAL_R1737400M",
    horizon_source: "spherical_analytical",
    max_distance_km: req.max_distance_km,
    truncated: false,
  };
}

function interpolateArrayAtDeg(arr: number[], stepDeg: number, azDeg: number): number {
  if (arr.length === 0) return 0.0;
  const wrapped = normAzDeg(azDeg);
  const idxF = wrapped / stepDeg;
  const i0 = Math.floor(idxF) % arr.length;
  const i1 = (i0 + 1) % arr.length;
  const frac = idxF - Math.floor(idxF);
  const v0 = arr[i0] ?? 0.0;
  const v1 = arr[i1] ?? v0;
  return v0 + frac * (v1 - v0);
}

export async function staticHealth(): Promise<HealthResponse> {
  const boot = await loadStaticJson<BootstrapBundle>("bootstrap.json");
  return boot.health;
}

export async function staticListSites(): Promise<CuratedSite[]> {
  const boot = await loadStaticJson<BootstrapBundle>("bootstrap.json");
  return boot.sites;
}

export async function staticListHardwareProfiles(): Promise<HardwareProfile[]> {
  const boot = await loadStaticJson<BootstrapBundle>("bootstrap.json");
  return boot.hardware_profiles;
}

export async function staticFetchHorizon(req: HorizonRequest): Promise<HorizonProfile> {
  const siteId = await resolveCuratedSiteId(req.site);
  const horizons = await loadStaticJson<HorizonsBundle>("horizons.json");
  const entry = siteId ? horizons.sites[siteId] : undefined;
  if (!entry) {
    return sphericalHorizonProfile(req);
  }

  if (entry.horizon_source === "spherical_analytical") {
    return sphericalHorizonProfile(req, entry.site_elevation_m);
  }

  const hReq = Math.max(0.0, req.site.observer_height_m);
  let nearestH = horizons.heights_m[0] ?? 2.0;
  let bestDiff = Math.abs(hReq - nearestH);
  for (const h of horizons.heights_m) {
    const diff = Math.abs(hReq - h);
    if (diff < bestDiff) {
      bestDiff = diff;
      nearestH = h;
    }
  }

  const storedElevs =
    entry.elevations_by_height[nearestH.toFixed(1)] ??
    entry.elevations_by_height["2.0"] ??
    Object.values(entry.elevations_by_height)[0] ??
    [];

  const deltaH = hReq - nearestH;
  const adjustedBaseElevs = storedElevs.map((elevDeg, idx) => {
    if (Math.abs(deltaH) < 0.02) return elevDeg;
    const distKm = entry.obstacle_distance_km[idx] ?? 10.0;
    const distM = Math.max(50.0, distKm * 1000.0);
    const oldSlope = Math.tan(elevDeg * DEG2RAD);
    const newElevDeg = Math.atan((oldSlope * distM - deltaH) / distM) * RAD2DEG;
    return roundTo(newElevDeg, 4);
  });

  const step = Math.max(0.1, req.azimuth_step_deg);
  const nAz = Math.max(1, Math.round(360.0 / step));
  const azimuths_deg: number[] = [];
  const horizon_elevation_deg: number[] = [];
  const obstacle_distance_km: number[] = [];

  for (let k = 0; k < nAz; k++) {
    const az = roundTo(k * step, 4);
    azimuths_deg.push(az);
    if (Math.abs(step - entry.azimuth_step_deg) < 1e-6 && k < adjustedBaseElevs.length) {
      horizon_elevation_deg.push(adjustedBaseElevs[k] ?? 0.0);
      obstacle_distance_km.push(entry.obstacle_distance_km[k] ?? 0.0);
    } else {
      horizon_elevation_deg.push(
        roundTo(interpolateArrayAtDeg(adjustedBaseElevs, entry.azimuth_step_deg, az), 4),
      );
      obstacle_distance_km.push(
        roundTo(interpolateArrayAtDeg(entry.obstacle_distance_km, entry.azimuth_step_deg, az), 3),
      );
    }
  }

  return {
    site: req.site,
    site_elevation_m: entry.site_elevation_m,
    azimuths_deg,
    horizon_elevation_deg,
    obstacle_distance_km,
    dem_product: entry.dem_product,
    horizon_source: entry.horizon_source,
    max_distance_km: entry.max_distance_km,
    truncated: entry.truncated,
  };
}

function buildSyntheticTerrainPatch(req: TerrainPatchRequest): TerrainPatch {
  const n = req.resolution_profile === "mobile" ? 32 : req.resolution_profile === "tablet" ? 48 : 96;
  const halfM = req.half_extent_km * 1000.0;
  const stepM = (2.0 * halfM) / Math.max(1, n - 1);
  const x_coords_m: number[] = [];
  const y_coords_m: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = roundTo(-halfM + i * stepM, 2);
    x_coords_m.push(v);
    y_coords_m.push(v);
  }

  // Deterministic gentle lunar basin curvature around (lat, lon)
  const seed = Math.sin(req.site.lat_deg * 12.9898 + req.site.lon_deg * 78.233) * 43758.5453;
  const phase = (seed - Math.floor(seed)) * Math.PI * 2.0;
  const elevations_m: number[][] = [];
  let minE = Number.POSITIVE_INFINITY;
  let maxE = Number.NEGATIVE_INFINITY;

  for (let r = 0; r < n; r++) {
    const row: number[] = [];
    const y = y_coords_m[r] ?? 0;
    for (let c = 0; c < n; c++) {
      const x = x_coords_m[c] ?? 0;
      const distKm = Math.hypot(x, y) / 1000.0;
      const curvatureDrop = -(x * x + y * y) / (2.0 * R_MOON_M);
      const gentleUndulation =
        18.0 * Math.sin(x / 2800.0 + phase) * Math.cos(y / 2800.0 - phase) +
        9.0 * Math.cos(distKm * 0.65);
      const elev = roundTo(curvatureDrop + gentleUndulation, 2);
      if (elev < minE) minE = elev;
      if (elev > maxE) maxE = elev;
      row.push(elev);
    }
    elevations_m.push(row);
  }

  const centerIdx = Math.floor(n / 2);
  const siteElev = elevations_m[centerIdx]?.[centerIdx] ?? 0.0;

  return {
    site: req.site,
    grid_size: n,
    half_extent_km: req.half_extent_km,
    step_m: roundTo(stepM, 3),
    x_coords_m,
    y_coords_m,
    elevations_m,
    min_elevation_m: roundTo(minE, 2),
    max_elevation_m: roundTo(maxE, 2),
    site_elevation_m: siteElev,
    horizon_source: "spherical_analytical",
    dem_product: "SYNTHETIC_SPHERICAL_FALLBACK",
  };
}

export async function staticFetchTerrainPatch(req: TerrainPatchRequest): Promise<TerrainPatch> {
  const siteId = await resolveCuratedSiteId(req.site);
  const patches = await loadStaticJson<TerrainPatchesBundle>("terrain_patches.json");
  const entry = siteId ? patches[siteId] : undefined;
  if (!entry) {
    return buildSyntheticTerrainPatch(req);
  }

  const targetN = req.resolution_profile === "mobile" ? 32 : req.resolution_profile === "tablet" ? 48 : entry.grid_size;
  if (targetN >= entry.grid_size) {
    return {
      site: req.site,
      ...entry,
    };
  }

  const srcN = entry.grid_size;
  const x_coords_m: number[] = [];
  const y_coords_m: number[] = [];
  const idxMap: number[] = [];
  for (let i = 0; i < targetN; i++) {
    const srcIdx = Math.min(srcN - 1, Math.round((i * (srcN - 1)) / (targetN - 1)));
    idxMap.push(srcIdx);
    x_coords_m.push(entry.x_coords_m[srcIdx] ?? 0);
    y_coords_m.push(entry.y_coords_m[srcIdx] ?? 0);
  }

  const elevations_m: number[][] = [];
  let minE = Number.POSITIVE_INFINITY;
  let maxE = Number.NEGATIVE_INFINITY;
  for (let r = 0; r < targetN; r++) {
    const srcRow = entry.elevations_m[idxMap[r] ?? 0] ?? [];
    const outRow: number[] = [];
    for (let c = 0; c < targetN; c++) {
      const val = srcRow[idxMap[c] ?? 0] ?? entry.site_elevation_m;
      if (val < minE) minE = val;
      if (val > maxE) maxE = val;
      outRow.push(val);
    }
    elevations_m.push(outRow);
  }

  return {
    site: req.site,
    grid_size: targetN,
    half_extent_km: entry.half_extent_km,
    step_m: roundTo((2.0 * entry.half_extent_km * 1000.0) / Math.max(1, targetN - 1), 3),
    x_coords_m,
    y_coords_m,
    elevations_m,
    min_elevation_m: roundTo(minE, 2),
    max_elevation_m: roundTo(maxE, 2),
    site_elevation_m: entry.site_elevation_m,
    horizon_source: entry.horizon_source,
    dem_product: entry.dem_product,
  };
}

function buildTimeGridMs(windowSpec: TimeWindow): number[] {
  const startMs = Date.parse(windowSpec.start_utc);
  const endMs = Date.parse(windowSpec.end_utc);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return [Number.isFinite(startMs) ? startMs : Date.now()];
  }
  const stepMs = Math.max(60_000, windowSpec.step_minutes * 60_000);
  const nSteps = Math.floor((endMs - startMs) / stepMs);
  const out: number[] = [];
  for (let k = 0; k <= nSteps; k++) {
    out.push(startMs + k * stepMs);
  }
  return out;
}

function analyticalSubSolarAndEarth(tMs: number): {
  sun: { latDeg: number; lonDeg: number; distKm: number };
  earth: { latDeg: number; lonDeg: number; distKm: number };
} {
  const j2000Ms = Date.UTC(2000, 0, 1, 12, 0, 0);
  const d = (tMs - j2000Ms) / 86_400_000.0;

  const Ddeg = (((297.8501921 + 12.19074911 * d) % 360) + 360) % 360;
  const Drad = Ddeg * DEG2RAD;
  const Mrad = (((357.5291092 + 0.98560028 * d) % 360) + 360) % 360 * DEG2RAD;
  const Mprad = (((134.9633964 + 13.06499295 * d) % 360) + 360) % 360 * DEG2RAD;
  const Frad = (((93.2720950 + 13.22935024 * d) % 360) + 360) % 360 * DEG2RAD;
  const Omrad = (((125.04452 - 0.05295377 * d) % 360) + 360) % 360 * DEG2RAD;
  const Lsdeg = (((280.460 + 0.9856474 * d) % 360) + 360) % 360;

  const eqSun = 1.915 * Math.sin(Mrad) + 0.020 * Math.sin(2.0 * Mrad);
  const lamSunRad = (Lsdeg + eqSun) * DEG2RAD;
  const distSunKm = (1.00014 - 0.01671 * Math.cos(Mrad) - 0.00014 * Math.cos(2.0 * Mrad)) * AU_KM;

  const eqMoon =
    6.289 * Math.sin(Mprad) +
    1.274 * Math.sin(2.0 * Drad - Mprad) +
    0.658 * Math.sin(2.0 * Drad) -
    0.186 * Math.sin(Mrad) -
    0.114 * Math.sin(2.0 * Frad);

  const sunLatDeg = 1.5424 * Math.sin(lamSunRad - Omrad);
  const sunLonDeg = ((((180.0 - Ddeg + eqSun) % 360.0) + 540.0) % 360.0) - 180.0;

  const earthLatDeg = -6.670 * Math.sin(Frad + eqMoon * DEG2RAD);
  const earthLonDeg = eqMoon;
  const earthDistKm =
    385_000.56 -
    20_905.35 * Math.cos(Mprad) -
    3_699.11 * Math.cos(2.0 * Drad - Mprad) -
    2_955.97 * Math.cos(2.0 * Drad);

  return {
    sun: { latDeg: sunLatDeg, lonDeg: sunLonDeg, distKm: distSunKm },
    earth: { latDeg: earthLatDeg, lonDeg: earthLonDeg, distKm: earthDistKm },
  };
}

function projectBodyTopocentric(
  latObsDeg: number,
  lonObsDeg: number,
  obsHeightM: number,
  siteElevM: number,
  latBodyDeg: number,
  lonBodyDeg: number,
  distCenterKm: number,
  bodyRadiusKm: number,
): { azDeg: number; elDeg: number; distKm: number; angRadiusDeg: number } {
  const latO = latObsDeg * DEG2RAD;
  const lonO = lonObsDeg * DEG2RAD;
  const latB = latBodyDeg * DEG2RAD;
  const lonB = lonBodyDeg * DEG2RAD;

  const ux = Math.cos(latB) * Math.cos(lonB);
  const uy = Math.cos(latB) * Math.sin(lonB);
  const uz = Math.sin(latB);

  const rObsKm = R_MOON_KM + (siteElevM + obsHeightM) / 1000.0;
  const ox = Math.cos(latO) * Math.cos(lonO);
  const oy = Math.cos(latO) * Math.sin(lonO);
  const oz = Math.sin(latO);

  const vx = distCenterKm * ux - rObsKm * ox;
  const vy = distCenterKm * uy - rObsKm * oy;
  const vz = distCenterKm * uz - rObsKm * oz;
  const distKm = Math.hypot(vx, vy, vz);

  const vE = -Math.sin(lonO) * vx + Math.cos(lonO) * vy;
  const vN =
    -Math.sin(latO) * Math.cos(lonO) * vx -
    Math.sin(latO) * Math.sin(lonO) * vy +
    Math.cos(latO) * vz;
  const vU = ox * vx + oy * vy + oz * vz;

  const azDeg = normAzDeg(Math.atan2(vE, vN) * RAD2DEG);
  const elDeg = Math.asin(Math.max(-1.0, Math.min(1.0, vU / Math.max(1e-6, distKm)))) * RAD2DEG;
  const angRadiusDeg = Math.asin(Math.min(1.0, bodyRadiusKm / Math.max(bodyRadiusKm, distKm))) * RAD2DEG;

  return { azDeg, elDeg, distKm, angRadiusDeg };
}

function diskVisibleFraction(elDeg: number, alphaDeg: number, horDeg: number): number {
  if (alphaDeg <= 0.0) return elDeg >= horDeg ? 1.0 : 0.0;
  const elRad = elDeg * DEG2RAD;
  const aRad = alphaDeg * DEG2RAD;
  const hRad = horDeg * DEG2RAD;
  const x = (hRad - elRad) / aRad;
  if (x <= -1.0) return 1.0;
  if (x >= 1.0) return 0.0;
  const val = (Math.acos(x) - x * Math.sqrt(Math.max(0.0, 1.0 - x * x))) / Math.PI;
  return Math.max(0.0, Math.min(1.0, val));
}

function visibilityState(elDeg: number, alphaDeg: number, horDeg: number): VisibilityState {
  if (elDeg - alphaDeg > horDeg) return "visible";
  if (elDeg + alphaDeg < horDeg) return "occulted";
  return "partial";
}

function makeBodyPosition(
  azDeg: number,
  elDeg: number,
  distKm: number,
  angRadiusDeg: number,
  horDeg: number,
): BodyPosition {
  const clearance = elDeg - horDeg;
  const frac = diskVisibleFraction(elDeg, angRadiusDeg, horDeg);
  return {
    azimuth_deg: roundTo(azDeg, 4),
    elevation_deg: roundTo(elDeg, 4),
    distance_km: roundTo(distKm, 2),
    angular_radius_deg: roundTo(angRadiusDeg, 5),
    horizon_elevation_deg: roundTo(horDeg, 4),
    clearance_deg: roundTo(clearance, 4),
    state: visibilityState(elDeg, angRadiusDeg, horDeg),
    visible_fraction: roundTo(frac, 4),
  };
}

function findFirstEvent(
  eventType: EventType,
  timesMs: number[],
  gValues: number[],
  falling: boolean,
): EventPrediction {
  if (timesMs.length < 2) {
    return { event: eventType, time_utc: null, seconds_from_reference: null, beyond_window: true };
  }
  const t0 = timesMs[0] ?? 0;
  for (let i = 0; i < timesMs.length - 1; i++) {
    const g0 = gValues[i] ?? 0;
    const g1 = gValues[i + 1] ?? 0;
    const crossed = falling ? g0 > 0 && g1 <= 0 : g0 < 0 && g1 >= 0;
    if (!crossed) continue;

    const ta = timesMs[i] ?? t0;
    const tb = timesMs[i + 1] ?? t0;
    const denom = g0 - g1;
    const frac = Math.abs(denom) > 1e-12 ? g0 / denom : 0.5;
    const tCrossMs = ta + Math.max(0, Math.min(1, frac)) * (tb - ta);
    const secFromRef = Math.round((tCrossMs - t0) / 1000.0);
    return {
      event: eventType,
      time_utc: new Date(Math.round(tCrossMs / 1000.0) * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      seconds_from_reference: secFromRef,
      beyond_window: false,
    };
  }
  return { event: eventType, time_utc: null, seconds_from_reference: null, beyond_window: true };
}

function longestStreakHours(flags: boolean[], stepHours: number): number {
  let maxRun = 0;
  let cur = 0;
  for (const flag of flags) {
    if (flag) {
      cur += 1;
      if (cur > maxRun) maxRun = cur;
    } else {
      cur = 0;
    }
  }
  return roundTo(maxRun * stepHours, 2);
}

function interpHorizon(profile: HorizonProfile, azDeg: number): number {
  const step = profile.azimuths_deg.length > 1 ? 360.0 / profile.azimuths_deg.length : 0.5;
  return interpolateArrayAtDeg(profile.horizon_elevation_deg, step, azDeg);
}

export async function staticFetchVisibility(req: VisibilityRequest): Promise<VisibilityTimeSeries> {
  const horizon = await staticFetchHorizon({
    site: req.site,
    azimuth_step_deg: 0.5,
    max_distance_km: 150.0,
    dem_product: null,
  });

  const timesMs = buildTimeGridMs(req.window);
  const siteId = await resolveCuratedSiteId(req.site);

  let matchedWindow: { timesMs: number[]; packed: PackedEphemerisTuple[] } | null = null;
  if (siteId && timesMs.length > 0) {
    const presets = await loadStaticJson<PresetsBundle>("presets.json");
    const firstMs = timesMs[0] ?? 0;
    const lastMs = timesMs[timesMs.length - 1] ?? 0;
    for (const w of Object.values(presets.windows)) {
      const sitePacked = w.sites[siteId];
      if (!sitePacked || w.times_utc.length < 2) continue;
      const wStart = Date.parse(w.times_utc[0] ?? "");
      const wEnd = Date.parse(w.times_utc[w.times_utc.length - 1] ?? "");
      if (firstMs >= wStart - 1000 && lastMs <= wEnd + 1000) {
        matchedWindow = {
          timesMs: w.times_utc.map((iso) => Date.parse(iso)),
          packed: sitePacked,
        };
        break;
      }
    }
  }

  const samples: VisibilitySample[] = [];
  const sunG: number[] = [];
  const earthG: number[] = [];

  for (const tMs of timesMs) {
    let sunTuple: { azDeg: number; elDeg: number; distKm: number; angRadiusDeg: number };
    let earthTuple: { azDeg: number; elDeg: number; distKm: number; angRadiusDeg: number };

    if (matchedWindow && matchedWindow.timesMs.length >= 2) {
      const wTimes = matchedWindow.timesMs;
      const wStart = wTimes[0] ?? tMs;
      const wStepMs = Math.max(60_000, (wTimes[1] ?? wStart + 7_200_000) - wStart);
      const pos = Math.max(0, Math.min(wTimes.length - 1.00001, (tMs - wStart) / wStepMs));
      const i0 = Math.floor(pos);
      const i1 = Math.min(wTimes.length - 1, i0 + 1);
      const alpha = pos - i0;
      const p0 = matchedWindow.packed[i0]!;
      const p1 = matchedWindow.packed[i1] ?? p0;

      sunTuple = {
        azDeg: interpAzDeg(p0[0], p1[0], alpha),
        elDeg: p0[1] + alpha * (p1[1] - p0[1]),
        distKm: p0[2] + alpha * (p1[2] - p0[2]),
        angRadiusDeg: p0[3] + alpha * (p1[3] - p0[3]),
      };
      earthTuple = {
        azDeg: interpAzDeg(p0[4], p1[4], alpha),
        elDeg: p0[5] + alpha * (p1[5] - p0[5]),
        distKm: p0[6] + alpha * (p1[6] - p0[6]),
        angRadiusDeg: p0[7] + alpha * (p1[7] - p0[7]),
      };
    } else {
      const sub = analyticalSubSolarAndEarth(tMs);
      sunTuple = projectBodyTopocentric(
        req.site.lat_deg,
        req.site.lon_deg,
        req.site.observer_height_m,
        horizon.site_elevation_m,
        sub.sun.latDeg,
        sub.sun.lonDeg,
        sub.sun.distKm,
        R_SUN_KM,
      );
      earthTuple = projectBodyTopocentric(
        req.site.lat_deg,
        req.site.lon_deg,
        req.site.observer_height_m,
        horizon.site_elevation_m,
        sub.earth.latDeg,
        sub.earth.lonDeg,
        sub.earth.distKm,
        R_EARTH_EQ_KM,
      );
    }

    const horSun = interpHorizon(horizon, sunTuple.azDeg);
    const horEarth = interpHorizon(horizon, earthTuple.azDeg);
    const sunPos = makeBodyPosition(
      sunTuple.azDeg,
      sunTuple.elDeg,
      sunTuple.distKm,
      sunTuple.angRadiusDeg,
      horSun,
    );
    const earthPos = makeBodyPosition(
      earthTuple.azDeg,
      earthTuple.elDeg,
      earthTuple.distKm,
      earthTuple.angRadiusDeg,
      horEarth,
    );

    samples.push({
      time_utc: new Date(tMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
      sun: sunPos,
      earth: earthPos,
    });
    sunG.push(sunPos.clearance_deg);
    earthG.push(earthPos.clearance_deg - req.dte_elevation_mask_deg);
  }

  const events: EventPrediction[] = [
    findFirstEvent("sunset", timesMs, sunG, true),
    findFirstEvent("sunrise", timesMs, sunG, false),
    findFirstEvent("earthset", timesMs, earthG, true),
    findFirstEvent("earthrise", timesMs, earthG, false),
  ];

  const computation: ComputationInfo = {
    ephemeris: req.ephemeris,
    lunar_frame: matchedWindow ? "MOON_ME_DE421" : "MOON_ME_ANALYTICAL_FALLBACK",
    dem_product: horizon.dem_product,
    horizon_source: horizon.horizon_source,
    azimuth_step_deg: 0.5,
    max_distance_km: horizon.max_distance_km,
    refraction: false,
  };

  return {
    site: req.site,
    window: req.window,
    samples,
    events,
    computation,
  };
}

function computeAdvancedDteFromSeries(
  series: VisibilityTimeSeries,
  dteMaskDeg: number,
): AdvancedDteMetrics {
  const n = series.samples.length;
  if (n === 0) {
    return {
      terrain_clearance_deg: 0.0,
      min_clearance_deg: 0.0,
      max_clearance_deg: 0.0,
      earth_azimuth_span_deg: 0.0,
      earth_elevation_span_deg: 0.0,
      libration_span_deg: 0.0,
      earth_distance_km: 384400.0,
      one_way_light_time_s: roundTo(384400.0 / SPEED_OF_LIGHT_KM_S, 4),
      round_trip_time_s: roundTo((2.0 * 384400.0) / SPEED_OF_LIGHT_KM_S, 4),
      fspl_s_band_db: 0.0,
      fspl_x_band_db: 0.0,
      fspl_ka_band_db: 0.0,
      longest_comms_blackout_hours: 0.0,
      simultaneous_sun_earth_hours: 0.0,
    };
  }

  const clearances = series.samples.map((s) => s.earth.clearance_deg);
  const terrain_clearance_deg = roundTo(clearances[0] ?? 0.0, 4);
  const min_clearance_deg = roundTo(Math.min(...clearances), 4);
  const max_clearance_deg = roundTo(Math.max(...clearances), 4);

  // Unwrap Earth azimuths to measure continuous libration box span
  const unwrappedAz: number[] = [];
  for (let i = 0; i < n; i++) {
    const raw = series.samples[i]!.earth.azimuth_deg;
    if (i === 0) {
      unwrappedAz.push(raw);
    } else {
      const prev = unwrappedAz[i - 1]!;
      const delta = ((raw - prev + 540.0) % 360.0) - 180.0;
      unwrappedAz.push(prev + delta);
    }
  }
  const azSpan = Math.max(...unwrappedAz) - Math.min(...unwrappedAz);
  const elevs = series.samples.map((s) => s.earth.elevation_deg);
  const elSpan = Math.max(...elevs) - Math.min(...elevs);
  const meanEl = elevs.reduce((acc, v) => acc + v, 0) / n;
  const librationSpan = Math.hypot(elSpan, azSpan * Math.cos(meanEl * DEG2RAD));

  const meanDistKm = series.samples.reduce((acc, s) => acc + s.earth.distance_km, 0) / n;
  const oneWayS = meanDistKm / SPEED_OF_LIGHT_KM_S;
  const rttS = 2.0 * oneWayS;

  const logD = Math.log10(Math.max(1.0, meanDistKm));
  const fsplS = 20.0 * logD + 20.0 * Math.log10(FREQ_S_BAND_GHZ) + 92.45;
  const fsplX = 20.0 * logD + 20.0 * Math.log10(FREQ_X_BAND_GHZ) + 92.45;
  const fsplKa = 20.0 * logD + 20.0 * Math.log10(FREQ_KA_BAND_GHZ) + 92.45;

  const stepHours = series.window.step_minutes / 60.0;
  const dteFlags = series.samples.map((s) => s.earth.clearance_deg >= dteMaskDeg);
  const sunlitFlags = series.samples.map((s) => s.sun.visible_fraction > 0.0);
  const blackoutFlags = dteFlags.map((f) => !f);
  const bothCount = dteFlags.reduce((acc, dFlag, idx) => acc + (dFlag && sunlitFlags[idx] ? 1 : 0), 0);

  return {
    terrain_clearance_deg,
    min_clearance_deg,
    max_clearance_deg,
    earth_azimuth_span_deg: roundTo(azSpan, 4),
    earth_elevation_span_deg: roundTo(elSpan, 4),
    libration_span_deg: roundTo(librationSpan, 4),
    earth_distance_km: roundTo(meanDistKm, 1),
    one_way_light_time_s: roundTo(oneWayS, 4),
    round_trip_time_s: roundTo(rttS, 4),
    fspl_s_band_db: roundTo(fsplS, 2),
    fspl_x_band_db: roundTo(fsplX, 2),
    fspl_ka_band_db: roundTo(fsplKa, 2),
    longest_comms_blackout_hours: longestStreakHours(blackoutFlags, stepHours),
    simultaneous_sun_earth_hours: roundTo(bothCount * stepHours, 2),
  };
}

export async function staticCompareSites(req: ComparisonRequest): Promise<ComparisonResult> {
  const seriesList = await Promise.all(
    req.sites.map((site) =>
      staticFetchVisibility({
        site,
        window: req.window,
        dte_elevation_mask_deg: req.dte_elevation_mask_deg,
        ephemeris: req.ephemeris,
      }),
    ),
  );

  const metrics = seriesList.map((series) => {
    const n = Math.max(1, series.samples.length);
    const stepHours = series.window.step_minutes / 60.0;
    const sunlitFlags = series.samples.map((s) => s.sun.visible_fraction > 0.0);
    const darkFlags = sunlitFlags.map((f) => !f);
    const dteFlags = series.samples.map((s) => s.earth.clearance_deg >= req.dte_elevation_mask_deg);
    const bothFlags = sunlitFlags.map((f, idx) => f && Boolean(dteFlags[idx]));

    const sunlitFrac = sunlitFlags.filter(Boolean).length / n;
    const dteFrac = dteFlags.filter(Boolean).length / n;
    const bothFrac = bothFlags.filter(Boolean).length / n;
    const meanSunEl = series.samples.reduce((acc, s) => acc + s.sun.elevation_deg, 0) / n;

    const findEv = (type: EventType): EventPrediction =>
      series.events.find((e) => e.event === type) ?? {
        event: type,
        time_utc: null,
        seconds_from_reference: null,
        beyond_window: true,
      };

    return {
      site: series.site,
      horizon_source: series.computation.horizon_source,
      sunlit_fraction: roundTo(sunlitFrac, 4),
      dte_fraction: roundTo(dteFrac, 4),
      sun_and_dte_fraction: roundTo(bothFrac, 4),
      longest_sunlit_hours: longestStreakHours(sunlitFlags, stepHours),
      longest_darkness_hours: longestStreakHours(darkFlags, stepHours),
      mean_sun_elevation_deg: roundTo(meanSunEl, 4),
      next_sunset: findEv("sunset"),
      next_earthset: findEv("earthset"),
      advanced_dte: computeAdvancedDteFromSeries(series, req.dte_elevation_mask_deg),
    };
  });

  const lastComp = seriesList[seriesList.length - 1]?.computation ?? {
    ephemeris: req.ephemeris,
    lunar_frame: "MOON_ME_DE421",
    dem_product: "SPHERICAL_R1737400M",
    horizon_source: "spherical_analytical" as const,
    azimuth_step_deg: 0.5,
    max_distance_km: 150.0,
    refraction: false as const,
  };

  return {
    window: req.window,
    metrics,
    computation: lastComp,
  };
}

export async function staticFetchSolarEnergy(req: SolarEnergyRequest): Promise<SolarEnergySummary> {
  const series = await staticFetchVisibility({
    site: req.site,
    window: req.window,
    dte_elevation_mask_deg: 0.0,
    ephemeris: req.ephemeris,
  });

  const n = series.samples.length;
  const stepHours = series.window.step_minutes / 60.0;
  if (n === 0) {
    const empty: SolarArchitectureEnergy = {
      architecture: "horizontal_panel",
      azimuth_deg: null,
      total_energy_kwh_m2: 0.0,
      peak_flux_w_m2: 0.0,
      mean_flux_w_m2: 0.0,
    };
    return {
      solar_constant_am0_w_m2: SOLAR_CONSTANT_AM0_W_M2,
      mean_solar_distance_au: 1.0,
      horizontal_panel: empty,
      tracking_vertical_panel: { ...empty, architecture: "tracking_vertical_panel" },
      fixed_vertical_panel: {
        ...empty,
        architecture: "fixed_vertical_panel",
        azimuth_deg: roundTo(normAzDeg(req.fixed_azimuth_deg), 2),
      },
      optimal_azimuth: {
        optimal_panel_azimuth_deg: 0.0,
        optimal_fixed_energy_kwh_m2: 0.0,
        azimuth_energy_curve_kwh_m2: new Array<number>(360).fill(0.0),
      },
    };
  }

  let distAuSum = 0.0;
  const pHoriz: number[] = [];
  const pTrack: number[] = [];
  const pFixed: number[] = [];
  const azCurve = new Array<number>(360).fill(0.0);
  const fixedPanelRad = normAzDeg(req.fixed_azimuth_deg) * DEG2RAD;

  for (const s of series.samples) {
    const distAu = Math.max(1.0, s.sun.distance_km) / AU_KM;
    distAuSum += distAu;
    const sEff = s.sun.visible_fraction > 0.0 ? (SOLAR_CONSTANT_AM0_W_M2 / (distAu * distAu)) * s.sun.visible_fraction : 0.0;
    const above = s.sun.elevation_deg > 0.0;
    const elRad = s.sun.elevation_deg * DEG2RAD;
    const azRad = s.sun.azimuth_deg * DEG2RAD;

    const ph = above ? sEff * Math.sin(elRad) : 0.0;
    const pt = above ? sEff * Math.cos(elRad) : 0.0;
    const pf = above ? pt * Math.max(0.0, Math.cos(azRad - fixedPanelRad)) : 0.0;

    pHoriz.push(ph);
    pTrack.push(pt);
    pFixed.push(pf);

    if (above && pt > 0.0) {
      for (let deg = 0; deg < 360; deg++) {
        const cosD = Math.max(0.0, Math.cos(azRad - deg * DEG2RAD));
        azCurve[deg] = (azCurve[deg] ?? 0.0) + pt * cosD * (stepHours / 1000.0);
      }
    }
  }

  const summarizeArch = (arch: string, azimuthDeg: number | null, vals: number[]): SolarArchitectureEnergy => {
    const sumW = vals.reduce((acc, v) => acc + v, 0.0);
    return {
      architecture: arch,
      azimuth_deg: azimuthDeg,
      total_energy_kwh_m2: roundTo((sumW * stepHours) / 1000.0, 4),
      peak_flux_w_m2: roundTo(Math.max(...vals), 2),
      mean_flux_w_m2: roundTo(sumW / n, 2),
    };
  };

  let bestIdx = 0;
  let bestEnergy = -1.0;
  const roundedCurve = azCurve.map((val, idx) => {
    if (val > bestEnergy) {
      bestEnergy = val;
      bestIdx = idx;
    }
    return roundTo(val, 4);
  });

  return {
    solar_constant_am0_w_m2: SOLAR_CONSTANT_AM0_W_M2,
    mean_solar_distance_au: roundTo(distAuSum / n, 6),
    horizontal_panel: summarizeArch("horizontal_panel", null, pHoriz),
    tracking_vertical_panel: summarizeArch("tracking_vertical_panel", null, pTrack),
    fixed_vertical_panel: summarizeArch(
      "fixed_vertical_panel",
      roundTo(normAzDeg(req.fixed_azimuth_deg), 2),
      pFixed,
    ),
    optimal_azimuth: {
      optimal_panel_azimuth_deg: bestIdx,
      optimal_fixed_energy_kwh_m2: roundTo(Math.max(0.0, bestEnergy), 4),
      azimuth_energy_curve_kwh_m2: roundedCurve,
    },
  };
}

export async function staticFetchDteAnalysis(req: VisibilityRequest): Promise<AdvancedDteMetrics> {
  const series = await staticFetchVisibility(req);
  return computeAdvancedDteFromSeries(series, req.dte_elevation_mask_deg);
}
