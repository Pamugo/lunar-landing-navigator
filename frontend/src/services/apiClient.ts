/**
 * Cliente HTTP tipado para /api/v1 del Lunar Landing Site Navigator.
 * Propietario: fullstack-visualizer.
 * Regla: Cero calculos astronomicos en el cliente; toda la fisica proviene del backend.
 */
import type {
  ComparisonRequest,
  ComparisonResult,
  CuratedSite,
  ErrorResponse,
  HardwareProfile,
  HealthResponse,
  HorizonProfile,
  HorizonRequest,
  TerrainPatch,
  TerrainPatchRequest,
  VisibilityRequest,
  VisibilityTimeSeries,
} from "../types/contracts";

const API_BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly payload: ErrorResponse | null,
  ) {
    super(payload?.message ?? `HTTP ${status}`);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ErrorResponse | null;
    throw new ApiError(response.status, payload);
  }
  return (await response.json()) as T;
}

/**
 * Genera enlaces profundos (deep-links) oficiales a NASA LROC QuickMap (nuevo dominio en Intuitive Machines)
 * y NASA Moon Trek para coordenadas personalizadas.
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
    request<HealthResponse>("/health", signal ? { signal } : undefined),

  listSites: (signal?: AbortSignal): Promise<CuratedSite[]> =>
    request<CuratedSite[]>("/sites", signal ? { signal } : undefined),

  listHardwareProfiles: (signal?: AbortSignal): Promise<HardwareProfile[]> =>
    request<HardwareProfile[]>("/hardware-profiles", signal ? { signal } : undefined),

  fetchHorizon: (payload: HorizonRequest, signal?: AbortSignal): Promise<HorizonProfile> =>
    request<HorizonProfile>("/horizon", {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  fetchTerrainPatch: (payload: TerrainPatchRequest, signal?: AbortSignal): Promise<TerrainPatch> =>
    request<TerrainPatch>("/terrain-patch", {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  fetchVisibility: (payload: VisibilityRequest, signal?: AbortSignal): Promise<VisibilityTimeSeries> =>
    request<VisibilityTimeSeries>("/visibility", {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),

  compareSites: (payload: ComparisonRequest, signal?: AbortSignal): Promise<ComparisonResult> =>
    request<ComparisonResult>("/compare", {
      method: "POST",
      body: JSON.stringify(payload),
      ...(signal ? { signal } : {}),
    }),
};
