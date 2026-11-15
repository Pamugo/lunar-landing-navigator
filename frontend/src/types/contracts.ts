/**
 * TypeScript mirror of the contract defined in backend/app/models/schemas.py (source of truth).
 * Owner: fullstack-visualizer. Any naming divergence is detected by scripts/verify_environment.py.
 * Can be complemented with src/types/openapi.gen.ts (npm run gen:api).
 *
 * Conventions: angles in degrees, distances in meters (except _km suffix), UTC ISO-8601 timestamps.
 */

export const CONTRACT_VERSION = "0.2.0";

export type SiteCategory =
  | "apollo"
  | "clps"
  | "artemis_candidate"
  | "international"
  | "commercial"
  | "science_target"
  | "custom";

export type VisibilityState = "visible" | "partial" | "occulted";
export type EphemerisKernel = "DE421" | "DE440";
export type EventType = "sunset" | "sunrise" | "earthset" | "earthrise";
export type HorizonSource = "lola_dem" | "lola_dem_cached" | "spherical_analytical";
export type ResolutionProfile = "mobile" | "tablet" | "desktop";

/** UTC ISO-8601 string, e.g. "2027-01-01T00:00:00Z". */
export type UtcIsoString = string;

export interface HardwareProfile {
  id: string;
  name: string;
  agency: string;
  observer_height_m: number;
  description_tech: string;
  description_edu: string;
}

export interface LunarCoordinate {
  lat_deg: number;
  lon_deg: number;
  observer_height_m: number;
  site_id: string | null;
}

export interface CuratedSite {
  id: string;
  name: string;
  category: SiteCategory;
  lat_deg: number;
  lon_deg: number;
  elevation_m: number | null;
  default_hardware_id: string;
  region: string;
  mission: string;
  description_tech: string;
  description_edu: string;
  source: string;
  verification_status: string;
  quickmap_url: string;
  moontrek_url: string;
}

export interface TimeWindow {
  start_utc: UtcIsoString;
  end_utc: UtcIsoString;
  step_minutes: number;
}

export interface HorizonRequest {
  site: LunarCoordinate;
  azimuth_step_deg: number;
  max_distance_km: number;
  dem_product: string | null;
}

export interface HorizonProfile {
  site: LunarCoordinate;
  site_elevation_m: number;
  azimuths_deg: number[];
  horizon_elevation_deg: number[];
  obstacle_distance_km: number[];
  dem_product: string;
  horizon_source: HorizonSource;
  max_distance_km: number;
  truncated: boolean;
}

export interface TerrainPatchRequest {
  site: LunarCoordinate;
  half_extent_km: number;
  resolution_profile: ResolutionProfile;
}

export interface TerrainPatch {
  site: LunarCoordinate;
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

export interface BodyPosition {
  azimuth_deg: number;
  elevation_deg: number;
  distance_km: number;
  angular_radius_deg: number;
  horizon_elevation_deg: number;
  clearance_deg: number;
  state: VisibilityState;
  visible_fraction: number;
}

export interface VisibilitySample {
  time_utc: UtcIsoString;
  sun: BodyPosition;
  earth: BodyPosition;
}

export interface VisibilityRequest {
  site: LunarCoordinate;
  window: TimeWindow;
  dte_elevation_mask_deg: number;
  ephemeris: EphemerisKernel;
}

export interface EventPrediction {
  event: EventType;
  time_utc: UtcIsoString | null;
  seconds_from_reference: number | null;
  beyond_window: boolean;
}

export interface ComputationInfo {
  ephemeris: EphemerisKernel;
  lunar_frame: string;
  dem_product: string;
  horizon_source: HorizonSource;
  azimuth_step_deg: number;
  max_distance_km: number;
  refraction: false;
}

export interface VisibilityTimeSeries {
  site: LunarCoordinate;
  window: TimeWindow;
  samples: VisibilitySample[];
  events: EventPrediction[];
  computation: ComputationInfo;
}

export interface AdvancedDteMetrics {
  terrain_clearance_deg: number;
  min_clearance_deg: number;
  max_clearance_deg: number;
  earth_azimuth_span_deg: number;
  earth_elevation_span_deg: number;
  libration_span_deg: number;
  earth_distance_km: number;
  one_way_light_time_s: number;
  round_trip_time_s: number;
  fspl_s_band_db: number;
  fspl_x_band_db: number;
  fspl_ka_band_db: number;
  longest_comms_blackout_hours: number;
  simultaneous_sun_earth_hours: number;
}

export interface SiteSummaryMetrics {
  site: LunarCoordinate;
  horizon_source: HorizonSource;
  sunlit_fraction: number;
  dte_fraction: number;
  sun_and_dte_fraction: number;
  longest_sunlit_hours: number;
  longest_darkness_hours: number;
  mean_sun_elevation_deg: number;
  next_sunset: EventPrediction;
  next_earthset: EventPrediction;
  advanced_dte: AdvancedDteMetrics;
}

export interface ComparisonRequest {
  sites: LunarCoordinate[];
  window: TimeWindow;
  dte_elevation_mask_deg: number;
  ephemeris: EphemerisKernel;
}

export interface ComparisonResult {
  window: TimeWindow;
  metrics: SiteSummaryMetrics[];
  computation: ComputationInfo;
}

export interface ScientificVerificationSeal {
  validation_id: string;
  reference_oracle: string;
  ephemeris_kernel: string;
  lunar_frame: string;
  refraction: string;
  max_az_error_deg: number;
  max_el_error_deg: number;
  rms_az_error_deg: number;
  rms_el_error_deg: number;
  verified_sites_count: number;
  verified_samples_count: number;
  verified_at_utc: string;
}

export interface SolarArchitectureEnergy {
  architecture: string;
  azimuth_deg: number | null;
  total_energy_kwh_m2: number;
  peak_flux_w_m2: number;
  mean_flux_w_m2: number;
}

export interface OptimalAzimuthResult {
  optimal_panel_azimuth_deg: number;
  optimal_fixed_energy_kwh_m2: number;
  azimuth_energy_curve_kwh_m2: number[];
}

export interface SolarEnergySummary {
  solar_constant_am0_w_m2: number;
  mean_solar_distance_au: number;
  horizontal_panel: SolarArchitectureEnergy;
  tracking_vertical_panel: SolarArchitectureEnergy;
  fixed_vertical_panel: SolarArchitectureEnergy;
  optimal_azimuth: OptimalAzimuthResult;
}

export interface SolarEnergyRequest {
  site: LunarCoordinate;
  window: TimeWindow;
  fixed_azimuth_deg: number;
  ephemeris: EphemerisKernel;
}

export interface HealthResponse {
  status: string;
  contract_version: string;
  scientific_seal: ScientificVerificationSeal;
}

export interface ErrorResponse {
  code: string;
  message: string;
  details: Record<string, string> | null;
}
