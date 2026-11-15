"""HTTP /api/v1 routers for the Lunar Landing Site Navigator.

Owner: fullstack-visualizer.
Contains no physics: delegates exclusively to app.services.* and returns Pydantic models from app.models.schemas.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    AdvancedDteMetrics,
    ComparisonRequest,
    ComparisonResult,
    CuratedSite,
    HardwareProfile,
    HorizonProfile,
    HorizonRequest,
    SolarEnergyRequest,
    SolarEnergySummary,
    TerrainPatch,
    TerrainPatchRequest,
    VisibilityRequest,
    VisibilityTimeSeries,
)
from app.services.horizon import compute_horizon_profile
from app.services.terrain import extract_terrain_patch, load_curated_sites, load_hardware_profiles
from app.services.visibility import (
    compare_sites,
    compute_advanced_dte_metrics,
    compute_solar_energy_analysis,
    compute_visibility_timeseries,
)

router = APIRouter(prefix="/api/v1", tags=["navigator"])


@router.get("/sites", response_model=list[CuratedSite])
def list_curated_sites() -> list[CuratedSite]:
    """Returns the curated catalog of 9 sites with deep links to LROC QuickMap and NASA Moon Trek (RF-01)."""
    return load_curated_sites()


@router.get("/hardware-profiles", response_model=list[HardwareProfile])
def list_hardware_profiles() -> list[HardwareProfile]:
    """Returns CSA and NASA CLPS/Artemis hardware mast height profiles (RF-01)."""
    return load_hardware_profiles()


@router.post("/horizon", response_model=HorizonProfile)
def post_horizon(req: HorizonRequest) -> HorizonProfile:
    """Computes or retrieves from cache the 360-deg airless horizon profile (RT-02, RT-03)."""
    return compute_horizon_profile(req)


@router.post("/terrain-patch", response_model=TerrainPatch)
def post_terrain_patch(req: TerrainPatchRequest) -> TerrainPatch:
    """Extracts a local 3D mesh with device-adaptive resolution (mobile/tablet/desktop) (RF-06)."""
    return extract_terrain_patch(
        site=req.site,
        half_extent_km=req.half_extent_km,
        resolution_profile=req.resolution_profile,
    )


@router.post("/visibility", response_model=VisibilityTimeSeries)
def post_visibility(req: VisibilityRequest) -> VisibilityTimeSeries:
    """Computes the Sun/Earth visibility time series and Sunset/Earthset events (RF-03, RF-04)."""
    if req.window.end_utc <= req.window.start_utc:
        raise HTTPException(status_code=422, detail="end_utc must be after start_utc")
    return compute_visibility_timeseries(req)


@router.post("/compare", response_model=ComparisonResult)
def post_compare(req: ComparisonRequest) -> ComparisonResult:
    """Compares 1 to 9 sites under identical temporal parameters (RF-02, RF-05)."""
    if req.window.end_utc <= req.window.start_utc:
        raise HTTPException(status_code=422, detail="end_utc must be after start_utc")
    return compare_sites(req)


@router.post("/solar-energy", response_model=SolarEnergySummary)
def post_solar_energy(req: SolarEnergyRequest) -> SolarEnergySummary:
    """Computes power by panel type, accumulated energy, and optimal azimuth finder (RF-05, MATH_MODELS §5)."""
    if req.window.end_utc <= req.window.start_utc:
        raise HTTPException(status_code=422, detail="end_utc must be after start_utc")
    vis_req = VisibilityRequest(
        site=req.site,
        window=req.window,
        ephemeris=req.ephemeris,
    )
    series = compute_visibility_timeseries(vis_req)
    return compute_solar_energy_analysis(series, fixed_azimuth_deg=req.fixed_azimuth_deg)


@router.post("/dte-analysis", response_model=AdvancedDteMetrics)
def post_dte_analysis(req: VisibilityRequest) -> AdvancedDteMetrics:
    """Computes advanced DTE telecom metrics, topographic clearance, and FSPL losses (RF-05, MATH_MODELS §6)."""
    if req.window.end_utc <= req.window.start_utc:
        raise HTTPException(status_code=422, detail="end_utc must be after start_utc")
    series = compute_visibility_timeseries(req)
    return compute_advanced_dte_metrics(series, dte_elevation_mask_deg=req.dte_elevation_mask_deg)
