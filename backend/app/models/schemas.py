"""Contrato de datos (fuente de verdad) entre backend y frontend.

Propietario: lead-architect-auditor.
Espejo obligatorio: frontend/src/types/contracts.ts (paridad comprobada por scripts/verify_environment.py).

Convenciones (ver AGENTS.md):
- Angulos en grados decimales; distancias en metros salvo sufijo _km.
- Tiempos en UTC ISO-8601 (sufijo Z).
- Longitud este-positiva en [-180, 180]; marco selenografico MOON_ME.
- Acimut desde el norte local, sentido horario, [0, 360).
- Sin refraccion atmosferica en ningun calculo.
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


# --------------------------------------------------------------------------- sitios y hardware
class HardwareProfile(_Strict):
    id: str
    name: str
    agency: str
    observer_height_m: float = Field(ge=0.0, le=100.0)
    description_tech: str
    description_edu: str


class LunarCoordinate(_Strict):
    lat_deg: float = Field(ge=-90.0, le=90.0, description="Latitud planetocentrica MOON_ME [deg]")
    lon_deg: float = Field(ge=-180.0, le=180.0, description="Longitud este-positiva MOON_ME [deg]")
    observer_height_m: float = Field(default=2.0, ge=0.0, le=100.0, description="Altura sobre el DEM (mastil/panel) [m]")
    site_id: str | None = Field(default=None, description="ID de sitio curado, si aplica")


class CuratedSite(_Strict):
    id: str
    name: str
    category: SiteCategory
    lat_deg: float = Field(ge=-90.0, le=90.0)
    lon_deg: float = Field(ge=-180.0, le=180.0)
    elevation_m: float | None = Field(default=None, description="Altura sobre R=1737.4 km [m]; null si no muestreada")
    default_hardware_id: str
    region: str
    mission: str
    description_tech: str
    description_edu: str
    source: str
    verification_status: str
    quickmap_url: str
    moontrek_url: str


# --------------------------------------------------------------------------- tiempo
class TimeWindow(_Strict):
    start_utc: datetime
    end_utc: datetime
    step_minutes: float = Field(default=60.0, ge=1.0, le=1440.0)


# --------------------------------------------------------------------------- horizonte y terreno 3D
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
    truncated: bool = Field(description="True si algun rayo salio del DEM antes de max_distance_km")


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
    horizon_elevation_deg: float = Field(description="Elevacion del horizonte topografico en el acimut del cuerpo")
    clearance_deg: float = Field(description="elevation_deg - horizon_elevation_deg (centro del disco)")
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
    time_utc: datetime | None = Field(description="Instante del evento; null si fuera de la ventana")
    seconds_from_reference: float | None
    beyond_window: bool


class ComputationInfo(_Strict):
    ephemeris: EphemerisKernel
    lunar_frame: str
    dem_product: str
    horizon_source: HorizonSource
    azimuth_step_deg: float
    max_distance_km: float
    refraction: bool = Field(default=False, description="Siempre False: la Luna no tiene atmosfera")


class VisibilityTimeSeries(_Strict):
    site: LunarCoordinate
    window: TimeWindow
    samples: list[VisibilitySample]
    events: list[EventPrediction]
    computation: ComputationInfo


# --------------------------------------------------------------------------- comparacion
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


class ComparisonRequest(_Strict):
    sites: list[LunarCoordinate] = Field(min_length=1, max_length=4)
    window: TimeWindow
    dte_elevation_mask_deg: float = Field(default=0.0, ge=-5.0, le=30.0)
    ephemeris: EphemerisKernel = EphemerisKernel.DE421


class ComparisonResult(_Strict):
    window: TimeWindow
    metrics: list[SiteSummaryMetrics]
    computation: ComputationInfo


# --------------------------------------------------------------------------- sello cientifico y sistema
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


class HealthResponse(_Strict):
    status: str
    contract_version: str
    scientific_seal: ScientificVerificationSeal


class ErrorResponse(_Strict):
    code: str
    message: str
    details: dict[str, str] | None = None
