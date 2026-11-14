"""Routers HTTP /api/v1 del Lunar Landing Site Navigator.

Propietario: fullstack-visualizer.
No contiene fisica: delega exclusivamente en app.services.* y devuelve modelos Pydantic de app.models.schemas.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    ComparisonRequest,
    ComparisonResult,
    CuratedSite,
    HardwareProfile,
    HorizonProfile,
    HorizonRequest,
    TerrainPatch,
    TerrainPatchRequest,
    VisibilityRequest,
    VisibilityTimeSeries,
)
from app.services.horizon import compute_horizon_profile
from app.services.terrain import extract_terrain_patch, load_curated_sites, load_hardware_profiles
from app.services.visibility import compare_sites, compute_visibility_timeseries

router = APIRouter(prefix="/api/v1", tags=["navigator"])


@router.get("/sites", response_model=list[CuratedSite])
def list_curated_sites() -> list[CuratedSite]:
    """Devuelve el catalogo de 9 sitios curados con deep-links a LROC QuickMap y NASA Moon Trek (RF-01)."""
    return load_curated_sites()


@router.get("/hardware-profiles", response_model=list[HardwareProfile])
def list_hardware_profiles() -> list[HardwareProfile]:
    """Devuelve los perfiles de altura de mastil/hardware de la CSA y NASA CLPS/Artemis (RF-01)."""
    return load_hardware_profiles()


@router.post("/horizon", response_model=HorizonProfile)
def post_horizon(req: HorizonRequest) -> HorizonProfile:
    """Calcula o recupera de cache el perfil de horizonte 360° sin refraccion (RT-02, RT-03)."""
    return compute_horizon_profile(req)


@router.post("/terrain-patch", response_model=TerrainPatch)
def post_terrain_patch(req: TerrainPatchRequest) -> TerrainPatch:
    """Extrae una malla 3D local con resolucion adaptada al dispositivo (mobile/tablet/desktop) (RF-06)."""
    return extract_terrain_patch(
        site=req.site,
        half_extent_km=req.half_extent_km,
        resolution_profile=req.resolution_profile,
    )


@router.post("/visibility", response_model=VisibilityTimeSeries)
def post_visibility(req: VisibilityRequest) -> VisibilityTimeSeries:
    """Calcula la serie temporal de visibilidad Sol/Tierra y los eventos Sunset/Earthset (RF-03, RF-04)."""
    if req.window.end_utc <= req.window.start_utc:
        raise HTTPException(status_code=422, detail="end_utc debe ser posterior a start_utc")
    return compute_visibility_timeseries(req)


@router.post("/compare", response_model=ComparisonResult)
def post_compare(req: ComparisonRequest) -> ComparisonResult:
    """Compara de 1 a 4 sitios bajo identicos parametros temporales (RF-02, RF-05)."""
    if req.window.end_utc <= req.window.start_utc:
        raise HTTPException(status_code=422, detail="end_utc debe ser posterior a start_utc")
    return compare_sites(req)
