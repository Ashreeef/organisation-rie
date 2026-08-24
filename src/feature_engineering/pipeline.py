"""
Feature Engineering Pipeline — Ported from notebooks/02_feature_engineering.ipynb

Transforms raw DataFrames (train/test) into a fully feature-engineered matrix
ready for modeling. All transformations are fit on train only and replayed
identically on test — zero information leakage.
"""
import json
import numpy as np
import pandas as pd
from pathlib import Path
from typing import Tuple, List, Optional

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from src.menu_optimization.menu_cleaning import extract_menu_features

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RAMADAN_OUTLIER = pd.Timestamp("2023-03-23")

DAY_MAP_FR = {
    "Sunday": "Dimanche", "Monday": "Lundi", "Tuesday": "Mardi",
    "Wednesday": "Mercredi", "Thursday": "Jeudi",
    "Friday": "Vendredi", "Saturday": "Samedi",
}

RAMADAN_WINDOWS = [
    (pd.Timestamp("2022-04-02"), pd.Timestamp("2022-05-01")),
    (pd.Timestamp("2023-03-23"), pd.Timestamp("2023-04-20")),
    (pd.Timestamp("2024-03-11"), pd.Timestamp("2024-04-09")),
]

FINAL_EXCLUDE = {
    "entrées", "plat pricipal_1", "plat principal_2",
    "day_name_fr", "precipitation (mm)", "office_departments",
    "temperature ressentie",
}

TARGET_COLS = ["employees_count", "ratio"]
REF_COLS = ["Date"]


# ---------------------------------------------------------------------------
# 1. Cleaning & Deduplication
# ---------------------------------------------------------------------------

def clean_and_deduplicate(df: pd.DataFrame, has_target: bool) -> pd.DataFrame:
    """Remove Ramadan outlier (train only), extract menu features, dedup by Date."""
    out = df.copy()

    if has_target and RAMADAN_OUTLIER in out["Date"].values:
        out = out[out["Date"] != RAMADAN_OUTLIER].copy()

    menu_feats = extract_menu_features(out)
    out = pd.concat([out, menu_feats], axis=1)

    menu_cols = [c for c in out.columns
                 if c.startswith("menu_") or c.startswith("entree_")
                 or c in {"n_entree_choices", "has_2nd_plat", "is_menu_chef"}]
    raw_text_cols = ["entrées", "plat pricipal_1", "plat principal_2",
                     "conditions", "type precipitation"]

    agg = {}
    for col in out.columns:
        if col == "Date":
            continue
        if col in menu_cols:
            agg[col] = "max"
        elif col == "employees_count" and has_target:
            agg[col] = "mean"
        elif col in raw_text_cols:
            agg[col] = "first"
        else:
            agg[col] = "first"

    daily = (out.groupby("Date", as_index=False)
               .agg(agg)
               .sort_values("Date")
               .reset_index(drop=True))
    return daily


# ---------------------------------------------------------------------------
# 2. Calendar Features
# ---------------------------------------------------------------------------

def add_calendar_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    dt = out["Date"].dt

    out["dayofweek"]   = (dt.dayofweek + 1) % 7
    out["day_name_fr"] = dt.day_name().map(DAY_MAP_FR)
    out["month"]       = dt.month
    out["day"]         = dt.day
    out["weekofyear"]  = dt.isocalendar().week.astype(int)
    out["year"]        = dt.year
    out["quarter"]     = dt.quarter

    out["month_sin"] = np.sin(2 * np.pi * out["month"]      / 12)
    out["month_cos"] = np.cos(2 * np.pi * out["month"]      / 12)
    out["week_sin"]  = np.sin(2 * np.pi * out["weekofyear"] / 52)
    out["week_cos"]  = np.cos(2 * np.pi * out["weekofyear"] / 52)
    out["dow_sin"]   = np.sin(2 * np.pi * out["dayofweek"]  / 5)
    out["dow_cos"]   = np.cos(2 * np.pi * out["dayofweek"]  / 5)

    return out


# ---------------------------------------------------------------------------
# 3. Holiday & Ramadan Features
# ---------------------------------------------------------------------------

def _in_windows(dates: pd.Series, windows) -> pd.Series:
    mask = pd.Series(False, index=dates.index)
    for start, end in windows:
        mask |= dates.between(start, end)
    return mask


def _ramadan_day(date: pd.Timestamp) -> int:
    for start, end in RAMADAN_WINDOWS:
        if start <= date <= end:
            return (date - start).days + 1
    return 0


def add_holiday_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    years = out["Date"].dt.year.unique().tolist()

    try:
        import holidays as hol
        dz_holidays = {}
        for y in years:
            dz_holidays.update(hol.Algeria(years=y))
        holiday_dates = {str(k) for k in dz_holidays.keys()}
        out["is_holiday"] = out["Date"].dt.date.astype(str).map(
            lambda d: int(d in holiday_dates)
        ).fillna(0).astype(int)
        out["is_pre_holiday"] = out["Date"].apply(
            lambda d: int((d + pd.Timedelta(days=1)).date() in dz_holidays)
        ).astype(int)
    except ImportError:
        out["is_holiday"]     = 0
        out["is_pre_holiday"] = 0

    out["is_ramadan"] = _in_windows(out["Date"], RAMADAN_WINDOWS).astype(int)
    out["ramadan_day"] = out["Date"].apply(_ramadan_day)

    pre_windows  = [(s - pd.Timedelta(days=7), s - pd.Timedelta(days=1)) for s, _ in RAMADAN_WINDOWS]
    post_windows = [(e + pd.Timedelta(days=1), e + pd.Timedelta(days=7)) for _, e in RAMADAN_WINDOWS]
    out["is_pre_ramadan"]  = _in_windows(out["Date"], pre_windows).astype(int)
    out["is_post_ramadan"] = _in_windows(out["Date"], post_windows).astype(int)

    return out


# ---------------------------------------------------------------------------
# 4. Weather Features
# ---------------------------------------------------------------------------

def add_weather_features(
    df: pd.DataFrame,
    month_temp_means: Optional[pd.Series] = None,
    temp_mean: Optional[float] = None,
    temp_std: Optional[float] = None,
) -> Tuple[pd.DataFrame, pd.Series, float, float]:
    out = df.copy()
    precip_col = "precipitation (mm)"
    temp_col   = "temperature"

    out["has_rain"] = (out[precip_col].fillna(0) > 0.5).astype(int)

    if temp_mean is None:
        temp_mean = float(out[temp_col].mean())
        temp_std  = float(out[temp_col].std())
    out["temp_z"] = (out[temp_col] - temp_mean) / (temp_std + 1e-9)

    if month_temp_means is None:
        month_temp_means = out.groupby("month")[temp_col].mean()
    out["temp_month_delta"] = out[temp_col] - out["month"].map(month_temp_means)

    return out, month_temp_means, temp_mean, temp_std


# ---------------------------------------------------------------------------
# 5. Headcount Features
# ---------------------------------------------------------------------------

def add_headcount_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["office_per_dept"] = (
        out["office_present"] / out["office_departments"].replace(0, np.nan)
    ).replace([np.inf, -np.inf], np.nan)
    return out


# ---------------------------------------------------------------------------
# 6. Lag & Rolling Features
# ---------------------------------------------------------------------------

LAG_COLS = [
    "lag_7", "lag_14", "lag_28",
    "roll_mean_7", "roll_mean_14", "roll_std_7", "roll_max_7",
    "lag_ratio_7", "roll_ratio_mean_7",
]


def add_lag_features(
    train_df: pd.DataFrame, test_df: pd.DataFrame
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    train = train_df.copy().sort_values("Date").reset_index(drop=True)

    has_test = test_df is not None and len(test_df) > 0 and "Date" in test_df.columns
    test = test_df.copy().sort_values("Date").reset_index(drop=True) if has_test else test_df

    if has_test:
        full_series = pd.concat([
            train[["Date", "employees_count", "ratio"]],
            test[["Date"]].assign(employees_count=np.nan, ratio=np.nan)
        ], ignore_index=True).sort_values("Date").reset_index(drop=True)
    else:
        full_series = train[["Date", "employees_count", "ratio"]].copy()

    full_series["employees_count"] = full_series["employees_count"].ffill()
    full_series["ratio"]           = full_series["ratio"].ffill()

    for lag in [7, 14, 28]:
        full_series[f"lag_{lag}"] = full_series["employees_count"].shift(lag)

    full_series["roll_mean_7"]       = full_series["employees_count"].shift(1).rolling(7, min_periods=1).mean()
    full_series["roll_mean_14"]      = full_series["employees_count"].shift(1).rolling(14, min_periods=1).mean()
    full_series["roll_std_7"]        = full_series["employees_count"].shift(1).rolling(7, min_periods=2).std()
    full_series["roll_max_7"]        = full_series["employees_count"].shift(1).rolling(7, min_periods=1).max()
    full_series["lag_ratio_7"]       = full_series["ratio"].shift(7)
    full_series["roll_ratio_mean_7"] = full_series["ratio"].shift(1).rolling(7, min_periods=1).mean()

    train = train.merge(full_series[["Date"] + LAG_COLS], on="Date", how="left")
    if has_test:
        test  = test.merge(full_series[["Date"] + LAG_COLS], on="Date", how="left")

    return train, test


# ---------------------------------------------------------------------------
# 7. Full Pipeline
# ---------------------------------------------------------------------------

def build_feature_columns(train_daily: pd.DataFrame) -> List[str]:
    """Return the ordered list of feature columns (excludes targets, refs, raw text)."""
    return [c for c in train_daily.columns
            if c not in FINAL_EXCLUDE
            and c not in TARGET_COLS
            and c not in REF_COLS]


def run_pipeline(
    train_raw: pd.DataFrame, test_raw: pd.DataFrame = None
) -> Tuple[pd.DataFrame, pd.DataFrame, List[str]]:
    """
    Execute the full FE pipeline:
      1. Clean & dedup (with menu feature extraction)
      2. Calendar features
      3. Holiday / Ramadan features
      4. Weather features (fit on train)
      5. Headcount features
      6. Compute ratio target
      7. Lag & rolling features
      8. Build final feature list

    Returns (train_df, test_df, feature_cols).
    If test_raw is None, test_df is an empty DataFrame.
    """
    # 1. Clean & dedup
    train_daily = clean_and_deduplicate(train_raw, has_target=True)

    if test_raw is not None:
        test_daily = clean_and_deduplicate(test_raw, has_target=False)

        # 2. Calendar
        train_daily = add_calendar_features(train_daily)
        test_daily  = add_calendar_features(test_daily)

        # 3. Holidays
        train_daily = add_holiday_features(train_daily)
        test_daily  = add_holiday_features(test_daily)

        # 4. Weather (fit on train)
        train_daily, month_temp_means, temp_mean, temp_std = add_weather_features(train_daily)
        test_daily, *_ = add_weather_features(
            test_daily,
            month_temp_means=month_temp_means,
            temp_mean=temp_mean,
            temp_std=temp_std,
        )

        # 5. Headcount
        train_daily = add_headcount_features(train_daily)
        test_daily  = add_headcount_features(test_daily)

        # 6. Ratio target
        train_daily["ratio"] = (
            train_daily["employees_count"] / train_daily["office_present"]
        ).astype(float)

        # 7. Lags
        train_daily, test_daily = add_lag_features(train_daily, test_daily)
    else:
        # Process train only
        train_daily = add_calendar_features(train_daily)
        train_daily = add_holiday_features(train_daily)
        train_daily, *_ = add_weather_features(train_daily)
        train_daily = add_headcount_features(train_daily)
        train_daily["ratio"] = (
            train_daily["employees_count"] / train_daily["office_present"]
        ).astype(float)
        train_daily, _ = add_lag_features(train_daily, pd.DataFrame())
        test_daily = pd.DataFrame()

    # 8. Feature columns
    feature_cols = build_feature_columns(train_daily)

    return train_daily, test_daily, feature_cols


def save_processed(
    train_daily: pd.DataFrame,
    test_daily: pd.DataFrame,
    feature_cols: List[str],
    out_dir: Path,
) -> None:
    """Save processed data to parquet + feature_columns.json."""
    out_dir.mkdir(parents=True, exist_ok=True)

    train_out = train_daily[REF_COLS + feature_cols + TARGET_COLS].copy()
    train_out.to_parquet(out_dir / "train_features.parquet", index=False)

    test_feat_cols = [c for c in feature_cols if c in test_daily.columns]
    test_out = test_daily[REF_COLS + test_feat_cols].copy()
    test_out.to_parquet(out_dir / "test_features.parquet", index=False)

    with open(out_dir / "feature_columns.json", "w", encoding="utf-8") as f:
        json.dump(feature_cols, f, indent=2, ensure_ascii=False)


def load_processed(data_dir: Path) -> Tuple[pd.DataFrame, pd.DataFrame, List[str]]:
    """Load processed features from data/processed/."""
    train = pd.read_parquet(data_dir / "train_features.parquet")
    test  = pd.read_parquet(data_dir / "test_features.parquet")
    with open(data_dir / "feature_columns.json", encoding="utf-8") as f:
        feature_cols = json.load(f)
    return train, test, feature_cols
