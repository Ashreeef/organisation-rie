"""Pydantic models for the RIE API."""
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel


class TodayForecast(BaseModel):
    date: str
    predicted_meals: int
    confidence_lower: int
    confidence_upper: int
    confidence_level: str
    recommended_meals: int
    expected_presence: int
    attendance_ratio: float
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
    lgbm_count: int
    xgb_count: int
    lgbm_alphas: list[float]
    xgb_alphas: list[float]
    oof_metrics: dict
    feature_count: int


class HealthResponse(BaseModel):
    status: str
    models_loaded: int
    uptime: str
