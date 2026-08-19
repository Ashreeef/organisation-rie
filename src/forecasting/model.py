"""
Layer 1 - Prevision de la demande.

Multi-alpha LightGBM + XGBoost ensemble for quantile regression.
No CatBoost. XGBoost adds structural diversity.

Ensemble strategy:
  - 24 LightGBM models: 8 alphas x 3 seeds
  - 9 XGBoost models: 3 alphas x 3 seeds
  - Weighted by inverse asymmetric cost on OOF predictions
"""
import json
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.model_selection import TimeSeriesSplit


# ---------------------------------------------------------------------------
# 1. Metrics
# ---------------------------------------------------------------------------

def asymmetric_cost(y_true, y_pred) -> float:
    """Cout asymetrique : sous-estimation penalisee 2x. Normalise par sum(y_true)."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    diff = y_pred - y_true
    denom = np.sum(y_true)
    if denom == 0:
        return float("inf")
    return float(np.sum(np.where(diff < 0, -2 * diff, diff)) / denom)


def ratio_to_count(ratio_pred: np.ndarray, office_present: np.ndarray) -> np.ndarray:
    """Convertit les predictions de ratio en nombre de repas entier."""
    return np.clip(np.rint(ratio_pred * office_present), 0, None).astype(int)


def evaluate(y_true_ratio, y_pred_ratio, office) -> dict:
    """Evalue les predictions en ratio ET en volume absolu."""
    y_true_count = np.round(y_true_ratio.values * office).astype(int)
    y_pred_count = ratio_to_count(y_pred_ratio, office)
    return {
        "MAE (repas)" : round(mean_absolute_error(y_true_count, y_pred_count), 2),
        "RMSE (repas)": round(np.sqrt(mean_squared_error(y_true_count, y_pred_count)), 2),
        "Asym. Cost"  : round(asymmetric_cost(y_true_count, y_pred_count), 5),
        "MAE (ratio)" : round(mean_absolute_error(y_true_ratio, y_pred_ratio), 5),
    }


# ---------------------------------------------------------------------------
# 2. Data Preparation
# ---------------------------------------------------------------------------

CAT_COLS = ["conditions", "type precipitation"]


def prepare_matrices(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    feature_cols: List[str],
) -> Tuple[pd.DataFrame, pd.Series, pd.DataFrame, np.ndarray, List[str]]:
    """Impute, encode, return X_train, y_ratio, X_test, office_test, cat_cols."""
    cat_cols = [c for c in CAT_COLS if c in feature_cols]
    num_cols = [c for c in feature_cols if c not in cat_cols]

    X_tr = train_df[feature_cols].copy()
    X_te = test_df[[c for c in feature_cols if c in test_df.columns]].copy()

    for col in cat_cols:
        X_tr[col] = X_tr[col].fillna("none").astype(str)
        X_te[col] = X_te[col].fillna("none").astype(str) if col in X_te.columns else "none"
        all_cats = sorted(set(X_tr[col].unique()) | set(X_te[col].unique()))
        cat_map  = {v: i for i, v in enumerate(all_cats)}
        X_tr[col] = X_tr[col].map(cat_map).astype(int)
        X_te[col] = X_te[col].map(cat_map).fillna(0).astype(int)

    medians = X_tr[num_cols].median()
    X_tr[num_cols] = X_tr[num_cols].fillna(medians)
    X_te[num_cols] = X_te[num_cols].fillna(medians)

    for col in feature_cols:
        if col not in X_te.columns:
            X_te[col] = medians.get(col, 0)
    X_te = X_te[feature_cols]

    y_ratio = (train_df["employees_count"] / train_df["office_present"]).astype(float)
    office_test = test_df["office_present"].values

    return X_tr, y_ratio, X_te, office_test, cat_cols


# ---------------------------------------------------------------------------
# 3. Ensemble Definition
# ---------------------------------------------------------------------------

LGBM_ALPHAS = [0.65, 0.68, 0.70, 0.73, 0.75, 0.78, 0.80, 0.82]
LGBM_SEEDS  = [42, 123, 456]

XGB_ALPHAS  = [0.70, 0.73, 0.76]
XGB_SEEDS   = [42, 123, 456]

LGBM_BASE_PARAMS = dict(
    n_estimators      = 500,
    learning_rate     = 0.04,
    num_leaves        = 31,
    min_child_samples = 12,
    subsample         = 0.85,
    subsample_freq    = 1,
    colsample_bytree  = 0.85,
    reg_alpha         = 0.1,
    reg_lambda        = 1.0,
    verbosity         = -1,
)

XGB_BASE_PARAMS = dict(
    objective         = "reg:quantileerror",
    n_estimators      = 500,
    learning_rate     = 0.04,
    max_depth         = 6,
    subsample         = 0.85,
    colsample_bytree  = 0.85,
    reg_alpha         = 0.1,
    reg_lambda        = 1.0,
    verbosity         = 0,
)


def _build_ensemble_configs():
    from lightgbm import LGBMRegressor
    from xgboost import XGBRegressor
    configs = []
    for alpha in LGBM_ALPHAS:
        for seed in LGBM_SEEDS:
            name = f"LGBM_a{alpha:.2f}_s{seed}"
            params = {**LGBM_BASE_PARAMS, "objective": "quantile", "alpha": alpha, "random_state": seed}
            configs.append((name, LGBMRegressor, params))
    for alpha in XGB_ALPHAS:
        for seed in XGB_SEEDS:
            name = f"XGB_a{alpha:.2f}_s{seed}"
            params = {**XGB_BASE_PARAMS, "quantile_alpha": alpha, "random_state": seed}
            configs.append((name, XGBRegressor, params))
    return configs


# ---------------------------------------------------------------------------
# 4. Training
# ---------------------------------------------------------------------------

def train_ensemble(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    feature_cols: List[str],
    n_cv: int = 5,
) -> dict:
    X_train, y_ratio, X_test, office_test, cat_cols = prepare_matrices(
        train_df, test_df, feature_cols
    )
    office_arr = train_df["office_present"].values
    configs = _build_ensemble_configs()
    tscv = TimeSeriesSplit(n_splits=n_cv)
    oof_preds = np.zeros((len(X_train), len(configs)))
    cv_costs = []

    print(f"  Training {len(configs)} models...")

    for i, (name, model_cls, params) in enumerate(configs):
        fold_costs = []
        oof_col = np.zeros(len(X_train))

        for tr_idx, val_idx in tscv.split(X_train):
            m = model_cls(**params)
            m.fit(X_train.iloc[tr_idx], y_ratio.iloc[tr_idx])
            preds = m.predict(X_train.iloc[val_idx])
            oof_col[val_idx] = preds
            y_cnt = np.round(y_ratio.iloc[val_idx].values * office_arr[val_idx]).astype(int)
            p_cnt = ratio_to_count(preds, office_arr[val_idx])
            fold_costs.append(asymmetric_cost(y_cnt, p_cnt))

        oof_preds[:, i] = oof_col
        mean_cost = float(np.mean(fold_costs))
        cv_costs.append(mean_cost)

        if (i + 1) % 5 == 0 or i == len(configs) - 1:
            print(f"    [{i+1:3d}/{len(configs)}] {name:25s} CV cost = {mean_cost:.5f}")

    inv_costs = np.array([1.0 / max(c, 1e-9) for c in cv_costs])
    weights = inv_costs / inv_costs.sum()

    oof_ensemble = oof_preds @ weights
    oof_mask = oof_ensemble != 0
    oof_metrics = evaluate(y_ratio[oof_mask], oof_ensemble[oof_mask], office_arr[oof_mask])

    print(f"\n  OOF Ensemble - Asym. Cost: {oof_metrics['Asym. Cost']:.5f}  "
          f"MAE: {oof_metrics['MAE (repas)']:.1f} repas")

    print(f"\n  Retraining {len(configs)} models on full training set...")
    final_models = {}
    for i, (name, model_cls, params) in enumerate(configs):
        m = model_cls(**params)
        m.fit(X_train, y_ratio)
        final_models[name] = m

    ensemble_ratio_test = np.zeros(len(X_test))
    for i, (name, _) in enumerate(final_models.items()):
        ensemble_ratio_test += weights[i] * final_models[name].predict(X_test)

    ratio_lo = float(y_ratio.quantile(0.01))
    ratio_hi = float(y_ratio.quantile(0.99))
    ensemble_ratio_test = np.clip(
        ensemble_ratio_test,
        max(0.20, ratio_lo - 0.03),
        min(0.95, ratio_hi + 0.03),
    )
    pred_counts = ratio_to_count(ensemble_ratio_test, office_test)

    top_idx = np.argsort(cv_costs)[:5]
    print("\n  Top 5 models by CV cost:")
    for idx in top_idx:
        name = configs[idx][0]
        print(f"    {name:30s}  cost={cv_costs[idx]:.5f}  weight={weights[idx]:.4f}")

    return {
        "models": final_models,
        "weights": {configs[i][0]: float(weights[i]) for i in range(len(configs))},
        "model_names": list(final_models.keys()),
        "cv_costs": {configs[i][0]: cv_costs[i] for i in range(len(configs))},
        "oof_metrics": oof_metrics,
        "predictions": {"ratio": ensemble_ratio_test, "count": pred_counts},
        "office_test": office_test,
        "X_train": X_train,
        "y_ratio": y_ratio,
    }


# ---------------------------------------------------------------------------
# 5. Serialization
# ---------------------------------------------------------------------------

def save_model(
    models: Dict[str, object],
    weights: Dict[str, float],
    feature_cols: List[str],
    metrics: dict,
    save_dir: Path,
) -> None:
    save_dir.mkdir(parents=True, exist_ok=True)
    for name, model in models.items():
        joblib.dump(model, save_dir / f"{name}.joblib")
    meta = {
        "model_names": list(models.keys()),
        "weights": weights,
        "feature_cols": feature_cols,
        "metrics": metrics,
    }
    with open(save_dir / "ensemble_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)


def load_model(load_dir: Path) -> Tuple[Dict[str, object], Dict[str, float], List[str], dict]:
    with open(load_dir / "ensemble_meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    models = {}
    for name in meta["model_names"]:
        path = load_dir / f"{name}.joblib"
        if path.exists():
            models[name] = joblib.load(path)
    return models, meta["weights"], meta["feature_cols"], meta["metrics"]


# ---------------------------------------------------------------------------
# 6. Prediction Interface
# ---------------------------------------------------------------------------

def predict_ratio(
    features: pd.DataFrame,
    models: Dict[str, object],
    weights: Dict[str, float],
) -> np.ndarray:
    ensemble = np.zeros(len(features))
    for name, model in models.items():
        w = weights.get(name, 0.0)
        if w > 0:
            ensemble += w * model.predict(features)
    return ensemble


def predict_count(
    features: pd.DataFrame,
    models: Dict[str, object],
    weights: Dict[str, float],
    office_present: np.ndarray,
) -> np.ndarray:
    ratio = predict_ratio(features, models, weights)
    return ratio_to_count(ratio, office_present)
