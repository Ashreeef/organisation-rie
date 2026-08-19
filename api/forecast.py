"""Model loading and prediction logic."""
import json
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional
import joblib


MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
_meta_cache = None
_models_cache = None


def _load_meta():
    global _meta_cache
    if _meta_cache is None:
        with open(MODELS_DIR / "ensemble_meta.json", encoding="utf-8") as f:
            _meta_cache = json.load(f)
    return _meta_cache


def _load_models():
    global _models_cache
    if _models_cache is None:
        meta = _load_meta()
        _models_cache = {}
        for name in meta["model_names"]:
            path = MODELS_DIR / f"{name}.joblib"
            if path.exists():
                _models_cache[name] = joblib.load(path)
    return _models_cache


def get_model_info() -> dict:
    meta = _load_meta()
    models = _load_models()
    lgbm_count = sum(1 for n in meta["model_names"] if n.startswith("LGBM"))
    xgb_count = sum(1 for n in meta["model_names"] if n.startswith("XGB"))
    lgbm_alphas = sorted(set(
        float(n.split("_a")[1].split("_")[0])
        for n in meta["model_names"] if n.startswith("LGBM")
    ))
    xgb_alphas = sorted(set(
        float(n.split("_a")[1].split("_")[0])
        for n in meta["model_names"] if n.startswith("XGB")
    ))
    return {
        "version": "2.0",
        "total_models": len(models),
        "lgbm_count": lgbm_count,
        "xgb_count": xgb_count,
        "lgbm_alphas": lgbm_alphas,
        "xgb_alphas": xgb_alphas,
        "oof_metrics": meta.get("metrics", {}),
        "feature_count": len(meta.get("feature_cols", [])),
    }


def predict_today(
    target_date: Optional[str] = None,
    office_present: Optional[int] = None,
) -> dict:
    """Predict today's meal count using the trained ensemble.

    If target_date is None, uses today's date.
    If office_present is None, uses the mean from training data.
    """
    meta = _load_meta()
    models = _load_models()
    weights = meta["weights"]
    feature_cols = meta["feature_cols"]

    if target_date is None:
        target_date = pd.Timestamp.now().normalize().strftime("%Y-%m-%d")

    d = pd.Timestamp(target_date)

    # Build minimal feature vector from calendar + defaults
    row = _build_feature_row(target_date, office_present, feature_cols)
    X = pd.DataFrame([row])[feature_cols]

    # Encode categoricals the same way prepare_matrices does
    cat_cols = ["conditions", "type precipitation"]
    for col in cat_cols:
        if col in X.columns:
            X[col] = X[col].fillna("none").astype(str)
            cats = sorted(X[col].unique())
            cat_map = {v: i for i, v in enumerate(cats)}
            X[col] = X[col].map(cat_map).fillna(0).astype(int)

    # Impute any NaN
    for col in X.columns:
        if X[col].isna().any():
            X[col] = X[col].fillna(0)

    # Weighted ensemble prediction
    ratio_pred = 0.0
    for name, model in models.items():
        w = weights.get(name, 0.0)
        if w > 0:
            ratio_pred += w * model.predict(X)[0]

    ratio_pred = float(np.clip(ratio_pred, 0.20, 0.95))

    if office_present is None:
        office_present = 487  # default from training data mean

    predicted = int(round(ratio_pred * office_present))
    predicted = max(0, predicted)

    # Confidence interval from historical std (~0.045)
    spread = max(10, int(round(office_present * 0.045)))
    safety = 0.06 if _is_ramadan(d) else 0.04
    recommended = int(round(predicted * (1 + safety)))

    notes = _build_notes(target_date, office_present, ratio_pred)

    return {
        "date": target_date,
        "predicted_meals": predicted,
        "confidence_lower": max(0, predicted - spread),
        "confidence_upper": predicted + spread,
        "confidence_level": "high" if spread <= 18 else "medium" if spread <= 28 else "low",
        "recommended_meals": recommended,
        "expected_presence": office_present,
        "attendance_ratio": round(ratio_pred, 4),
        "recommendation_note": notes,
    }


def _build_feature_row(date_str: str, office_present: Optional[int], feature_cols: list[str]) -> dict:
    """Build a minimal feature row for prediction."""
    d = pd.Timestamp(date_str)
    row = {}

    # Calendar features
    row["dayofweek"] = (d.dayofweek + 1) % 7
    row["is_weekend"] = 1 if d.dayofweek >= 5 else 0
    row["month"] = d.month
    row["day"] = d.day
    row["week"] = d.isocalendar()[1]

    # Ramadan / holiday
    row["is_ramadan"] = 1 if _is_ramadan(d) else 0
    row["is_holiday"] = 1 if _is_holiday(d) else 0

    # Weather defaults (clear day)
    row["temperature_2m_mean"] = 22.0
    row["rain_sum"] = 0.0
    row["wind_speed_10m_max"] = 10.0
    row["weathercode"] = 0
    row["conditions"] = "Clear"
    row["type precipitation"] = "none"

    # Headcount
    row["office_present"] = office_present or 487
    row["employees_count"] = 0  # unknown at prediction time

    # Lag features (use ratio averages from training)
    row["lag_1"] = 0.73
    row["lag_2"] = 0.73
    row["lag_3"] = 0.73
    row["lag_5"] = 0.73
    row["lag_7"] = 0.73
    row["rolling_mean_3"] = 0.73
    row["rolling_mean_5"] = 0.73
    row["rolling_mean_7"] = 0.73
    row["rolling_mean_14"] = 0.73
    row["rolling_std_7"] = 0.045
    row["rolling_std_14"] = 0.045

    # Ratio target
    row["ratio"] = 0.73

    # Fill any remaining feature cols with 0
    for col in feature_cols:
        if col not in row:
            row[col] = 0

    return row


def _is_ramadan(d: pd.Timestamp) -> bool:
    year = d.year
    windows = {
        2024: ("2024-03-11", "2024-04-09"),
        2025: ("2025-03-01", "2025-03-30"),
        2026: ("2026-02-18", "2026-03-19"),
        2027: ("2027-02-08", "2027-03-09"),
    }
    if year not in windows:
        return False
    start, end = windows[year]
    return pd.Timestamp(start) <= d <= pd.Timestamp(end)


def _is_holiday(d: pd.Timestamp) -> bool:
    key = f"{d.year}-{d.month:02d}-{d.day:02d}"
    fixed = {
        f"{d.year}-01-01",
        f"{d.year}-05-01",
        f"{d.year}-07-05",
        f"{d.year}-11-01",
    }
    return key in fixed


def _build_notes(date_str: str, office: int, ratio: float) -> str:
    d = pd.Timestamp(date_str)
    parts = []
    if _is_ramadan(d):
        parts.append("Ramadan")
    if d.dayofweek >= 5:
        parts.append("Weekend")
    if _is_holiday(d):
        parts.append("Jour ferie")
    cal = "Hors Ramadan" if not parts else ", ".join(parts)
    return f"Calendrier: {cal} | Presence: {office} | Ratio: {ratio:.3f}"
