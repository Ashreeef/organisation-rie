"""
RIE BNP Paribas - FastAPI Backend

Endpoints:
  GET  /api/health                 - Health check
  GET  /api/forecast/today         - Today's prediction from ensemble model
  POST /api/forecast               - Prediction for arbitrary date
  GET  /api/operations/today       - Today's operational data
  POST /api/operations             - Submit operational entry (prepared, served, etc.)
  PUT  /api/operations/{date}      - Modify an existing entry
  GET  /api/operations             - List all operational entries
  GET  /api/model/metrics          - Ensemble model info

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
)
from .forecast import predict_today, get_model_info
from .operations import get_today_entry, save_entry, get_all_entries

app = FastAPI(
    title="RIE BNP Paribas API",
    description="Demande de repas - Prediction et suivi operationnel",
    version="2.0.0",
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
    """Get today's prediction from the trained ensemble model."""
    today = date.today().isoformat()
    result = predict_today(target_date=today)
    return TodayForecast(**result)


@app.post("/api/forecast", response_model=TodayForecast)
def forecast_date(req: TodayForecastRequest):
    """Get prediction for a specific date."""
    target = req.date or date.today().isoformat()
    result = predict_today(
        target_date=target,
        office_present=req.office_present,
    )
    return TodayForecast(**result)


@app.get("/api/operations/today", response_model=OperationalResponse)
def operations_today():
    """Get today's operational data + forecast."""
    today = date.today().isoformat()
    forecast = predict_today(target_date=today)
    operational = get_today_entry(today)
    return OperationalResponse(
        date=today,
        status="active",
        forecast=TodayForecast(**forecast),
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
    """Get ensemble model info and metrics."""
    info = get_model_info()
    return ModelMetricsResponse(**info)
