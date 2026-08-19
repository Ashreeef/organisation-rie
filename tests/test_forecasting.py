"""
Tests for src.forecasting.model — multi-alpha LightGBM + XGBoost ensemble.
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.forecasting.model import (
    asymmetric_cost,
    ratio_to_count,
    evaluate,
    prepare_matrices,
    train_ensemble,
    save_model,
    load_model,
    predict_ratio,
    predict_count,
    _build_ensemble_configs,
    LGBM_ALPHAS,
    LGBM_SEEDS,
    XGB_ALPHAS,
    XGB_SEEDS,
)


# ── asymmetric_cost ──────────────────────────────────────────────

class TestAsymmetricCost:
    def test_underprediction_penalized_2x(self):
        cost = asymmetric_cost([10], [8])
        assert cost == pytest.approx(0.4)

    def test_exact_prediction_zero_cost(self):
        assert asymmetric_cost([10, 20, 30], [10, 20, 30]) == 0.0

    def test_overprediction_symmetric(self):
        cost_over = asymmetric_cost([10], [12])
        assert cost_over == pytest.approx(0.2)

    def test_batch_normalization(self):
        cost = asymmetric_cost([10, 10], [12, 8])
        assert cost == pytest.approx(0.3)

    def test_zero_true_values(self):
        import math
        cost = asymmetric_cost([0, 0], [1, 2])
        assert math.isinf(cost)

    def test_all_overestimation(self):
        cost = asymmetric_cost([10, 10], [15, 15])
        assert cost == pytest.approx(0.5)


# ── ratio_to_count ───────────────────────────────────────────────

class TestRatioToCount:
    def test_basic_conversion(self):
        assert ratio_to_count(np.array([0.65]), np.array([1000]))[0] == 650

    def test_clips_negative_to_zero(self):
        result = ratio_to_count(np.array([-0.5]), np.array([1000]))
        assert result[0] == 0

    def test_rounds_to_nearest_int(self):
        result = ratio_to_count(np.array([0.653]), np.array([1000]))
        assert result[0] == 653

    def test_multiple_predictions(self):
        ratios  = np.array([0.5, 0.7, 0.9])
        offices = np.array([100, 200, 300])
        result  = ratio_to_count(ratios, offices)
        np.testing.assert_array_equal(result, [50, 140, 270])


# ── evaluate ─────────────────────────────────────────────────────

class TestEvaluate:
    def test_perfect_prediction(self):
        df = pd.DataFrame({"employees_count": [100, 200, 300]})
        office = np.array([100, 200, 300])
        y_ratio = df["employees_count"] / office
        metrics = evaluate(y_ratio, y_ratio.values, office)
        assert metrics["MAE (repas)"] == 0
        assert metrics["Asym. Cost"] == 0.0

    def test_returns_expected_keys(self):
        df = pd.DataFrame({"employees_count": [100, 200]})
        metrics = evaluate(df["employees_count"], np.array([0.9, 0.95]), np.array([100, 200]))
        assert "MAE (repas)" in metrics
        assert "RMSE (repas)" in metrics
        assert "Asym. Cost" in metrics
        assert "MAE (ratio)" in metrics


# ── prepare_matrices ─────────────────────────────────────────────

class TestPrepareMatrices:
    def _make_df(self, n=50):
        np.random.seed(42)
        dates = pd.date_range("2023-01-01", periods=n, freq="D")
        df = pd.DataFrame({
            "Date": dates,
            "office_present": 400 + np.random.randint(-10, 10, n),
            "employees_count": np.random.randint(250, 380, n),
            "temperature_2m_mean": np.random.uniform(5, 40, n),
            "rain_sum": np.random.uniform(0, 20, n),
            "lag_1": np.random.uniform(0.5, 1.0, n),
            "lag_7": np.random.uniform(0.5, 1.0, n),
            "conditions": np.random.choice(["Clear", "Rain", "Clouds"], n),
            "type precipitation": np.random.choice(["none", "rain"], n),
        })
        df.index = dates
        return df

    def test_no_nans_after_preparation(self):
        train_df = self._make_df(50)
        test_df  = self._make_df(20)
        feature_cols = ["temperature_2m_mean", "rain_sum", "lag_1", "lag_7", "conditions", "type precipitation"]
        X_tr, y, X_te, office, cats = prepare_matrices(train_df, test_df, feature_cols)
        assert X_tr.isna().sum().sum() == 0
        assert X_te.isna().sum().sum() == 0

    def test_shapes_consistent(self):
        train_df = self._make_df(50)
        test_df  = self._make_df(20)
        feature_cols = ["temperature_2m_mean", "rain_sum", "lag_1", "lag_7", "conditions", "type precipitation"]
        X_tr, y, X_te, office, cats = prepare_matrices(train_df, test_df, feature_cols)
        assert len(X_tr) == len(y) == 50
        assert len(X_te) == 20
        assert len(office) == 20


# ── ensemble config ──────────────────────────────────────────────

class TestEnsembleConfigs:
    def test_no_catboost(self):
        configs = _build_ensemble_configs()
        for name, _, _ in configs:
            assert "CAT" not in name.upper()

    def test_lgbm_alphas_centered(self):
        assert 0.73 in LGBM_ALPHAS
        assert all(0.60 <= a <= 0.85 for a in LGBM_ALPHAS)

    def test_expected_model_count(self):
        configs = _build_ensemble_configs()
        expected = len(LGBM_ALPHAS) * len(LGBM_SEEDS) + len(XGB_ALPHAS) * len(XGB_SEEDS)
        assert len(configs) == expected


# ── predict interface ────────────────────────────────────────────

class TestPredictInterface:
    def test_predict_ratio_returns_float_array(self):
        X = pd.DataFrame({"temperature_2m_mean": [10.0], "rain_sum": [0.0]})
        dummy = type("D", (), {"predict": lambda self, x: np.array([0.72])})()
        models = {"m1": dummy}
        weights = {"m1": 1.0}
        result = predict_ratio(X, models, weights)
        assert isinstance(result, np.ndarray)
        assert result[0] == pytest.approx(0.72)

    def test_predict_count_returns_int_array(self):
        X = pd.DataFrame({"temperature_2m_mean": [10.0]})
        dummy = type("D", (), {"predict": lambda self, x: np.array([0.7])})()
        models = {"m1": dummy}
        weights = {"m1": 1.0}
        result = predict_count(X, models, weights, np.array([400]))
        assert result.dtype in [np.int32, np.int64]
        assert result[0] == 280
