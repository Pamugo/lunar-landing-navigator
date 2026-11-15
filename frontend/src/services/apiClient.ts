/**
 * Typed HTTP client for /api/v1 of the Lunar Landing Site Navigator.
 * Owner: fullstack-visualizer.
 * Rule: Zero astronomical calculations on the client; all physics comes from the backend.
 */
import type {
  AdvancedDteMetrics,
  ComparisonRequest,
  ComparisonResult,
  CuratedSite,
  ErrorResponse,
  HardwareProfile,
  HealthResponse,
  HorizonProfile,
  HorizonRequest,
  SolarEnergyRequest,
  SolarEnergySummary,
  TerrainPatch,
  TerrainPatchRequest,
  VisibilityRequest,
  VisibilityTimeSeries,
} from "../types/contracts";
import {
  staticCompareSites,
  staticFetchDteAnalysis,
  staticFetchHorizon,
  staticFetchSolarEnergy,
  staticFetchTerrainPatch,
  staticFetchVisibility,
  staticHealth,
  staticListHardwareProfiles,
  staticListSites,
} from "./staticFallback";

const API_BASE = "/api/v1";
let backendUnavailable = import.meta.env.VITE_STATIC_MODE === "true";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ErrorResponse | null,
  ) {
    super(payload?.message ?? `HTTP ${status}`);
  }
}

async function requestWithFallback<T>(
  path: string,
  fallback: () => Promise<T>,
  init?: RequestInit,
): Promise<T> {
  if (backendUnavailable) {
    return fallback();
  }
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      if (response.status === 404 || response.status >= 502) {
        backendUnavailable = true;
        return fallback();
      }
      const payload = (await response.json().catch(() => null)) as ErrorResponse | null;
      throw new ApiError(response.status, payload);
    }
    if (!contentType.includes("application/json")) {
      backendUnavailable = true;
      return fallback();
    }
    return (await response.json()) as T;
  } catch (err) {
    if (init?.signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) {
      throw err;
    }
    if (err instanceof ApiError) {
      throw err;
    }
    backendUnavailable = true;
    return fallback();
  }
}

/**
 * Generates official deep links to NASA LROC QuickMap (Intuitive Machines domain)
 * and NASA Moon Trek for custom coordinates.
 */
export function buildExternalPortalLinks(lat_deg: number, lon_deg: number): {
  quickmap_url: string;
  moontrek_url: string;
} {
  const isSouthPolar = lat_deg <= -80.0;
  const dlon = isSouthPolar ? 1.5 : 0.2;
  const dlat = isSouthPolar ? 0.25 : 0.2;
  const proj = isSouthPolar ? 17 : 16;
  const minLon = Math.max(-180.0, lon_deg - dlon).toFixed(5);
  const maxLon = Math.min(180.0, lon_deg + dlon).toFixed(5);
  const minLat = Math.max(-90.0, lat_deg - dlat).toFixed(5);
  const maxLat = Math.min(90.0, lat_deg + dlat).toFixed(5);

  const quickmap_url = `https://quickmap.lroc.im-ldi.com/?extent=${minLon},${minLat},${maxLon},${maxLat}&proj=${proj}`;
  const crs = isSouthPolar
    ? "urn%3Aogc%3Adef%3Acrs%3AIAU2000%3A%3A30120"
    : "urn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A104903";
  const zoom = isSouthPolar ? 6 : 7;
  const moontrek_url = `https://trek.nasa.gov/moon/#v=0.1&x=${lon_deg.toFixed(5)}&y=${lat_deg.toFixed(5)}&z=${zoom}&p=${crs}`;

  return { quickmap_url, moontrek_url };
}

export const apiClient = {
  health: (signal?: AbortSignal): Promise<HealthResponse> =>
    requestWithFallback<HealthResponse>("/health", staticHealth, signal ? { signal } : undefined),

  listSites: (signal?: AbortSignal): Promise<CuratedSite[]> =>
    requestWithFallback<CuratedSite[]>("/sites", staticListSites, signal ? { signal } : undefined),

  listHardwareProfiles: (signal?: AbortSignal): Promise<HardwareProfile[]> =>
    requestWithFallback<HardwareProfile[]>(
      "/hardware-profiles",
      staticListHardwareProfiles,
      signal ? { signal } : undefined,
    ),

  fetchHorizon: (payload: HorizonRequest, signal?: AbortSignal): Promise<HorizonProfile> =>
    requestWithFallback<HorizonProfile>("/horizon", () => staticFetchHorizon(payload), {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  fetchTerrainPatch: (payload: TerrainPatchRequest, signal?: AbortSignal): Promise<TerrainPatch> =>
    requestWithFallback<TerrainPatch>("/terrain-patch", () => staticFetchTerrainPatch(payload), {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  fetchVisibility: (payload: VisibilityRequest, signal?: AbortSignal): Promise<VisibilityTimeSeries> =>
    requestWithFallback<VisibilityTimeSeries>("/visibility", () => staticFetchVisibility(payload), {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  compareSites: (payload: ComparisonRequest, signal?: AbortSignal): Promise<ComparisonResult> =>
    requestWithFallback<ComparisonResult>("/compare", () => staticCompareSites(payload), {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  fetchSolarEnergy: (payload: SolarEnergyRequest, signal?: AbortSignal): Promise<SolarEnergySummary> =>
    requestWithFallback<SolarEnergySummary>("/solar-energy", () => staticFetchSolarEnergy(payload), {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  fetchDteAnalysis: (payload: VisibilityRequest, signal?: AbortSignal): Promise<AdvancedDteMetrics> =>
    requestWithFallback<AdvancedDteMetrics>("/dte-analysis", () => staticFetchDteAnalysis(payload), {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),
};
