"""Pydantic models for the RIE API."""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class BlendScores(BaseModel):
    lgb: float
    xgb: float
    catboost: float


class TodayForecast(BaseModel):
    date: str
    forecast_available: bool = True
    unavailable_reason: Optional[str] = None
    office_present: int = 0
    predicted_ratio: float = 0.0
    employees_count: int = 0
    blend_scores: BlendScores = BlendScores(lgb=0.0, xgb=0.0, catboost=0.0)
    recommended_meals: int = 0
    confidence_lower: int = 0
    confidence_upper: int = 0
    confidence_level: str = "low"
    recommendation_note: str = ""
    forecast_stale: bool = False
    menu_fingerprint: str = ""


class TodayForecastRequest(BaseModel):
    date: Optional[str] = None
    office_present: Optional[int] = None
    menu_id: Optional[str] = None


class OperationalEntry(BaseModel):
    """Operational entry for a single service day.

    Serves as the single source of truth for the daily service lifecycle:
    preparation → service → bilan_a_saisir → bilan_a_confirmer → cloturee.
    """
    date: str
    status: str = "preparation"
    prepared: int = 0
    served: int = 0
    remaining: int = 0
    waste: int = 0
    waste_rate: float = 0.0
    planned_meals: int = 0
    actual_meals: int = 0
    presence: int = 0
    forecast: int = 0
    menu: list[dict] = []
    bilan: dict = {}
    comment: Optional[str] = None
    modified_at: Optional[str] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[str] = None


class LifecycleStatusUpdate(BaseModel):
    status: str


class PlannedMealsUpdate(BaseModel):
    planned_meals: Optional[int] = None
    presence: Optional[int] = None
    forecast: Optional[int] = None
    menu: Optional[list[dict]] = None


class BilanSubmission(BaseModel):
    prepared: int = 0
    served: int = 0
    menu: Optional[list[dict]] = None
    comment: Optional[str] = None


class OperationalResponse(BaseModel):
    date: str
    status: str
    forecast: Optional[TodayForecast] = None
    operational: Optional[OperationalEntry] = None
    # Le bilan du jour est-il clos ? (source unique : statut 'cloturee')
    bilan_closed: bool = False
    # Prochaine journée de service (dimanche -> jeudi ; vendredi/samedi exclus).
    # Calculée côté backend par le calendrier opérationnel canonique — l'UI ne
    # doit jamais faire de "date + 1 jour" pour la dériver.
    next_operational_day: str = ""


class ModelMetricsResponse(BaseModel):
    version: str
    total_models: int
    lgb_count: int
    xgb_count: int
    catboost_count: int
    lgb_weight: float
    xgb_weight: float
    catboost_weight: float
    calibration_lambda: float
    oof_metrics: dict
    feature_count: int


class HealthResponse(BaseModel):
    status: str
    models_loaded: int
    uptime: str


class MenuPlan(BaseModel):
    date: str
    entrees: str = ""
    plat_principal_1: str = ""
    plat_principal_2: str = ""
    plat_principal_1_id: str = ""
    plat_principal_2_id: str = ""
