"""Pydantic models for the RIE API."""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


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
    # Calendrier : la date est-elle en période de Ramadan / jour férié algérien ?
    # Sert à la page /forecasts (drapeaux spéciaux + fiabilité affichée).
    is_ramadan: bool = False
    is_holiday: bool = False
    holiday_name: Optional[str] = None
    # Un menu est-il planifié pour cette date ? Quand faux, la prévision n'est
    # pas disponible : le manager doit d'abord planifier le menu.
    menu_planned: bool = True


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
    # Phase horaire du service dérivée des réglages (Horaire du service) :
    #   "before"  avant l'heure de début  -> préparation
    #   "during"  entre début et fin      -> service en cours
    #   "after"   entre fin et clôture    -> bilan à saisir
    #   "late"    après l'échéance bilan  -> bilan en retard
    service_phase: str = "before"
    service_start: str = "12:30"
    service_end: str = "13:30"
    bilan_deadline: str = "15:00"


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
    last_training: str
    data_freshness: str
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


class SettingsUpdate(BaseModel):
    site_name: Optional[str] = None
    safety_margin_pct: Optional[float] = Field(default=None, ge=0, le=25)
    service_start: Optional[str] = None
    service_end: Optional[str] = None
    bilan_deadline: Optional[str] = None


class SettingsResponse(BaseModel):
    site_name: str = "Siège — Alger"
    safety_margin_pct: float = 4.0
    service_start: str = "12:30"
    service_end: str = "13:30"
    bilan_deadline: str = "15:00"
