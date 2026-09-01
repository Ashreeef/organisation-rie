"""
RIE BNP Paribas - FastAPI Backend

Endpoints:
  GET  /api/health                 - Health check
  GET  /api/forecast/today         - Today's prediction from cascade model
  POST /api/forecast               - Prediction for arbitrary date
  GET  /api/operations/today       - Today's operational data
  POST /api/operations             - Submit operational entry
  PUT  /api/operations/{date}      - Modify an existing entry
  GET  /api/operations             - List all operational entries
  GET  /api/model/metrics          - Model info and metrics

Usage:
    uvicorn api.main:app --reload --port 8000
"""
import time
from datetime import date
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    TodayForecast,
    TodayForecastRequest,
    OperationalEntry,
    OperationalResponse,
    ModelMetricsResponse,
    HealthResponse,
    BlendScores,
    MenuPlan,
)
from .forecast import predict_today, get_model_info
from .operations import get_today_entry, save_entry, get_all_entries
from .menus import get_menus, get_menu, upsert_menu, delete_menu

app = FastAPI(
    title="RIE BNP Paribas API",
    description="Demande de repas - Prediction cascade et suivi operationnel",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_start_time = time.time()


@app.get("/api/health", response_model=HealthResponse)
def health():
    info = get_model_info()
    uptime = f"{int(time.time() - _start_time)}s"
    return HealthResponse(
        status="ok",
        models_loaded=info["total_models"],
        uptime=uptime,
    )


@app.get("/api/forecast/today", response_model=TodayForecast)
def forecast_today():
    """Get today's prediction from the trained cascade model."""
    today = date.today().isoformat()
    result = predict_today(target_date=today)
    return _to_forecast_model(result)


@app.post("/api/forecast", response_model=TodayForecast)
def forecast_date(req: TodayForecastRequest):
    """Get prediction for a specific date."""
    target = req.date or date.today().isoformat()
    result = predict_today(
        target_date=target,
        office_present=req.office_present,
    )
    return _to_forecast_model(result)


def _to_forecast_model(data: dict) -> TodayForecast:
    """Convert predict_today() dict to Pydantic model."""
    return TodayForecast(
        date=data["date"],
        office_present=data["office_present"],
        predicted_ratio=data["predicted_ratio"],
        employees_count=data["employees_count"],
        blend_scores=BlendScores(**data["blend_scores"]),
        recommended_meals=data["recommended_meals"],
        confidence_lower=data["confidence_lower"],
        confidence_upper=data["confidence_upper"],
        confidence_level=data["confidence_level"],
        recommendation_note=data["recommendation_note"],
    )


@app.get("/api/operations/today", response_model=OperationalResponse)
def operations_today():
    """Get today's operational data + forecast."""
    today = date.today().isoformat()
    forecast = predict_today(target_date=today)
    operational = get_today_entry(today)
    return OperationalResponse(
        date=today,
        status="active",
        forecast=_to_forecast_model(forecast),
        operational=OperationalEntry(**operational) if operational else None,
    )


@app.post("/api/operations", response_model=OperationalEntry)
def submit_operation(entry: OperationalEntry):
    """Submit or update today's operational entry."""
    saved = save_entry(entry.model_dump())
    return OperationalEntry(**saved)


@app.put("/api/operations/{day}", response_model=OperationalEntry)
def update_operation(day: str, entry: OperationalEntry):
    """Modify an existing operational entry."""
    existing = get_today_entry(day)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"No entry for {day}")
    entry.date = day
    saved = save_entry(entry.model_dump())
    return OperationalEntry(**saved)


@app.get("/api/operations", response_model=list[OperationalEntry])
def list_operations():
    """List all operational entries."""
    entries = get_all_entries()
    return [OperationalEntry(**e) for e in entries]


@app.get("/api/model/metrics", response_model=ModelMetricsResponse)
def model_metrics():
    """Get model info and metrics."""
    info = get_model_info()
    return ModelMetricsResponse(**info)


# ---------------------------------------------------------------------------
# Menus planifiés
# ---------------------------------------------------------------------------

@app.get("/api/menus", response_model=list[MenuPlan])
def list_menus(start: Optional[str] = None, end: Optional[str] = None):
    """Liste les menus planifiés (optionnellement bornés par date)."""
    return [MenuPlan(**m) for m in get_menus(start=start, end=end)]


@app.get("/api/menus/{date}", response_model=MenuPlan)
def read_menu(date: str):
    """Retourne le menu planifié d'une date précise."""
    m = get_menu(date)
    if m is None:
        raise HTTPException(status_code=404, detail=f"Aucun menu pour {date}")
    return MenuPlan(**m)


@app.post("/api/menus", response_model=MenuPlan)
def create_menu(entry: MenuPlan):
    """Crée ou met à jour le menu planifié d'une date."""
    return MenuPlan(**upsert_menu(entry.model_dump()))


@app.put("/api/menus/{date}", response_model=MenuPlan)
def update_menu(date: str, entry: MenuPlan):
    """Met à jour le menu planifié d'une date précise."""
    entry.date = date
    return MenuPlan(**upsert_menu(entry.model_dump()))


@app.delete("/api/menus/{date}")
def remove_menu(date: str):
    """Supprime le menu planifié d'une date."""
    if not delete_menu(date):
        raise HTTPException(status_code=404, detail=f"Aucun menu pour {date}")
    return {"deleted": True, "date": date}
