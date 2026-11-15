"""Data contract (source of truth) between backend and frontend.

Owner: lead-architect-auditor.
Mandatory mirror: frontend/src/types/contracts.ts (parity checked by scripts/verify_environment.py).

Conventions (see AGENTS.md):
- Angles in decimal degrees; distances in meters unless _km suffix.
- Timestamps in UTC ISO-8601 (Z suffix).
- East-positive longitude in [-180, 180]; MOON_ME selenographic frame.
- Azimuth clockwise from local north, [0, 360).
- Airless Moon: zero atmospheric bending in all calculations.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field

CONTRACT_VERSION = "0.2.0"


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# --------------------------------------------------------------------------- enums
class SiteCategory(str, Enum):
    APOLLO = "apollo"
    CLPS = "clps"
    ARTEMIS_CANDIDATE = "artemis_candidate"
    INTERNATIONAL = "international"
    COMMERCIAL = "commercial"
    SCIENCE_TARGET = "science_target"
    CUSTOM = "custom"


class VisibilityState(str, Enum):
    VISIBLE = "visible"
    PARTIAL = "partial"
    OCCULTED = "occulted"


class EphemerisKernel(str, Enum):
    DE421 = "DE421"
    DE440 = "DE440"


class EventType(str, Enum):
    SUNSET = "sunset"
    SUNRISE = "sunrise"
    EARTHSET = "earthset"
    EARTHRISE = "earthrise"


class HorizonSource(str, Enum):
    LOLA_DEM = "lola_dem"
    LOLA_DEM_CACHED = "lola_dem_cached"
    SPHERICAL_ANALYTICAL = "spherical_analytical"


class ResolutionProfile(str, Enum):
    MOBILE = "mobile"
    TABLET = "tablet"
    DESKTOP = "desktop"


# --------------------------------------------------------------------------- sites and hardware
class HardwareProfile(_Strict):
    id: str
    name: str
    agency: str
    observer_height_m: float = Field(ge=0.0, le=100.0)
    description_tech: str
    description_edu: str


class LunarCoordinate(_Strict):
    lat_deg: float = Field(ge=-90.0, le=90.0, description="Planetocentric latitude MOON_ME [deg]")
    lon_deg: float = Field(ge=-180.0, le=180.0, description="East-positive longitude MOON_ME [deg]")
    observer_height_m: float = Field(default=2.0, ge=0.0, le=100.0, description="Height above DEM (mast/panel) [m]")
    site_id: str | None = Field(default=None, description="Curated site ID, if applicable")


class CuratedSite(_Strict):
    id: str
    name: str
    category: SiteCategory
    lat_deg: float = Field(ge=-90.0, le=90.0)
    lon_deg: float = Field(ge=-180.0, le=180.0)
    elevation_m: float | None = Field(default=None, description="Elevation above R=1737.4 km [m]; null if unsampled")
    default_hardware_id: str
    region: str
    mission: str
    description_tech: str
    description_edu: str
    source: str
    verification_status: str
    quickmap_url: str
    moontrek_url: str


# --------------------------------------------------------------------------- time window
class TimeWindow(_Strict):
    start_utc: datetime
    end_utc: datetime
    step_minutes: float = Field(default=60.0, ge=1.0, le=1440.0)


# --------------------------------------------------------------------------- horizon and 3D terrain
class HorizonRequest(_Strict):
    site: LunarCoordinate
    azimuth_step_deg: float = Field(default=0.5, gt=0.0, le=5.0)
    max_distance_km: float = Field(default=150.0, gt=0.0, le=400.0)
    dem_product: str | None = None


class HorizonProfile(_Strict):
    site: LunarCoordinate
    site_elevation_m: float
    azimuths_deg: list[float]
    horizon_elevation_deg: list[float]
    obstacle_distance_km: list[float]
    dem_product: str
    horizon_source: HorizonSource
    max_distance_km: float
    truncated: bool = Field(description="True if any ray exited the DEM before max_distance_km")


class TerrainPatchRequest(_Strict):
    site: LunarCoordinate
    half_extent_km: float = Field(default=10.0, gt=0.5, le=100.0)
    resolution_profile: ResolutionProfile = ResolutionProfile.DESKTOP


class TerrainPatch(_Strict):
    site: LunarCoordinate
    grid_size: int
    half_extent_km: float
    step_m: float
    x_coords_m: list[float]
    y_coords_m: list[float]
    elevations_m: list[list[float]]
    min_elevation_m: float
    max_elevation_m: float
    site_elevation_m: float
    horizon_source: HorizonSource
    dem_product: str


# --------------------------------------------------------------------------- visibilidad
class BodyPosition(_Strict):
    azimuth_deg: float
    elevation_deg: float
    distance_km: float
    angular_radius_deg: float
    horizon_elevation_deg: float = Field(description="Topographic horizon elevation at the body azimuth")
    clearance_deg: float = Field(description="elevation_deg - horizon_elevation_deg (disk center)")
    state: VisibilityState
    visible_fraction: float = Field(ge=0.0, le=1.0)


class VisibilitySample(_Strict):
    time_utc: datetime
    sun: BodyPosition
    earth: BodyPosition


class VisibilityRequest(_Strict):
    site: LunarCoordinate
    window: TimeWindow
    dte_elevation_mask_deg: float = Field(default=0.0, ge=-5.0, le=30.0)
    ephemeris: EphemerisKernel = EphemerisKernel.DE421


class EventPrediction(_Strict):
    event: EventType
    time_utc: datetime | None = Field(description="Event timestamp; null if outside the window")
    seconds_from_reference: float | None
    beyond_window: bool


class ComputationInfo(_Strict):
    ephemeris: EphemerisKernel
    lunar_frame: str
    dem_product: str
    horizon_source: HorizonSource
    azimuth_step_deg: float
    max_distance_km: float
    refraction: bool = Field(default=False, description="Always False: the Moon is airless")


class VisibilityTimeSeries(_Strict):
    site: LunarCoordinate
    window: TimeWindow
    samples: list[VisibilitySample]
    events: list[EventPrediction]
    computation: ComputationInfo


# --------------------------------------------------------------------------- advanced DTE telecommunications (MATH_MODELS §6)
class AdvancedDteMetrics(_Strict):
    terrain_clearance_deg: float = Field(description="Instantaneous angular clearance above the horizon toward Earth [deg]")
    min_clearance_deg: float = Field(description="Minimum angular clearance above the horizon over the window [deg]")
    max_clearance_deg: float = Field(description="Maximum angular clearance above the horizon over the window [deg]")
    earth_azimuth_span_deg: float = Field(description="Earth azimuth libration variation range over the window [deg]")
    earth_elevation_span_deg: float = Field(description="Earth elevation libration variation range over the window [deg]")
    libration_span_deg: float = Field(description="Total combined libration angular span [deg]")
    earth_distance_km: float = Field(description="Mean Earth-Moon distance over the window [km]")
    one_way_light_time_s: float = Field(description="One-way light propagation delay d / c [s]")
    round_trip_time_s: float = Field(description="Round-trip delay time (RTT) 2*d / c [s]")
    fspl_s_band_db: float = Field(description="Free-space path loss in S-Band (2.2 GHz) [dB]")
    fspl_x_band_db: float = Field(description="Free-space path loss in X-Band (8.4 GHz) [dB]")
    fspl_ka_band_db: float = Field(description="Free-space path loss in Ka-Band (32.0 GHz) [dB]")
    longest_comms_blackout_hours: float = Field(description="Maximum continuous DTE link loss duration [hours]")
    simultaneous_sun_earth_hours: float = Field(description="Net simultaneous Sun and Earth visibility hours [hours]")


# --------------------------------------------------------------------------- comparison
class SiteSummaryMetrics(_Strict):
    site: LunarCoordinate
    horizon_source: HorizonSource
    sunlit_fraction: float = Field(ge=0.0, le=1.0)
    dte_fraction: float = Field(ge=0.0, le=1.0)
    sun_and_dte_fraction: float = Field(ge=0.0, le=1.0)
    longest_sunlit_hours: float = Field(ge=0.0)
    longest_darkness_hours: float = Field(ge=0.0)
    mean_sun_elevation_deg: float
    next_sunset: EventPrediction
    next_earthset: EventPrediction
    advanced_dte: AdvancedDteMetrics


class ComparisonRequest(_Strict):
    sites: list[LunarCoordinate] = Field(min_length=1, max_length=9)
    window: TimeWindow
    dte_elevation_mask_deg: float = Field(default=0.0, ge=-5.0, le=30.0)
    ephemeris: EphemerisKernel = EphemerisKernel.DE421


class ComparisonResult(_Strict):
    window: TimeWindow
    metrics: list[SiteSummaryMetrics]
    computation: ComputationInfo


# --------------------------------------------------------------------------- scientific seal and system
class ScientificVerificationSeal(_Strict):
    validation_id: str
    reference_oracle: str
    ephemeris_kernel: str
    lunar_frame: str
    refraction: str
    max_az_error_deg: float
    max_el_error_deg: float
    rms_az_error_deg: float
    rms_el_error_deg: float
    verified_sites_count: int
    verified_samples_count: int
    verified_at_utc: str


# --------------------------------------------------------------------------- solar energy and azimuth (MATH_MODELS §5)
class SolarArchitectureEnergy(_Strict):
    architecture: str = Field(description="horizontal_panel | tracking_vertical_panel | fixed_vertical_panel")
    azimuth_deg: float | None = Field(default=None, description="Fixed panel azimuth [0, 360) deg; null for tracking or horizontal")
    total_energy_kwh_m2: float = Field(ge=0.0, description="Total accumulated energy [kWh/m^2]")
    peak_flux_w_m2: float = Field(ge=0.0, description="Peak instantaneous power flux [W/m^2]")
    mean_flux_w_m2: float = Field(ge=0.0, description="Mean power flux over the window [W/m^2]")


class OptimalAzimuthResult(_Strict):
    optimal_panel_azimuth_deg: float = Field(ge=0.0, lt=360.0, description="Optimal azimuth for fixed vertical panel [0, 359] deg")
    optimal_fixed_energy_kwh_m2: float = Field(ge=0.0, description="Maximum accumulated energy achieved at optimal azimuth [kWh/m^2]")
    azimuth_energy_curve_kwh_m2: list[float] = Field(description="Energy curve across all 360 azimuth degrees [kWh/m^2]")


class SolarEnergySummary(_Strict):
    solar_constant_am0_w_m2: float = Field(default=1368.0, description="AM0 solar constant at 1 AU [W/m^2]")
    mean_solar_distance_au: float = Field(gt=0.0, description="Mean heliocentric distance over the window [AU]")
    horizontal_panel: SolarArchitectureEnergy
    tracking_vertical_panel: SolarArchitectureEnergy
    fixed_vertical_panel: SolarArchitectureEnergy
    optimal_azimuth: OptimalAzimuthResult


class SolarEnergyRequest(_Strict):
    site: LunarCoordinate
    window: TimeWindow
    fixed_azimuth_deg: float = Field(default=0.0, ge=0.0, lt=360.0, description="Fixed vertical panel azimuth to evaluate [0, 360) deg")
    ephemeris: EphemerisKernel = EphemerisKernel.DE421


class HealthResponse(_Strict):
    status: str
    contract_version: str
    scientific_seal: ScientificVerificationSeal


class ErrorResponse(_Strict):
    code: str
    message: str
    details: dict[str, str] | None = None
