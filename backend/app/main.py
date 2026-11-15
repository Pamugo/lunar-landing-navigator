"""FastAPI entry point for the Lunar Landing Site Navigator.

Owner: fullstack-visualizer.
Exposes /api/v1/health with the scientific verification seal against NASA JPL Horizons and mounts
the routers for sites, CSA/CLPS hardware profiles, horizon, 3D terrain, visibility, and comparison.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router as v1_router
from app.models.schemas import CONTRACT_VERSION, HealthResponse
from app.services.ephemeris import compute_scientific_verification_seal

app = FastAPI(
    title="Lunar Landing Site Navigator API",
    version=CONTRACT_VERSION,
    description="JPL ephemeris (Skyfield) + airless LOLA topographic horizon.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(v1_router)


@app.get("/api/v1/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    """Service health check, contract version, and scientific verification seal."""
    return HealthResponse(
        status="ok",
        contract_version=CONTRACT_VERSION,
        scientific_seal=compute_scientific_verification_seal(),
    )
