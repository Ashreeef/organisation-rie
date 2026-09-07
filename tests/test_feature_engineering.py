"""Tests for src/feature_engineering/pipeline.py"""
import numpy as np
import pandas as pd
import pytest
from src.feature_engineering.pipeline import (
    add_calendar_features,
    add_holiday_features,
    add_weather_features,
    add_headcount_features,
    add_lag_features,
    build_feature_columns,
    FINAL_EXCLUDE,
    TARGET_COLS,
    REF_COLS,
)


def _make_raw(n=50, start="2023-01-01"):
    """Generate a minimal raw DataFrame mimicking the RIE dataset."""
    dates = pd.bdate_range(start, periods=n, freq="B")
    np.random.seed(42)
    return pd.DataFrame({
        "Date": dates,
        "employees_count": np.random.randint(200, 400, n),
        "office_present": np.random.randint(400, 600, n),
        "office_departments": np.random.randint(40, 60, n),
        "entrées": np.random.choice(["Salade, Soupe", "Pizza", ""], n),
        "plat pricipal_1": np.random.choice(["Poulet riz", "Rechta", "Couscous"], n),
        "plat principal_2": np.random.choice([np.nan, "Salade", ""], n),
        "temperature": np.random.uniform(10, 35, n),
        "temperature ressentie": np.random.uniform(10, 35, n),
        "precipitation (mm)": np.random.uniform(0, 10, n),
        "type precipitation": np.random.choice([np.nan, "pluie", "neige"], n),
        "vitesse soulevement du vent (km/h)": np.random.uniform(0, 20, n),
        "vitesse du vent(km/h)": np.random.uniform(0, 30, n),
        "couverture nuageuse (%)": np.random.uniform(0, 100, n),
        "conditions": np.random.choice(["clear", "rain", np.nan], n),
        "year": dates.year.values,
        "month": dates.month.values,
        "day": dates.day.values,
        "dayofweek": dates.dayofweek.values,
        "weekofyear": dates.isocalendar().week.values.astype(int),
        "is_weekend": np.zeros(n, dtype=int),
    })


class TestAddCalendarFeatures:
    def test_adds_expected_columns(self):
        df = _make_raw(20)
        result = add_calendar_features(df)
        for col in ["month_sin", "month_cos", "week_sin", "week_cos", "dow_sin", "dow_cos",
                     "dayofweek", "month", "day", "weekofyear", "year", "quarter"]:
            assert col in result.columns

    def test_dayofweek_algerian(self):
        df = _make_raw(20)
        result = add_calendar_features(df)
        assert result["dayofweek"].between(0, 6).all()

    def test_preserves_row_count(self):
        df = _make_raw(20)
        result = add_calendar_features(df)
        assert len(result) == 20


class TestAddWeatherFeatures:
    def test_adds_rain_and_zscore(self):
        df = _make_raw(30)
        result, _, _, _ = add_weather_features(df)
        assert "has_rain" in result.columns
        assert "temp_z" in result.columns
        assert "temp_month_delta" in result.columns

    def test_fit_on_train_apply_on_test(self):
        train = _make_raw(30)
        test = _make_raw(10, start="2023-06-01")
        train_fitted, means, tmean, tstd = add_weather_features(train)
        test_fitted, *_ = add_weather_features(test, means, tmean, tstd)
        assert test_fitted["temp_z"].std() > 0

    def test_preserves_index(self):
        df = _make_raw(20).set_index("Date")
        result, _, _, _ = add_weather_features(df)
        assert len(result) == 20


class TestAddHeadcountFeatures:
    def test_ratio_computed(self):
        df = _make_raw(20)
        result = add_headcount_features(df)
        assert "office_per_dept" in result.columns
        assert result["office_per_dept"].notna().all()


class TestAddLagFeatures:
    def test_adds_lag_columns(self):
        train = _make_raw(50)
        test = _make_raw(10, start="2023-10-01")
        train["ratio"] = train["employees_count"] / train["office_present"]
        test["ratio"] = np.nan
        train_out, test_out = add_lag_features(train, test)
        for col in ["lag_7", "lag_14", "lag_28", "roll_mean_7", "roll_ratio_mean_7"]:
            assert col in train_out.columns
            assert col in test_out.columns

    def test_no_nans_in_test_lags(self):
        train = _make_raw(50)
        test = _make_raw(10, start="2023-10-01")
        train["ratio"] = train["employees_count"] / train["office_present"]
        test["ratio"] = np.nan
        _, test_out = add_lag_features(train, test)
        lag_cols = ["lag_7", "lag_14", "lag_28",
                     "roll_mean_7", "roll_mean_14", "roll_std_7", "roll_max_7",
                     "lag_ratio_7", "roll_ratio_mean_7"]
        assert test_out[lag_cols].isna().sum().sum() == 0


class TestBuildFeatureColumns:
    def test_excludes_targets_and_refs(self):
        train = _make_raw(10)
        train["ratio"] = 0.5
        cols = build_feature_columns(train)
        for c in TARGET_COLS + REF_COLS + list(FINAL_EXCLUDE):
            assert c not in cols

    def test_nonempty(self):
        train = _make_raw(10)
        train["ratio"] = 0.5
        cols = build_feature_columns(train)
        assert len(cols) > 0
