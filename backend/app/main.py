"""Punto de entrada FastAPI del Lunar Landing Site Navigator.

Propietario: fullstack-visualizer.
Expone /api/v1/health con el sello de verificacion cientifica contra NASA JPL Horizons y monta
los routers de sitios, perfiles de hardware CSA/CLPS, horizonte, terreno 3D, visibilidad y comparacion.
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
    description="Efemerides JPL (Skyfield) + horizonte topografico LOLA sin atmosfera.",
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
    """Comprobacion de vida del servicio, version del contrato y sello de verificacion cientifica."""
    return HealthResponse(
        status="ok",
        contract_version=CONTRACT_VERSION,
        scientific_seal=compute_scientific_verification_seal(),
    )
