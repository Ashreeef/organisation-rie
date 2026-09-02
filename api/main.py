"""
RIE BNP Paribas - FastAPI Backend

Endpoints:
  GET  /api/health                 - Health check (public)
  GET  /api/forecast/today         - Today's prediction (may require auth)
  POST /api/forecast               - Prediction for arbitrary date (may require auth)
  GET  /api/operations/today       - Today's operational data (may require auth)
  POST /api/operations             - Submit operational entry (may require auth)
  PUT  /api/operations/{date}      - Modify entry (may require auth)
  GET  /api/operations             - List all entries (may require auth)
  GET  /api/model/metrics          - Model info (may require auth)
  POST /api/auth/token             - Get JWT token (if auth enabled)

Usage:
    # Development
    uvicorn api.main:app --reload --port 8000
    
    # Production
    ENVIRONMENT=production CORS_ORIGINS=https://domain.com uvicorn api.main:app --port 8000
    
    # With authentication
    ENABLE_AUTHENTICATION=true SECRET_KEY=your-secret-key uvicorn api.main:app --port 8000
"""
import time
import logging
from datetime import date, datetime
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
    LifecycleStatusUpdate,
    PlannedMealsUpdate,
    BilanSubmission,
)
from .forecast import predict_today, get_model_info
from .operations import get_today_entry, save_entry, get_all_entries
from .menus import get_menus, get_menu, upsert_menu, delete_menu

app = FastAPI(
    title="RIE BNP Paribas Forecasting API",
    description="Meal demand prediction and operational tracking",
    version="1.0.0",
    debug=True,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_start_time = time.time()


# ============================================================================
# Public Endpoints (no authentication required)
# ============================================================================

@app.get("/api/health", response_model=HealthResponse)
def health():
    """Health check endpoint - always public."""
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
    return _forecast_for_date(today)


@app.post("/api/forecast", response_model=TodayForecast)
def forecast_date(req: TodayForecastRequest):
    """Get prediction for a specific date (only if its menu is planned)."""
    target = req.date or date.today().isoformat()
    return _forecast_for_date(target, office_present=req.office_present)


def _has_menu(date_str: str) -> bool:
    """Un menu est-il planifié pour cette date ? (source de vérité backend)."""
    menu = get_menu(date_str)
    if menu is None:
        return False
    return any((menu.get(c) or "").strip()
               for c in ("entrees", "plat_principal_1", "plat_principal_2"))


def _unavailable_forecast(date_str: str) -> TodayForecast:
    return TodayForecast(
        date=date_str,
        forecast_available=False,
        unavailable_reason="Le menu de cette journée n'est pas renseigné.",
    )


def _forecast_for_date(date_str: str, office_present: Optional[int] = None) -> TodayForecast:
    """Retourne la prévision pour une date — mais uniquement si un menu est planifié.

    La prévision dépend du menu (features texte → intensité → ratio). Sans menu,
    il n'y a pas de prévision valide : on renvoie un état explicite
    ``forecast_available=False`` plutôt qu'un calcul tiré de nulle part.
    """
    if not _has_menu(date_str):
        return _unavailable_forecast(date_str)
    try:
        result = predict_today(
            target_date=date_str,
            office_present=office_present,
        )
        return _to_forecast_model(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")


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
    forecast = _forecast_for_date(today)
    operational = get_today_entry(today)
    return OperationalResponse(
        date=today,
        status="active",
        forecast=forecast,
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


# ---------------------------------------------------------------------------
# Service lifecycle (single source of truth on the backend)
# ---------------------------------------------------------------------------

def _today_or_new(day: Optional[str] = None) -> dict:
    if day is None:
        day = date.today().isoformat()
    entry = get_today_entry(day)
    if entry is None:
        entry = OperationalEntry(date=day).model_dump()
    else:
        entry = OperationalEntry(**entry).model_dump()
    return entry


@app.post("/api/operations/today/status", response_model=OperationalEntry)
def update_lifecycle_status(req: LifecycleStatusUpdate):
    """Avance le cycle de service du jour (preparation/service/bilan/cloturee)."""
    allowed = {"preparation", "service", "bilan_a_saisir", "bilan_a_confirmer", "cloturee"}
    if req.status not in allowed:
        raise HTTPException(status_code=422, detail=f"Statut invalide: {req.status}")
    entry = _today_or_new()
    entry["status"] = req.status
    if req.status == "cloturee":
        entry["confirmed_at"] = datetime.now().isoformat()
    return OperationalEntry(**save_entry(entry))


@app.post("/api/operations/{day}/planned", response_model=OperationalEntry)
def update_planned(day: str, req: PlannedMealsUpdate):
    """Enregistre la planification du jour/demain (repas prévus, présence, menu)."""
    entry = _today_or_new(day)
    if req.planned_meals is not None:
        entry["planned_meals"] = req.planned_meals
    if req.presence is not None:
        entry["presence"] = req.presence
    if req.forecast is not None:
        entry["forecast"] = req.forecast
    if req.menu is not None:
        entry["menu"] = req.menu
    return OperationalEntry(**save_entry(entry))


@app.post("/api/operations/{day}/bilan", response_model=OperationalEntry)
def submit_bilan(day: str, req: BilanSubmission):
    """Enregistre le bilan (preparés/servis) et passe à l'état 'bilan_a_confirmer'."""
    entry = _today_or_new(day)
    prepared = req.prepared
    served = req.served
    remaining = max(0, prepared - served)
    waste_rate = round((remaining / prepared) * 100, 1) if prepared > 0 else 0.0
    entry.update({
        "prepared": prepared,
        "served": served,
        "remaining": remaining,
        "waste": remaining,
        "waste_rate": waste_rate,
        "bilan": {
            "date": day,
            "prepared": prepared,
            "served": served,
            "remaining": remaining,
            "wasteRate": waste_rate,
            "comment": req.comment,
            "menu": req.menu or [],
        },
        "status": "bilan_a_confirmer",
    })
    if req.menu is not None:
        entry["menu"] = req.menu
    if req.comment is not None:
        entry["comment"] = req.comment
    return OperationalEntry(**save_entry(entry))


@app.post("/api/operations/{day}/confirm", response_model=OperationalEntry)
def confirm_bilan(day: str):
    """Confirme le bilan et clôture la journée."""
    entry = _today_or_new(day)
    entry["status"] = "cloturee"
    entry["confirmed_at"] = datetime.now().isoformat()
    return OperationalEntry(**save_entry(entry))


@app.post("/api/operations/{day}/edit-bilan", response_model=OperationalEntry)
def edit_bilan(day: str):
    """Rouvre le bilan pour édition (retour à 'bilan_a_saisir')."""
    entry = _today_or_new(day)
    entry["status"] = "bilan_a_saisir"
    return OperationalEntry(**save_entry(entry))


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
