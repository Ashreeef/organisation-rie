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
import hashlib
import logging
from datetime import date, datetime
from typing import Optional

import pandas as pd

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
from .forecast import (
    predict_today,
    get_model_info,
    reset_features_cache,
    stored_menu_fingerprint,
)
from .operations import get_today_entry, save_entry, get_all_entries
from .menus import get_menus, get_menu, upsert_menu, delete_menu
from src.operational_calendar import iso_next_operational_day, is_operational_day
from src.calendar_utils import holiday_name, is_public_holiday, is_ramadan

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


def _unavailable_forecast(date_str: str, reason: str) -> TodayForecast:
    """Prévision indisponible pour une date — uniquement pour les cas où une
    prévision n'a réellement aucun sens (jour non opérationnel : vendredi/samedi).

    Un jour de service (dimanche → jeudi) SANS menu planifié n'utilise PAS ce
    chemin : le pipeline fournit une prévision via ses replis (moyennes
    historiques, calendrier, features sans menu) — ``menu_planned=False``.
    """
    d = pd.Timestamp(date_str)
    holiday = is_public_holiday(d)
    return TodayForecast(
        date=date_str,
        forecast_available=False,
        unavailable_reason=reason,
        is_ramadan=is_ramadan(d),
        is_holiday=holiday,
        holiday_name=holiday_name(d) if holiday else None,
        menu_planned=False,
    )


def _forecast_for_date(date_str: str, office_present: Optional[int] = None) -> TodayForecast:
    """Prévision du modèle pour une date de service (Dimanche → Jeudi).

    Un menu planifié est PRÉALABLE à toute prévision. Sans menu, la prévision
    est marquée indisponible : le manager doit d'abord planifier le menu pour
    que le modèle puisse calculer les quantités.

    Seuls les jours NON opérationnels (vendredi/samedi — pas de service) sont
    marqués indisponibles avec une raison spécifique.
    """
    d = pd.Timestamp(date_str)
    if not is_operational_day(d):
        return _unavailable_forecast(
            date_str,
            reason="Jour non travaillé (vendredi/samedi) — pas de service.",
        )
    if not _has_menu(date_str):
        return _unavailable_forecast(
            date_str,
            reason="Aucun menu planifié pour cette date — veuillez d'abord planifier le menu.",
        )
    try:
        result = predict_today(
            target_date=date_str,
            office_present=office_present,
        )
        model = _to_forecast_model(result)
        model.forecast_stale = _is_forecast_stale(date_str)
        model.menu_fingerprint = _current_menu_fingerprint(date_str)
        model.menu_planned = True
        return model
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forecast failed: {str(e)}")


def _current_menu_fingerprint(date_str: str) -> str:
    """Empreinte du menu *actuellement* enregistré pour une date."""
    menu = get_menu(date_str)
    if menu is None:
        return ""
    fields = ("entrees", "plat_principal_1", "plat_principal_2",
              "plat_principal_1_id", "plat_principal_2_id")
    parts = [str(menu.get(c) or "").strip() for c in fields]
    return hashlib.md5("|".join(parts).encode("utf-8")).hexdigest()


def _is_forecast_stale(date_str: str) -> bool:
    """La prévision servie reflète-t-elle le menu actuel ?

    Compare l'empreinte du menu enregistré à celle consignée dans la ligne de
    features utilisée pour l'inférence. Si les features datent d'un menu
    différent (régénération non effectuée / échouée), la prévision est périmée.
    """
    stored = stored_menu_fingerprint(date_str)
    current = _current_menu_fingerprint(date_str)
    if stored is None:
        # Pas d'empreinte stockée : on ne peut pas affirmer la fraîcheur.
        return False
    return stored != current


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
        is_ramadan=bool(data.get("is_ramadan", False)),
        is_holiday=bool(data.get("is_holiday", False)),
        holiday_name=data.get("holiday_name"),
    )


@app.get("/api/operations/today", response_model=OperationalResponse)
def operations_today():
    """Get today's operational data + forecast."""
    today = date.today().isoformat()
    forecast = _forecast_for_date(today)
    operational = get_today_entry(today)
    entry = OperationalEntry(**operational) if operational else None
    return OperationalResponse(
        date=today,
        status="active",
        forecast=forecast,
        operational=entry,
        # Source unique de vérité (calendrier opérationnel canonique) :
        # le bilan est clos uniquement quand le statut vaut 'cloturee'.
        bilan_closed=bool(entry and entry.status == "cloturee"),
        # Prochaine journée de service (dimanche -> jeudi ; jamais vendredi/
        # samedi). L'UI n'a pas à recalculer ceci.
        next_operational_day=iso_next_operational_day(today),
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
