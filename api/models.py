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
    office_present: int
    predicted_ratio: float
    employees_count: int
    blend_scores: BlendScores
    recommended_meals: int
    confidence_lower: int
    confidence_upper: int
    confidence_level: str
    recommendation_note: str


class TodayForecastRequest(BaseModel):
    date: Optional[str] = None
    office_present: Optional[int] = None
    menu_id: Optional[str] = None


class OperationalEntry(BaseModel):
    date: str
    prepared: int
    served: int
    remaining: int = 0
    waste: int = 0
    waste_rate: float = 0.0
    menu: list[dict] = []
    comment: Optional[str] = None
    modified_at: Optional[str] = None


class OperationalResponse(BaseModel):
    date: str
    status: str
    forecast: Optional[TodayForecast] = None
    operational: Optional[OperationalEntry] = None


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
