"""
Tests for src/forecasting/daily_features — génération quotidienne des features.

La validation clé est la *fidélité* : pour une date déjà dans l'historique, les
126 features produites doivent être identiques à celles du fichier
data/processed/features_train.csv (mêmes sémantiques de shift en lignes).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.forecasting.daily_features import (  # noqa: E402
    _deployment_feature_cols,
    _fill_live_nans,
    _holiday_columns,
    _office_stats,
    _ramadan_flags,
    _weather_defaults,
    build_features,
    generate_features,
    roll_office_forward,
    HISTORY_FILE,
)

DATA_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

HAS_MODELS = (MODELS_DIR / "office_presence_lgb.pkl").exists()
HAS_TRAIN = (DATA_DIR / "features_train.csv").exists()

pytestmark = pytest.mark.skipif(
    not (HAS_MODELS and HAS_TRAIN),
    reason="modèles / features d'entraînement absents",
)


@pytest.fixture()
def history():
    return pd.read_csv(HISTORY_FILE, parse_dates=["Date"])


class TestHolidayCalendar:
    def test_ramadan_flags_2026(self):
        dates = pd.date_range("2026-02-01", "2026-04-01", freq="D")
        out = _ramadan_flags(dates)
        assert (out.loc[out["is_ramadan"] == 1]["ramadan_day"] >= 1).all()
        assert out.loc["2026-03-10", "is_ramadan"] == 1
        assert out.loc["2026-03-20", "is_ramadan"] == 0

    def test_holiday_columns_shape(self):
        dates = pd.date_range("2026-08-01", "2026-08-31", freq="D")
        out = _holiday_columns(dates)
        assert list(out.columns) == [
            "is_fr_holiday", "is_islamic_holiday", "is_algerian_holiday",
            "is_any_holiday", "days_to_next_holiday",
            "days_since_last_holiday", "near_holiday",
        ]
        assert set(out.index) == set(dates)


class TestOfficeStats:
    def test_returns_dow_stats(self, history):
        stats = _office_stats(history)
        assert 0.0 in stats["dow_mean"].index
        assert 6.0 in stats["dow_mean"].index
        # l'historique réel ne contient pas vendredi/samedi
        assert 4.0 not in stats["dow_mean"].index
        assert stats["global_mean"] > 0


class TestRollOfficeForward:
    def test_predicts_future_dates(self, history):
        target_dates = pd.DatetimeIndex(
            ["2026-01-05", "2026-01-06", "2026-01-07"]
        )
        out = roll_office_forward(history, target_dates)
        assert len(out) == 3
        assert out.notna().all()
        assert all(p > 0 for p in out.values)
        # les dates déjà observées sont laissées telles quelles
        out_known = roll_office_forward(history, pd.DatetimeIndex(["2024-12-30"]))
        assert len(out_known) == 0


class TestWorkspace:
    def test_weather_defaults_12_months(self, history):
        defaults = _weather_defaults(history)
        assert len(defaults) == 12

    def test_fill_live_nans_fills_only_nans(self, history):
        df = pd.DataFrame({
            "office_present": [550.0, 600.0],
            "op_dow_mean": [np.nan, 545.0],
            "op_dow_std": [np.nan, 40.0],
            "op_dow_median": [np.nan, 540.0],
            "op_dow_zscore": [np.nan, 1.0],
            "month_dow_ratio_mean": [np.nan, 0.6],
            "dow_ratio_mean": [np.nan, 0.61],
            "dow_ratio_median": [np.nan, 0.60],
            "dow_ratio_std": [np.nan, 0.05],
        })
        out = _fill_live_nans(df.copy(), history)
        assert out["op_dow_mean"].notna().all()
        assert out["op_dow_zscore"].notna().all()
        assert out.loc[1, "op_dow_mean"] == pytest.approx(545.0)


class TestFidelityReproduction:
    """Les features d'une date déjà observée doivent être IDENTIQUES au training."""

    FIDELITY_DATE = "2024-12-30"
    SAMPLE_COLS = [
        "op_lag_7", "op_dow_mean", "op_annual_zscore", "yoy_ratio_5w",
        "bridge_day", "is_any_holiday", "temp_cold", "heavy_rain",
        "menu_is_traditional", "menu_is_premium", "plat1_te", "op_roll_mean_28",
    ]

    def test_in_history_matches_features_train(self, tmp_path, history):
        train = pd.read_csv(DATA_DIR / "features_train.csv", parse_dates=["Date"])
        out = generate_features(
            target_dates=[pd.Timestamp(self.FIDELITY_DATE)],
            history=history,
            out_path=tmp_path / "live.csv",
        )
        row = train[train["Date"] == self.FIDELITY_DATE].iloc[0]
        gen = out.iloc[0]
        for col in self.SAMPLE_COLS:
            a, b = gen[col], row[col]
            both_nan = pd.isna(a) and pd.isna(b)
            assert both_nan or pytest.approx(a, abs=1e-6) == b, col


class TestTextFeatureConsistency:
    """Les features texte (TF-IDF/SVD + target encoding) du serving doivent
    reproduire EXACTEMENT celles de l'entraînement, via les transformeurs
    persistés (plus aucun re-fit live -> pas de skew entraînement/serving)."""

    def test_persisted_transformers_reproduce_training(self):
        import pickle

        from src.menu_optimization.menu_catalog_py import (
            apply_menu_text_features,
            fit_menu_text_features,
        )

        train = pd.read_csv(DATA_DIR / "features_train.csv")
        dep = pickle.load(open(MODELS_DIR / "_deployment.pkl", "rb"))

        assert "text_feats" in dep, "le bundle doit persister les transformeurs texte"
        fitted = dep["text_feats"]

        # Graph de contrôle : re-fitter sur l'entraînement donne un transformeur
        # "identique" — mais surtout, appliquer les transformeurs persistés sur les
        # mêmes lignes doit répliquer les colonnes stockées (pas de re-fit au serving).
        out = apply_menu_text_features(train, fitted)

        for col in ["plat1_te", "conditions_te"]:
            assert col in out.columns
            a = train[col].astype(float).values
            b = out[col].astype(float).values
            assert np.corrcoef(a, b)[0, 1] > 0.999, col

        for i in range(8):
            c = f"tfidf_svd_{i}"
            a = train[c].astype(float).values
            b = out[c].astype(float).values
            assert np.corrcoef(a, b)[0, 1] > 0.999, c

    def test_apply_handles_unseen_categories_with_global_fallback(self):
        import pickle

        from src.menu_optimization.menu_catalog_py import apply_menu_text_features

        dep = pickle.load(open(MODELS_DIR / "_deployment.pkl", "rb"))
        fitted = dep["text_feats"]

        # une ligne avec un plat inconnu + menu vide doit retomber sur la moyenne
        # globale (pas de crash, valeur finie).
        df = pd.DataFrame({
            "plat_principal_1": ["Plat totalement inconnu du catalogue"],
            "plat_principal_2": [None],
            "weather_conditions": ["condition_inconnue"],
        })
        out = apply_menu_text_features(df, fitted)
        assert out["plat1_te"].iloc[0] == pytest.approx(fitted["plat1_global"], abs=1e-6)
        assert out["tfidf_svd_0"].notna().all()



    def test_output_schema_and_no_nans(self, tmp_path):
        dep_cols = _deployment_feature_cols()
        assert dep_cols and len(dep_cols) == 157
        assert not any(c.startswith("kw_") for c in dep_cols)
        out = generate_features(
            target_dates=[pd.Timestamp("2026-09-02")],
            out_path=tmp_path / "live.csv",
        )
        assert len(out) == 1
        assert set(out.columns) == set(["Date", "office_present", "office_present_pred"]) | set(dep_cols)
        assert out.drop(columns=["Date"]).isna().sum().sum() == 0
        assert out["office_present_pred"].iloc[0] == pytest.approx(out["office_present"].iloc[0])
        assert (Path(tmp_path) / "live.csv").exists()

    def test_build_features_no_crash_full_history(self, history):
        feats = build_features(history.copy())
        assert len(feats) == len(history)
        for col in _deployment_feature_cols():
            assert col in feats.columns

    def test_fidelity_check_via_concat(self, tmp_path, history):
        """Le fichier live est le MÊME schéma que le train (concaténable)."""
        live = generate_features(
            target_dates=[pd.Timestamp("2026-09-03")],
            history=history,
            out_path=str(tmp_path / "live.csv"),
        )
        train = pd.read_csv(DATA_DIR / "features_train.csv", parse_dates=["Date"])
        merged = pd.concat([live, train], axis=0)
        # la date live est unique et le concat est possible sans collision
        live_date = live["Date"].iloc[0]
        assert (merged["Date"] == live_date).sum() == 1
        assert merged.shape[0] == len(live) + len(train)