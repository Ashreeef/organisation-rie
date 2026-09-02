"""
Model loading and prediction logic for the RIE cascade pipeline.

Cascade architecture:
  1. Sub-model: predicts office_present 7 days ahead
  2. Main model: predicts ratio = employees_count / office_present
  3. Calibration: DOW offsets + shrinkage → final employees_count
"""
import json
import pickle
import logging
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.calendar_utils import algerian_public_dates, ramadan_ranges  # noqa: E402

logger = logging.getLogger(__name__)

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"

_deploy_cache = None
_sub_cache = None
_features_cache = None


def _load_deployment():
    global _deploy_cache
    if _deploy_cache is None:
        path = MODELS_DIR / "_deployment.pkl"
        if path.exists():
            with open(path, "rb") as f:
                _deploy_cache = pickle.load(f)
        else:
            _deploy_cache = _build_fallback_deployment()
    return _deploy_cache


def _load_sub_model():
    global _sub_cache
    if _sub_cache is None:
        path = MODELS_DIR / "office_presence_lgb.pkl"
        if path.exists():
            with open(path, "rb") as f:
                _sub_cache = pickle.load(f)
        else:
            _sub_cache = None
    return _sub_cache


def _load_features_cache():
    global _features_cache
    if _features_cache is None:
        live = DATA_DIR / "features_live.csv"
        train = DATA_DIR / "features_train.csv"
        frames = []
        if live.exists():
            frames.append(pd.read_csv(live, parse_dates=["Date"]))
        if train.exists():
            frames.append(pd.read_csv(train, parse_dates=["Date"]))
        if frames:
            merged = pd.concat(frames, axis=0)
            merged = merged.drop_duplicates(subset="Date", keep="first")
            merged = merged.sort_values("Date")
            _features_cache = merged
        else:
            _features_cache = None
    return _features_cache


def reset_features_cache() -> None:
    """Invalidate la mémoïsation in-process des features.

    À appeler après avoir régénéré ``features_live.csv`` (ex. changement de
    menu) pour que la prochaine prévision lise les nouvelles features.
    """
    global _features_cache
    _features_cache = None


def stored_menu_fingerprint(date) -> Optional[str]:
    """Empreinte du menu enregistrée dans la ligne de features d'une date.

    Retourne None si aucune ligne / aucune colonne ``menu_fp`` n'est dispo.
    """
    try:
        d = pd.Timestamp(date).normalize()
        features_df = _load_features_cache()
        if features_df is None or "menu_fp" not in features_df.columns:
            return None
        match = features_df[features_df["Date"].dt.normalize() == d]
        if match.empty:
            return None
        v = match.iloc[0].get("menu_fp")
        return ("" if pd.isna(v) else str(v).strip())
    except Exception:
        return None


def _build_fallback_deployment():
    """Minimal fallback when no deployment bundle exists."""
    return {
        "lgb_models": [], "xgb_models": [], "cb_models": [],
        "best_blend_w": np.array([0.018, 0.089, 0.893]),
        "offsets": {6: -6.0, 0: -7.8, 1: -10.2, 2: -5.4, 3: -9.0},
        "dow_mean_actual": {6: 310.0, 0: 295.0, 1: 290.0, 2: 300.0, 3: 298.0},
        "lam_opt": 0.726,
        "clip_lo": 230.0,
        "clip_hi": 520.0,
        "feat_cols": [],
        "lgb_alphas": [0.65, 0.68, 0.71, 0.74, 0.77, 0.80],
        "lgb_seeds": [42, 7, 2024, 1337],
        "xgb_alphas": [0.68, 0.71, 0.74],
        "xgb_seeds": [42, 7, 2024],
        "cb_seeds": [42, 7, 2024],
        "lgb_alpha_weights": {},
        "lgb_weights_arr": np.ones(6) / 6,
        "avg_lgb_params": {},
        "xgb_params": {},
        "cb_params": {},
        "has_catboost": False,
        "oof_metrics": {"AsymCost": 18.98, "RMSE": 24.74, "MAE": 17.13},
    }


def get_model_info() -> dict:
    """Return model metadata for the /api/model/metrics endpoint."""
    dep = _load_deployment()
    lgb_count = len(dep.get("lgb_models", []))
    xgb_count = len(dep.get("xgb_models", []))
    cb_count = len(dep.get("cb_models", []))
    total = lgb_count + xgb_count + cb_count

    # If no trained models saved yet, report config counts
    if total == 0:
        lgb_count = len(dep.get("lgb_alphas", [])) * len(dep.get("lgb_seeds", []))
        xgb_count = len(dep.get("xgb_alphas", [])) * len(dep.get("xgb_seeds", []))
        cb_count = len(dep.get("cb_seeds", []))
        total = lgb_count + xgb_count + cb_count

    metrics = dep.get("oof_metrics", {})
    return {
        "version": "3.0",
        "total_models": total,
        "lgb_count": lgb_count,
        "xgb_count": xgb_count,
        "catboost_count": cb_count,
        "lgb_weight": float(dep.get("best_blend_w", [0.02, 0.09, 0.89])[0]),
        "xgb_weight": float(dep.get("best_blend_w", [0.02, 0.09, 0.89])[1]),
        "catboost_weight": float(dep.get("best_blend_w", [0.02, 0.09, 0.89])[2]) if len(dep.get("best_blend_w", [])) > 2 else 0.0,
        "calibration_lambda": float(dep.get("lam_opt", 0.726)),
        "oof_metrics": {
            "Asym. Cost": metrics.get("AsymCost", 18.98),
            "MAE (repas)": metrics.get("MAE", 17.13),
            "RMSE (repas)": metrics.get("RMSE", 24.74),
        },
        "feature_count": len(dep.get("feat_cols", [])),
    }


def predict_today(
    target_date: Optional[str] = None,
    office_present: Optional[int] = None,
) -> dict:
    """Run cascade inference for a given date.

    Pipeline:
      1. Sub-model predicts office_present (7 days ahead)
      2. Main ensemble predicts ratio
      3. Calibration: count = ratio * office_present → DOW offset → shrinkage
    """
    dep = _load_deployment()

    if target_date is None:
        target_date = pd.Timestamp.now().normalize().strftime("%Y-%m-%d")

    d = pd.Timestamp(target_date)
    logger.info(f"predict_today called for {target_date}")

    # --- Stage 1: Sub-model (office presence) ---
    if office_present is not None:
        op_pred = float(office_present)
        logger.debug(f"Using provided office_present={op_pred}")
    else:
        op_pred = _predict_office_present(d)

    # --- Try to get pre-computed features from CSV ---
    features_df = _load_features_cache()
    row_features = None
    if features_df is not None:
        match = features_df[features_df["Date"] == d]
        if len(match) > 0:
            row_features = match.iloc[0]

    # --- Stage 2: Main ensemble (ratio prediction) ---
    if row_features is not None:
        ratio_pred = _predict_ratio_from_features(dep, row_features)
        # Préférer la valeur du fichier de features (observée pour l'historique,
        # prédiction du replayer office pour l'horizon live).
        op_val = _office_from_features_row(row_features)
        if op_val is not None:
            op_pred = op_val
    else:
        ratio_pred = _predict_ratio_calendar_only(dep, d, op_pred)

    # --- Stage 3: Convert ratio to count ---
    raw_count = ratio_pred * op_pred

    # DOW offset calibration
    dow = _algerian_dow(d)
    offsets = dep.get("offsets", {})
    if dow in offsets:
        raw_count += offsets[dow]

    # Shrinkage toward DOW mean
    lam = dep.get("lam_opt", 0.726)
    dow_means = dep.get("dow_mean_actual", {})
    if dow in dow_means:
        raw_count = lam * raw_count + (1 - lam) * dow_means[dow]

    # Clip and round
    clip_lo = dep.get("clip_lo", 230.0)
    clip_hi = dep.get("clip_hi", 520.0)
    count = float(np.clip(raw_count, clip_lo, clip_hi))
    count_int = int(round(count))

    # --- Confidence interval ---
    spread = max(10, int(round(op_pred * 0.045)))
    safety = 0.06 if _is_ramadan(d) else 0.04
    recommended = int(round(count_int * (1 + safety)))

    # --- Blend scores (for diagnostics) ---
    bw = dep.get("best_blend_w", [0.02, 0.09, 0.89])
    blend_scores = {
        "lgb": round(float(bw[0]), 4),
        "xgb": round(float(bw[1]), 4),
        "catboost": round(float(bw[2]), 4) if len(bw) > 2 else 0.0,
    }

    notes = _build_notes(target_date, int(round(op_pred)), ratio_pred)

    result = {
        "date": target_date,
        "office_present": int(round(op_pred)),
        "predicted_ratio": round(ratio_pred, 4),
        "employees_count": count_int,
        "blend_scores": blend_scores,
        "recommended_meals": recommended,
        "confidence_lower": max(0, count_int - spread),
        "confidence_upper": count_int + spread,
        "confidence_level": "high" if spread <= 18 else "medium" if spread <= 28 else "low",
        "recommendation_note": notes,
    }
    
    logger.info(f"Final prediction: {count_int} employees ({recommended} recommended), ratio={ratio_pred:.3f}")
    return result


def _office_from_features_row(row: pd.Series) -> Optional[float]:
    """Valeur office de référence depuis une ligne de features.

    Historique (features_train.csv) : ``office_present`` réel.
    Horizon live (features_live.csv) : ``office_present == office_present_pred``
    (prédiction du replayer du sous-modèle office).
    """
    for col in ("office_present", "office_present_pred"):
        if col in row.index and pd.notna(row.get(col)):
            return float(row[col])
    return None


def _predict_office_present(d: pd.Timestamp) -> float:
    """Fallback ``office_present`` pour une date sans ligne de features.

    Rejoue le sous-modèle du notebook 04 via
    ``daily_features.roll_office_forward`` — les mêmes features que la
    génération quotidienne, aucune liste manuelle. En dernier recours :
    moyenne réelle par jour de semaine du déploiement.
    """
    sub = _load_sub_model()
    if sub is None or sub.get("model") is None or not sub.get("features"):
        logger.debug(f"Sub-model not available for {d.date()}, using DOW fallback")
        return _office_dow_fallback(d)
    try:
        history = pd.read_csv(DATA_DIR / "real_clean.csv", parse_dates=["Date"])
        if len(history) < 60:
            logger.warning(f"History too short ({len(history)} rows), using DOW fallback")
            raise ValueError("historique trop court")
        from src.forecasting.daily_features import roll_office_forward
        preds = roll_office_forward(history, [d])
        val = preds.get(d)
        if val is not None and pd.notna(val):
            logger.debug(f"Predicted office_present={val:.1f} for {d.date()}")
            return float(val)
    except Exception as e:
        logger.warning(f"Error predicting office_present for {d.date()}: {e}. Using DOW fallback.")
    return _office_dow_fallback(d)


def _office_dow_fallback(d: pd.Timestamp) -> float:
    """Repli statistique : moyenne réelle du jour de semaine (déploiement)."""
    dep = _load_deployment()
    means = dep.get("dow_mean_actual", {})
    dow = _algerian_dow(d)
    op = float(means.get(dow, np.nan))
    if pd.isna(op):
        vals = list(means.values())
        op = float(np.mean(vals)) if vals else 310.0
    if _is_holiday(d):
        op *= 0.5
    return float(np.clip(op, dep.get("clip_lo", 230.0), dep.get("clip_hi", 520.0)))


def _predict_ratio_from_features(dep: dict, row: pd.Series) -> float:
    """Predict ratio using trained models and pre-computed features."""
    feat_cols = dep.get("feat_cols", [])
    if not feat_cols:
        return 0.62

    # Build feature vector
    X = pd.DataFrame([{col: row.get(col, 0) if col in row.index else 0 for col in feat_cols}])
    for col in X.columns:
        if X[col].isna().any():
            X[col] = X[col].fillna(0)

    X_arr = X[feat_cols].values

    # LGB prediction
    lgb_models = dep.get("lgb_models", [])
    lgb_alpha_weights = dep.get("lgb_alpha_weights", {})
    lgb_weights_arr = dep.get("lgb_weights_arr", np.ones(6) / 6)

    lgb_ratio = 0.0
    if lgb_models:
        # Group by alpha, average seeds, then weight
        alpha_preds = {}
        for alpha, seed, model in lgb_models:
            pred = model.predict(X_arr)[0]
            alpha_preds.setdefault(alpha, []).append(pred)
        alpha_means = np.array([np.mean(alpha_preds[a]) for a in sorted(alpha_preds.keys())])
        lgb_ratio = float(alpha_means @ lgb_weights_arr[:len(alpha_means)])
    else:
        lgb_ratio = 0.62

    # XGB prediction
    xgb_models = dep.get("xgb_models", [])
    if xgb_models:
        alpha_preds = {}
        for alpha, seed, model in xgb_models:
            pred = model.predict(X_arr)[0]
            alpha_preds.setdefault(alpha, []).append(pred)
        xgb_ratio = float(np.mean([np.mean(v) for v in alpha_preds.values()]))
    else:
        xgb_ratio = lgb_ratio

    # CatBoost prediction
    cb_models = dep.get("cb_models", [])
    if cb_models:
        cb_preds = [m.predict(X_arr)[0] for _, m in cb_models]
        cb_ratio = float(np.mean(cb_preds))
    else:
        cb_ratio = lgb_ratio

    # Blend
    bw = dep.get("best_blend_w", [0.02, 0.09, 0.89])
    ratio = bw[0] * lgb_ratio + bw[1] * xgb_ratio
    if len(bw) > 2 and cb_models:
        ratio += bw[2] * cb_ratio

    return float(np.clip(ratio, 0.30, 0.88))


def _predict_ratio_calendar_only(dep: dict, d: pd.Timestamp, op_pred: float) -> float:
    """Fallback ratio prediction using only calendar features."""
    dow = _algerian_dow(d)
    # DOW-based defaults (from training data patterns)
    dow_defaults = {6: 0.60, 0: 0.58, 1: 0.57, 2: 0.61, 3: 0.59}
    ratio = dow_defaults.get(dow, 0.60)

    if _is_ramadan(d):
        ratio *= 0.85
    if _is_holiday(d):
        ratio *= 0.50

    return float(np.clip(ratio, 0.30, 0.88))


# --- Calendar helpers ---

def _algerian_dow(d: pd.Timestamp) -> int:
    """Algerian work week: Sun=6, Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5"""
    return (d.dayofweek + 1) % 7


def _is_ramadan(d: pd.Timestamp) -> bool:
    """Ramadan (convention notebook 03) — calendrier via src.calendar_utils."""
    return any(start <= d <= end for start, end in ramadan_ranges([d.year]))


def _is_holiday(d: pd.Timestamp) -> bool:
    """Jour férié algérien (fixe ou islamique) — via src.calendar_utils."""
    return d in algerian_public_dates([d.year])


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
    return f"Calendrier: {cal} | Presence bureau: {office} | Ratio: {ratio:.3f}"
