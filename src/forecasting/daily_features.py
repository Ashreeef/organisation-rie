"""
Production quotidienne des features pour la prévision live.

Reproduit fidèlement le pipeline d'ingénierie de features du notebook
03_feature_engineering.ipynb (126 features) pour des *dates futures* :

  1. le sous-modèle office_presence (notebook 04) est rejoué de façon
     récursive jour cible après jour cible : chaque prédiction est ajoutée à la
     série des valeurs observées et sert de passé pour la suivante (lags /
     rolling / YoY cohérents, calculés en *lignes* comme à l'entraînement) ;
  2. l'ingénierie de features du notebook 03 est appliquée à cette chronologie
     étendue (historique réel épars + lignes des dates cibles) ;
  3. seules les lignes des jours cibles sont écrites dans
     ``data/processed/features_live.csv``, consommé en priorité par
     api/forecast.py au lieu du repli calendaire.
     ``office_present_pred`` vaut la prédiction du sous-modèle office ;
     ``office_present`` contient la même valeur (lignes cibles).

Usage CLI:
    python -m src.forecasting.daily_features --days 14
    python -m src.forecasting.daily_features --date 2026-09-01 --days 1

Notes de production:
  - le sous-modèle office utilise une valeur de repli (moyenne historique par
    jour de semaine) pour ses features contemporaines (op_dow_zscore,
    op_x_*, op_diff_7d...) puisqu'on ne connaît pas encore office_present à J ;
  - la météo et le menu des jours futurs sont inconnus : on utilise des
    climatologies mensuelles et un menu vide (flags 0, TF-IDF "empty") ; un futur
    flux météo/menu peut être branché dans ``_build_workspace`` ;
  - les jours fériés (français, algériens fixes et islamiques) et les fenêtres
    de Ramadan viennent de ``src/calendar_utils.py``, alimenté par la
    bibliothèque ``holidays`` (>= 0.99) — aucune liste de dates manuelle ;
    les dates islamiques futures restent des *estimations* astronomiques
    (elles peuvent varier d'un jour selon le croissant lunaire observé).
"""
import argparse
import json
import pickle
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=pd.errors.PerformanceWarning)

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from src.calendar_utils import (  # noqa: E402
    algerian_national_dates,
    french_holiday_dates,
    islamic_holiday_dates,
    ramadan_ranges,
)

DATA_DIR = REPO_ROOT / "data" / "processed"
MODELS_DIR = REPO_ROOT / "models"
HISTORY_FILE = DATA_DIR / "real_clean.csv"
OUT_FILE = DATA_DIR / "features_live.csv"

SEED = 42
MIN_HISTORY_ROWS = 200


# ---------------------------------------------------------------------------
# 1. Calendrier / jours fériés
# ---------------------------------------------------------------------------

def _holiday_columns(dates) -> pd.DataFrame:
    """Flags jours fériés identiques au notebook 03 (étendus aux horizons futurs).

    Les dates viennent de ``src.calendar_utils`` (bibliothèque ``holidays``) :
    premier jour de chaque fête islamique — identique au notebook 03 pour la
    période d'entraînement, corrigé pour les horizons futurs.
    """
    dates = pd.DatetimeIndex(pd.to_datetime(dates))
    years = {int(y) for y in dates.year}
    fr_set = french_holiday_dates(years)
    islamic_set = islamic_holiday_dates(years)
    algerian_set = algerian_national_dates(years)

    out = pd.DataFrame(index=dates)
    out["is_fr_holiday"] = dates.isin(fr_set).astype(int)
    out["is_islamic_holiday"] = dates.isin(islamic_set).astype(int)
    out["is_algerian_holiday"] = dates.isin(algerian_set).astype(int)
    out["is_any_holiday"] = (
        (out["is_fr_holiday"] | out["is_islamic_holiday"] | out["is_algerian_holiday"])
    ).astype(int)

    holiday_dates = dates[out["is_any_holiday"] == 1].values
    dates_arr = dates.values

    dt_next = np.full(len(dates), 14.0)
    dt_prev = np.full(len(dates), 14.0)
    for i, d in enumerate(dates_arr):
        future = holiday_dates[holiday_dates >= d]
        if len(future) > 0:
            dt_next[i] = min((future[0] - d) / np.timedelta64(1, "D"), 14.0)
        past = holiday_dates[holiday_dates <= d]
        if len(past) > 0:
            dt_prev[i] = min((d - past[-1]) / np.timedelta64(1, "D"), 14.0)

    out["days_to_next_holiday"] = dt_next.astype(int)
    out["days_since_last_holiday"] = dt_prev.astype(int)
    out["near_holiday"] = (
        (out["days_to_next_holiday"] <= 2) | (out["days_since_last_holiday"] <= 2)
    ).astype(int)
    return out


def _ramadan_flags(dates) -> pd.DataFrame:
    """is_ramadan / ramadan_day — convention du notebook 03 (fenêtres
    [Aïd el-Fitr − 30 j, Aïd el-Fitr − 1 j] issues de ``src.calendar_utils``)."""
    dates = pd.DatetimeIndex(pd.to_datetime(dates))
    out = pd.DataFrame(index=dates)
    out["is_ramadan"] = 0
    out["ramadan_day"] = 0
    for start, end in ramadan_ranges({int(y) for y in dates.year}):
        mask = (dates >= start) & (dates <= end)
        out.loc[mask, "is_ramadan"] = 1
        out.loc[mask, "ramadan_day"] = (dates[mask] - start).days + 1
    return out


# ---------------------------------------------------------------------------
# 2. Sous-modèle office_presence (rejoué de façon récursive)
# ---------------------------------------------------------------------------

_sub_cache = None


def _load_sub_model():
    global _sub_cache
    if _sub_cache is None:
        path = MODELS_DIR / "office_presence_lgb.pkl"
        if path.exists():
            with open(path, "rb") as f:
                _sub_cache = pickle.load(f)
    return _sub_cache


def _office_stats(history: pd.DataFrame) -> dict:
    """Statistiques de référence issues de l'historique réel (notebook 04, cell 14)."""
    history = history.copy()
    if "month_n" not in history.columns:
        history["month_n"] = pd.to_datetime(history["Date"]).dt.month
    dows = history.set_index("dow")["office_present"]
    months = history.set_index("month_n")["office_present"]
    dm = history.set_index(["dow", "month_n"])["office_present"]
    global_mean = float(history["office_present"].mean())
    global_std = float(history["office_present"].std())

    dow_mean = dows.groupby(level=0).mean()
    dow_std = dows.groupby(level=0).std()
    month_mean = months.groupby(level=0).mean()
    dm_mean = dm.groupby(level=0).mean()

    return {
        "dow_mean": dow_mean,
        "dow_std": dow_std,
        "month_mean": month_mean,
        "dm_mean": dm_mean,
        "global_mean": global_mean,
        "global_std": global_std,
        "p5": float(history["office_present"].quantile(0.05)) * 0.9,
        "p95": float(history["office_present"].quantile(0.95)) * 1.1,
    }


def _base_office_features(
    d: pd.Timestamp, k: int, office_vals: list, hol: pd.Series, stats: dict
) -> dict:
    """Features du sous-modèle indépendantes de la valeur courante du jour."""
    min_date = stats["min_date"]
    feats = {
        "dow": d.dayofweek,
        "day_of_month": d.day,
        "month_n": d.month,
        "day_of_year": d.dayofyear,
        "days_in_month": d.days_in_month,
        "year_n": d.year,
        "trend_days": (d - min_date).days,
        "month_progress": d.day / d.days_in_month,
        "week_of_month": (d.day - 1) // 7 + 1,
        "is_week1_month": 1 if ((d.day - 1) // 7 + 1) == 1 else 0,
        "is_week4_month": 1 if ((d.day - 1) // 7 + 1) >= 4 else 0,
        "quarter": d.quarter,
        "week_of_year": int(d.isocalendar()[1]),
        "is_weekend": 1 if d.dayofweek in (4, 5) else 0,
        "is_sun": 1 if d.dayofweek == 6 else 0,
        "is_mon": 1 if d.dayofweek == 0 else 0,
        "is_tue": 1 if d.dayofweek == 1 else 0,
        "is_wed": 1 if d.dayofweek == 2 else 0,
        "is_thu": 1 if d.dayofweek == 3 else 0,
    }
    doy = float(d.dayofyear)
    for kk in range(1, 4):
        feats[f"sin_year_{kk}"] = np.sin(2 * np.pi * kk * doy / 365.25)
        feats[f"cos_year_{kk}"] = np.cos(2 * np.pi * kk * doy / 365.25)
    dow = float(d.dayofweek)
    feats["sin_week"] = np.sin(2 * np.pi * dow / 5)
    feats["cos_week"] = np.cos(2 * np.pi * dow / 5)

    feats["is_fr_holiday"] = hol["is_fr_holiday"]
    feats["is_islamic_holiday"] = hol["is_islamic_holiday"]
    feats["is_algerian_holiday"] = hol["is_algerian_holiday"]
    feats["is_any_holiday"] = hol["is_any_holiday"]
    feats["days_to_next_holiday"] = hol["days_to_next_holiday"]
    feats["days_since_last_holiday"] = hol["days_since_last_holiday"]
    feats["near_holiday"] = hol["near_holiday"]
    feats["is_ramadan"] = hol["is_ramadan"]
    feats["ramadan_day"] = hol["ramadan_day"]

    feats["is_august"] = 1 if d.month == 8 else 0
    feats["is_july"] = 1 if d.month == 7 else 0
    feats["is_summer"] = 1 if d.month in (6, 7, 8) else 0
    feats["is_yearend"] = 1 if (d.month == 12 and d.day >= 22) else 0
    feats["is_jan_start"] = 1 if (d.month == 1 and d.day <= 10) else 0
    feats["is_payday1"] = 1 if d.day in range(1, 6) else 0
    feats["is_payday2"] = 1 if d.day in range(14, 17) else 0
    feats["is_payday3"] = 1 if d.day >= 26 else 0

    # Lags / rolling depuis la série office reconstruite
    for lag in (7, 14, 21, 28):
        feats[f"op_lag_{lag}"] = office_vals[k - lag] if k - lag >= 0 else np.nan

    base_idx = k - 7
    if base_idx >= 0:
        for w, prefix in ((28, "28"), (56, "56")):
            start = max(0, base_idx - (w - 1))
            window = office_vals[start:base_idx + 1]
            feats[f"op_roll_mean_{prefix}"] = float(np.mean(window))
            feats[f"op_roll_std_{prefix}"] = float(np.std(window)) if len(window) > 1 else np.nan
            feats[f"op_roll_max_{prefix}"] = float(np.max(window))
            feats[f"op_roll_min_{prefix}"] = float(np.min(window))
    else:
        for w, prefix in ((28, "28"), (56, "56")):
            feats[f"op_roll_mean_{prefix}"] = np.nan
            feats[f"op_roll_std_{prefix}"] = np.nan
            feats[f"op_roll_max_{prefix}"] = np.nan
            feats[f"op_roll_min_{prefix}"] = np.nan

    # YoY
    yoy_idx = k - 364
    if 0 <= yoy_idx < len(office_vals):
        feats["op_yoy_52w"] = office_vals[yoy_idx]
    else:
        feats["op_yoy_52w"] = stats["global_mean"]
    start = max(0, k - 374)
    end = k - 353
    if end - start >= 3 and start < len(office_vals):
        feats["op_yoy_smooth"] = float(np.median(office_vals[start:min(end, len(office_vals))]))
    else:
        feats["op_yoy_smooth"] = np.nan

    # Stats conditionnelles (référence = historique réel uniquement)
    dow_mean = stats["dow_mean"].get(d.dayofweek, np.nan)
    dow_std = stats["dow_std"].get(d.dayofweek, np.nan)
    month_mean = stats["month_mean"].get(d.month, np.nan)
    dm_mean = stats["dm_mean"].get((d.dayofweek, d.month), np.nan)
    feats["op_dow_mean"] = dow_mean if pd.notna(dow_mean) else stats["global_mean"]
    feats["op_dow_std"] = dow_std if pd.notna(dow_std) else stats["global_std"]
    feats["op_month_mean"] = month_mean if pd.notna(month_mean) else stats["global_mean"]
    feats["op_dm_mean"] = dm_mean if pd.notna(dm_mean) else feats["op_dow_mean"]

    return feats


def _office_current_features(feats: dict, cur: float) -> dict:
    """Features du sous-modèle dépendantes de la valeur courante office_present."""
    out = dict(feats)
    dow_mean = out["op_dow_mean"]
    dow_std = out["op_dow_std"]
    lag7 = out["op_lag_7"]
    out["op_dow_zscore"] = (cur - dow_mean) / (dow_std + 1)
    out["op_diff_7d"] = cur - lag7 if pd.notna(lag7) else np.nan
    out["op_pct_7d"] = out["op_diff_7d"] / (lag7 + 1) if pd.notna(lag7) else np.nan
    for day, col in (("sun", "is_sun"), ("mon", "is_mon"), ("tue", "is_tue"),
                     ("wed", "is_wed"), ("thu", "is_thu")):
        out[f"op_x_{day}"] = cur * out[col]
    out["op_x_summer"] = cur * out["is_summer"]
    out["op_x_ramadan"] = cur * out["is_ramadan"]
    out["op_x_near_holiday"] = cur * out["near_holiday"]
    yoy52 = out["op_yoy_52w"]
    out["op_yoy_ratio"] = cur / (yoy52 + 1) if pd.notna(yoy52) else np.nan
    return out


def _predict_office(
    d: pd.Timestamp, k: int, office_vals: list, hol_row: dict,
    stats: dict, sub: dict,
) -> float:
    feats = _base_office_features(d, k, office_vals, hol_row, stats)
    feats = _office_current_features(feats, cur=feats["op_dow_mean"])

    x = pd.DataFrame([feats])
    for col in sub["features"]:
        if col not in x.columns:
            x[col] = np.nan
    x = x[[c for c in sub["features"]]].fillna(0.0)

    pred = float(sub["model"].predict(x)[0])
    pred = np.clip(pred, stats["p5"], stats["p95"])
    return float(max(0, pred))


def roll_office_forward(
    history: pd.DataFrame, target_dates
) -> pd.Series:
    """Prédit ``office_present`` pour chaque date cible, en rejouant le notebook 04.

    La série ``office_present`` du notebook est *éparse* (jours observés uniquement)
    et tous les décalages sont calculés en *lignes* (shift), pas en jours calendaires.
    On reproduit exactement la cellule 14 : pour chaque nouvelle observation on calcule
    les lags/rolling/YoY sur la liste des valeurs précédentes, on prédit avec le
    sous-modèle, on ajoute la prédiction à la liste, et on passe à la suivante.
    """
    sub = _load_sub_model()
    if sub is None or sub.get("model") is None or not sub.get("features"):
        raise RuntimeError("office_presence_lgb.pkl introuvable ou incomplet")

    stats = _office_stats(history)
    stats["min_date"] = history["Date"].min()

    target_dates = pd.DatetimeIndex(sorted(pd.to_datetime(list(target_dates))))
    all_dates = pd.DatetimeIndex(sorted(set(history["Date"]) | set(target_dates)))
    hol = _holiday_columns(all_dates)
    ram = _ramadan_flags(all_dates)
    hol_cols = list(hol.columns)
    ram_cols = list(ram.columns)

    def row_for(d):
        return ({c: int(hol.loc[d, c]) for c in hol_cols} |
                {c: int(ram.loc[d, c]) for c in ram_cols})

    office_vals = list(history.sort_values("Date")["office_present"].values)
    known_dates = set(pd.to_datetime(history["Date"]))
    preds = {}
    for d in target_dates:
        if d in known_dates:
            continue
        k = len(office_vals)
        pred = _predict_office(d, k, office_vals, row_for(d), stats, sub)
        office_vals.append(pred)
        preds[d] = pred
    return pd.Series(preds)


# ---------------------------------------------------------------------------
# 3. Pipeline de features (port du notebook 03)
# ---------------------------------------------------------------------------

def _weather_defaults(history: pd.DataFrame) -> pd.DataFrame:
    """Climatologies mensuelles issues de l'historique réel, pour les jours inconnus."""
    history = history.copy()
    if "month_n" not in history.columns:
        history["month_n"] = pd.to_datetime(history["Date"]).dt.month
    real = history[["month_n", "temperature", "temperature_felt",
                    "wind_speed_kmh", "cloud_cover_pct"]]
    return real.groupby("month_n").mean()


def _calendar_features(d: pd.Timestamp, min_date: pd.Timestamp) -> dict:
    feats = {
        "day_of_month": d.day,
        "week_of_year": int(d.isocalendar()[1]),
        "month_n": d.month,
        "quarter": d.quarter,
        "year_n": d.year,
        "day_of_year": d.dayofyear,
        "days_in_month": d.days_in_month,
        "dow": d.dayofweek,
    }
    feats["is_weekend"] = 1 if d.dayofweek in (4, 5) else 0
    feats["is_sun"] = 1 if d.dayofweek == 6 else 0
    feats["is_mon"] = 1 if d.dayofweek == 0 else 0
    feats["is_tue"] = 1 if d.dayofweek == 1 else 0
    feats["is_wed"] = 1 if d.dayofweek == 2 else 0
    feats["is_thu"] = 1 if d.dayofweek == 3 else 0
    feats["is_sunday_workday"] = feats["is_sun"]
    doy = float(d.dayofyear)
    for kk in range(1, 4):
        feats[f"sin_year_{kk}"] = np.sin(2 * np.pi * kk * doy / 365.25)
        feats[f"cos_year_{kk}"] = np.cos(2 * np.pi * kk * doy / 365.25)
    dow = float(d.dayofweek)
    feats["sin_week"] = np.sin(2 * np.pi * dow / 5)
    feats["cos_week"] = np.cos(2 * np.pi * dow / 5)
    feats["trend_days"] = (d - min_date).days
    feats["month_progress"] = d.day / d.days_in_month
    feats["week_of_month"] = (d.day - 1) // 7 + 1
    feats["is_week1_month"] = 1 if feats["week_of_month"] == 1 else 0
    feats["is_week4_month"] = 1 if feats["week_of_month"] >= 4 else 0
    return feats


def _build_workspace(
    history: pd.DataFrame, office_preds: pd.Series
) -> pd.DataFrame:
    """Fusionne l'historique réel et les jours cibles reconstruits (météo/menu par défaut).

    Le workspace reproduit la chronologie *éparse* du notebook 03 : les lignes
    observées (avec valeurs réelles, y compris ratio) suivies des lignes cibles,
    ce qui donne exactement les mêmes sémantiques de shift (en lignes) qu'à
    l'entraînement.
    """
    real = history.set_index("Date").copy()

    defaults = _weather_defaults(history)
    min_date = history["Date"].min()

    rows = []
    for d, opv in office_preds.items():
        row = {"Date": d}
        cal = _calendar_features(d, min_date)
        hol = _holiday_columns(pd.DatetimeIndex([d])).iloc[0]
        ram = _ramadan_flags(pd.DatetimeIndex([d])).iloc[0]
        row.update(cal)
        row.update(hol.to_dict())
        row.update(ram.to_dict())
        row["office_present"] = float(opv)

        m = d.month
        if m in defaults.index:
            row["temperature"] = float(defaults.loc[m, "temperature"])
            row["temperature_felt"] = float(defaults.loc[m, "temperature_felt"])
            row["wind_speed_kmh"] = float(defaults.loc[m, "wind_speed_kmh"])
            row["cloud_cover_pct"] = float(defaults.loc[m, "cloud_cover_pct"])
        else:
            row["temperature"] = row["temperature_felt"] = 20.0
            row["wind_speed_kmh"] = row["cloud_cover_pct"] = 0.0
        row["precipitation_mm"] = 0.0
        row["wind_gust_kmh"] = row["wind_speed_kmh"]
        row["precipitation_type"] = ""
        row["weather_conditions"] = ""
        row["plat_principal_1"] = np.nan
        row["plat_principal_2"] = np.nan
        row["entrees"] = np.nan
        row["employees_count"] = np.nan
        row["ratio"] = np.nan
        rows.append(row)

    synth = (pd.DataFrame(rows).set_index("Date") if rows else
             pd.DataFrame(index=pd.DatetimeIndex([])))

    work = pd.concat([real, synth], axis=0)
    work = work.sort_index()
    cols = []
    for c in real.columns:
        if c != "Date" and c not in cols:
            cols.append(c)
    for c in synth.columns:
        if c != "Date" and c not in cols:
            cols.append(c)
    work = work[cols].reset_index()
    work.columns = ["Date"] + list(work.columns[1:])
    return work


def build_features(work: pd.DataFrame) -> pd.DataFrame:
    """Rejoue le notebook 03 sur la chronologie étendue -> colonnes 126 features."""
    df = work.copy().sort_values("Date").reset_index(drop=True)

    # --- Section 1: calendaire ---
    df["day_of_month"] = df["Date"].dt.day
    df["week_of_year"] = df["Date"].dt.isocalendar().week.astype(int)
    df["month_n"] = df["Date"].dt.month
    df["quarter"] = df["Date"].dt.quarter
    df["year_n"] = df["Date"].dt.year
    df["day_of_year"] = df["Date"].dt.dayofyear
    df["days_in_month"] = df["Date"].dt.days_in_month
    df["dow"] = df["Date"].dt.dayofweek
    df["is_weekend"] = df["dow"].isin([4, 5]).astype(int)
    df["is_sun"] = (df["dow"] == 6).astype(int)
    df["is_mon"] = (df["dow"] == 0).astype(int)
    df["is_tue"] = (df["dow"] == 1).astype(int)
    df["is_wed"] = (df["dow"] == 2).astype(int)
    df["is_thu"] = (df["dow"] == 3).astype(int)
    df["is_sunday_workday"] = df["is_sun"]
    doy = df["day_of_year"].astype(float)
    for kk in range(1, 4):
        df[f"sin_year_{kk}"] = np.sin(2 * np.pi * kk * doy / 365.25)
        df[f"cos_year_{kk}"] = np.cos(2 * np.pi * kk * doy / 365.25)
    df["sin_week"] = np.sin(2 * np.pi * df["dow"] / 5)
    df["cos_week"] = np.cos(2 * np.pi * df["dow"] / 5)
    min_date = df["Date"].min()
    df["trend_days"] = (df["Date"] - min_date).dt.days
    df["month_progress"] = df["day_of_month"] / df["days_in_month"]
    df["week_of_month"] = (df["day_of_month"] - 1) // 7 + 1
    df["is_week1_month"] = (df["week_of_month"] == 1).astype(int)
    df["is_week4_month"] = (df["week_of_month"] >= 4).astype(int)

    # --- Section 2: jours fériés ---
    hol = _holiday_columns(df["Date"])
    for col in hol.columns:
        df[col] = hol[col].values
    ram = _ramadan_flags(df["Date"])
    for col in ram.columns:
        df[col] = ram[col].values
    df["is_working_day"] = df["is_working_day"].fillna(0)
    df["is_workday"] = (df["is_weekend"] == 0) & (df["is_any_holiday"] == 0)
    df["prev_is_holiday_or_wknd"] = (df["is_any_holiday"].shift(1, fill_value=0) |
                                     df["is_weekend"].shift(1, fill_value=0))
    df["next_is_holiday_or_wknd"] = (df["is_any_holiday"].shift(-1, fill_value=0) |
                                     df["is_weekend"].shift(-1, fill_value=0))
    df["bridge_day"] = (df["is_workday"] & df["prev_is_holiday_or_wknd"] &
                        df["next_is_holiday_or_wknd"]).astype(int)
    df.drop(columns=["is_workday", "prev_is_holiday_or_wknd", "next_is_holiday_or_wknd"], inplace=True)

    df["is_august"] = (df["month_n"] == 8).astype(int)
    df["is_july"] = (df["month_n"] == 7).astype(int)
    df["is_summer"] = df["month_n"].isin([6, 7, 8]).astype(int)
    df["is_yearend"] = ((df["month_n"] == 12) & (df["day_of_month"] >= 22)).astype(int)
    df["is_jan_start"] = ((df["month_n"] == 1) & (df["day_of_month"] <= 10)).astype(int)
    df["is_payday1"] = df["day_of_month"].isin(range(1, 6)).astype(int)
    df["is_payday2"] = df["day_of_month"].isin(range(14, 17)).astype(int)
    df["is_payday3"] = (df["day_of_month"] >= 26).astype(int)

    # --- Section 3: office presence (shift >= 7) ---
    for lag in (7, 14, 21, 28):
        df[f"op_lag_{lag}"] = df["office_present"].shift(lag)
    base = df["office_present"].shift(7)
    for w in (28, 56):
        df[f"op_roll_mean_{w}"] = base.rolling(w).mean()
        df[f"op_roll_std_{w}"] = base.rolling(w).std()
        df[f"op_roll_max_{w}"] = base.rolling(w).max()
        df[f"op_roll_min_{w}"] = base.rolling(w).min()

    op_dow_mean_vals = np.full(len(df), np.nan)
    op_dow_std_vals = np.full(len(df), np.nan)
    op_dow_med_vals = np.full(len(df), np.nan)
    for i in range(len(df)):
        if i < 7:
            continue
        dd = df.iloc[i]["dow"]
        past = df.iloc[:i]
        past_dow = past[past["dow"] == dd]["office_present"].dropna()
        if len(past_dow) >= 3:
            op_dow_mean_vals[i] = past_dow.mean()
            op_dow_std_vals[i] = past_dow.std()
            op_dow_med_vals[i] = past_dow.median()
    df["op_dow_mean"] = op_dow_mean_vals
    df["op_dow_std"] = op_dow_std_vals
    df["op_dow_median"] = op_dow_med_vals
    df["op_dow_zscore"] = (df["office_present"] - df["op_dow_mean"]) / (df["op_dow_std"] + 1)

    glob_mean_vals = np.full(len(df), np.nan)
    glob_std_vals = np.full(len(df), np.nan)
    cumsum = 0.0
    cumsum2 = 0.0
    for i in range(len(df)):
        v = df.iloc[i]["office_present"]
        if pd.notna(v):
            cumsum += v
            cumsum2 += v * v
            n = i + 1
            glob_mean_vals[i] = cumsum / n
            glob_std_vals[i] = np.sqrt(max(cumsum2 / n - (cumsum / n) ** 2, 0))
    df["op_annual_zscore"] = (df["office_present"] - glob_mean_vals) / (glob_std_vals + 1)

    df["op_diff_7d"] = df["office_present"] - df["op_lag_7"]
    df["op_pct_7d"] = df["op_diff_7d"] / (df["op_lag_7"] + 1)
    for day, col in (("sun", "is_sun"), ("mon", "is_mon"), ("tue", "is_tue"),
                     ("wed", "is_wed"), ("thu", "is_thu")):
        df[f"op_x_{day}"] = df["office_present"] * df[col]
    df["op_x_summer"] = df["office_present"] * df["is_summer"]
    df["op_x_ramadan"] = df["office_present"] * df["is_ramadan"]
    df["op_x_near_holiday"] = df["office_present"] * df["near_holiday"]

    # --- Section 4: menu ---
    import re
    import unicodedata

    def strip_accents(s):
        if pd.isna(s):
            return ""
        return "".join(c for c in unicodedata.normalize("NFD", str(s))
                       if unicodedata.category(c) != "Mn")

    def clean_menu_text(s):
        if pd.isna(s):
            return ""
        s = strip_accents(s).lower()
        s = re.sub(r"[^a-z0-9 ]", " ", s)
        return re.sub(r"\s+", " ", s).strip()

    df["menu_combined"] = (df["plat_principal_1"].fillna("") + " " +
                           df["plat_principal_2"].fillna("")).apply(clean_menu_text)

    kw_defs = {
        "kw_poulet": ["poulet", "blanc de poulet", "poulet grille"],
        "kw_boeuf": ["boeuf", "steak", "hachis", "hache", "viande"],
        "kw_poisson": ["poisson", "merlu", "thon", "sole",
                       "mille feuille poisson", "sardine"],
        "kw_dinde": ["dinde", "escalope de dinde"],
        "kw_pates": ["pates", "spaghetti", "lasagne", "rechta"],
        "kw_riz": ["riz", "maklouba", "paella"],
        "kw_couscous": ["couscous"],
        "kw_tajine": ["tajine", "chtitha"],
        "kw_pizza": ["pizza"],
        "kw_sandwich": ["sandwich"],
        "kw_grillade": ["grille", "roti", "brochette"],
        "kw_panee": ["panee", "pane", "frit"],
        "kw_traditional": ["couscous", "tajine", "rechta", "chakhchoukha",
                           "maklouba", "berkoukes"],
        "kw_western": ["pizza", "pates", "spaghetti", "hamburger", "burger"],
    }
    for name, kws in kw_defs.items():
        df[name] = df["menu_combined"].apply(
            lambda t: int(any(kw in t for kw in kws))
        )
    df["is_premium_day"] = ((df["kw_traditional"] == 1) | (df["kw_grillade"] == 1)).astype(int)
    df["is_light_day"] = ((df["kw_pizza"] == 1) | (df["kw_sandwich"] == 1) |
                          (df["kw_panee"] == 1)).astype(int)
    df["has_second_dish"] = df["plat_principal_2"].notna().astype(int)
    df["premium_x_sun"] = df["is_premium_day"] * df["is_sun"]
    df["premium_x_thu"] = df["is_premium_day"] * df["is_thu"]
    df["light_x_thu"] = df["is_light_day"] * df["is_thu"]
    df["traditional_x_ramadan"] = df["kw_traditional"] * df["is_ramadan"]

    from sklearn.decomposition import TruncatedSVD
    from sklearn.feature_extraction.text import TfidfVectorizer

    menu_texts = df["menu_combined"].replace("", "empty")
    vectorizer = TfidfVectorizer(max_features=300, min_df=2)
    tfidf_mat = vectorizer.fit_transform(menu_texts)
    svd = TruncatedSVD(n_components=8, random_state=SEED)
    tfidf_comps = svd.fit_transform(tfidf_mat)
    for i in range(8):
        df[f"tfidf_svd_{i}"] = tfidf_comps[:, i]

    def kfold_target_encode(train_df, col, target, n_folds=5, smoothing=20):
        global_mean = train_df[target].mean()
        enc = pd.Series(np.nan, index=train_df.index)
        from sklearn.model_selection import KFold
        kf = KFold(n_splits=n_folds, shuffle=True, random_state=SEED)
        for tr_idx, va_idx in kf.split(train_df):
            tr = train_df.iloc[tr_idx]
            stats_ = tr.groupby(col)[target].agg(["mean", "count"])
            smooth = (stats_["count"] * stats_["mean"] + smoothing * global_mean) / \
                     (stats_["count"] + smoothing)
            map_ = smooth.to_dict()
            enc.iloc[va_idx] = train_df.iloc[va_idx][col].map(map_)
        return enc.fillna(global_mean)

    df["plat1_te"] = kfold_target_encode(df, "plat_principal_1", "ratio")
    df["conditions_te"] = kfold_target_encode(df, "weather_conditions", "ratio")

    # --- Section 5: météo ---
    df["temp_cold"] = (df["temperature"] < 12).astype(int)
    df["temp_mild"] = ((df["temperature"] >= 12) & (df["temperature"] < 25)).astype(int)
    df["temp_warm"] = ((df["temperature"] >= 25) & (df["temperature"] < 35)).astype(int)
    df["temp_hot"] = (df["temperature"] >= 35).astype(int)
    df["temp_felt_diff"] = df["temperature"] - df["temperature_felt"]
    df["has_rain"] = (df["precipitation_mm"].fillna(0) > 0.5).astype(int)
    df["heavy_rain"] = (df["precipitation_mm"].fillna(0) > 5.0).astype(int)
    df["rain_log"] = np.log1p(df["precipitation_mm"].fillna(0))
    df["high_wind"] = (df["wind_speed_kmh"].fillna(0) > 25).astype(int)
    df["overcast"] = (df["cloud_cover_pct"].fillna(0) > 80).astype(int)
    df["rain_x_sun"] = df["has_rain"] * df["is_sun"]
    df["rain_x_thu"] = df["has_rain"] * df["is_thu"]

    # --- Section 6: YoY ---
    df["yoy_ratio_5w"] = df["ratio"].shift(35)
    df["yoy_ratio_52w"] = df["ratio"].shift(364)
    smooth_vals = []
    for i in range(len(df)):
        start = max(0, i - 364 - 10)
        end = min(len(df), i - 364 + 11)
        if end - start < 3:
            smooth_vals.append(np.nan)
        else:
            smooth_vals.append(np.median(df.iloc[start:end]["ratio"].values))
    df["yoy_ratio_smooth"] = smooth_vals

    month_dow_mean_vals = np.full(len(df), np.nan)
    dow_mean_vals = np.full(len(df), np.nan)
    dow_median_vals = np.full(len(df), np.nan)
    dow_std_vals = np.full(len(df), np.nan)
    for i in range(len(df)):
        if i < 14:
            continue
        d = df.iloc[i]["dow"]
        m = df.iloc[i]["month_n"]
        past = df.iloc[:i]
        md_sub = past[(past["dow"] == d) & (past["month_n"] == m)]["ratio"].dropna()
        if len(md_sub) >= 2:
            month_dow_mean_vals[i] = md_sub.mean()
        d_sub = past[past["dow"] == d]["ratio"].dropna()
        if len(d_sub) >= 5:
            dow_mean_vals[i] = d_sub.mean()
            dow_median_vals[i] = d_sub.median()
            dow_std_vals[i] = d_sub.std()
    df["month_dow_ratio_mean"] = month_dow_mean_vals
    df["dow_ratio_mean"] = dow_mean_vals
    df["dow_ratio_median"] = dow_median_vals
    df["dow_ratio_std"] = dow_std_vals

    df["yoy_ratio_5w"] = df["yoy_ratio_5w"].fillna(df["yoy_ratio_smooth"])
    df["yoy_ratio_5w"] = df["yoy_ratio_5w"].fillna(df["month_dow_ratio_mean"])
    df["yoy_ratio_5w"] = df["yoy_ratio_5w"].fillna(df["dow_ratio_mean"])

    return df


# ---------------------------------------------------------------------------
# 4. Orchestration
# ---------------------------------------------------------------------------

def _deployment_feature_cols() -> list:
    path = MODELS_DIR / "_deployment.pkl"
    if path.exists():
        with open(path, "rb") as f:
            dep = pickle.load(f)
        cols = dep.get("feat_cols", [])
        if cols:
            return list(cols)
    return None


def _fill_live_nans(target_df: pd.DataFrame, history: pd.DataFrame) -> pd.DataFrame:
    """Remplace les NaN résiduels (weekends hors historique) par des agrégats historiques.

    L'historique réel ne contient que dim.-jeudi (dow 0,1,2,3,6) : les jours cibles
    de vendredi/samedi n'ont ni stats conditionnelles par DOW ni stats ratio.
    Plutôt que de laisser api/forecast.py les remplacer par 0, on substitue les
    moyennes/médianes historiques (même logique de repli que le sous-modèle office).
    """
    if target_df.empty:
        return target_df
    op = history["office_present"].astype(float)
    op_mean, op_std, op_med = float(op.mean()), float(op.std()), float(op.median())
    r = history["ratio"].dropna()
    r_mean = float(r.mean())
    r_median = float(r.median())
    r_std = float(r.std())

    target_df["op_dow_mean"] = target_df["op_dow_mean"].fillna(op_mean)
    target_df["op_dow_std"] = target_df["op_dow_std"].fillna(op_std)
    target_df["op_dow_median"] = target_df["op_dow_median"].fillna(op_med)
    target_df["op_dow_zscore"] = (
        (target_df["office_present"] - target_df["op_dow_mean"]) /
        (target_df["op_dow_std"] + 1)
    )
    target_df["month_dow_ratio_mean"] = target_df["month_dow_ratio_mean"].fillna(r_mean)
    target_df["dow_ratio_mean"] = target_df["dow_ratio_mean"].fillna(r_mean)
    target_df["dow_ratio_median"] = target_df["dow_ratio_median"].fillna(r_median)
    target_df["dow_ratio_std"] = target_df["dow_ratio_std"].fillna(r_std)
    return target_df


def generate_features(
    target_dates=None,
    days: int = 14,
    history=None,
    out_path=None,
) -> pd.DataFrame:
    """Génère les features live pour les dates cibles et les écrit dans features_live.csv."""
    if history is None:
        history = pd.read_csv(HISTORY_FILE, parse_dates=["Date"])
    history = history.sort_values("Date").reset_index(drop=True)
    if len(history) < MIN_HISTORY_ROWS:
        raise RuntimeError(f"Historique insuffisant: {len(history)} lignes")

    today = pd.Timestamp.today().normalize()
    if target_dates is None:
        target_dates = pd.date_range(today, periods=days, freq="D")
    target_dates = pd.DatetimeIndex(sorted(pd.DatetimeIndex(pd.to_datetime(list(target_dates)))))

    office_preds = roll_office_forward(history, target_dates)

    work = _build_workspace(history, office_preds)
    feats = build_features(work)

    feat_cols = _deployment_feature_cols()

    target_df = feats[feats["Date"].isin(target_dates)].copy()
    if feat_cols:
        missing = [c for c in feat_cols if c not in target_df.columns]
        if missing:
            raise RuntimeError(f"Features manquantes: {missing}")
        key_cols = [c for c in ["Date", "office_present", "office_present_pred"] if c in target_df.columns]
        target_df = target_df[key_cols + feat_cols]
    else:
        target_df = target_df.reindex(
            columns=["Date", "office_present"] +
            [c for c in feats.columns if c != "Date" and c != "office_present"]
        )

    target_df["office_present_pred"] = target_df["office_present"]
    target_df = _fill_live_nans(target_df, history)
    target_df = target_df.reset_index(drop=True)

    if out_path is None:
        out_path = OUT_FILE
    out_path = Path(out_path)
    target_df = target_df.reset_index(drop=True).sort_values("Date")
    target_df.to_csv(out_path, index=False)
    return target_df


# ---------------------------------------------------------------------------
# 5. CLI
# ---------------------------------------------------------------------------

def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Génération quotidienne des features pour la prévision live"
    )
    parser.add_argument("--days", type=int, default=14,
                        help="Nombre de jours calendaires à générer depuis aujourd'hui")
    parser.add_argument("--date", type=str, default=None,
                        help="Date cible unique (YYYY-MM-DD), prioritaire sur --days")
    parser.add_argument("--out", type=str, default=str(OUT_FILE),
                        help="Fichier CSV de sortie")
    parser.add_argument("--history", type=str, default=str(HISTORY_FILE),
                        help="Fichier CSV d'historique (real_clean)")
    args = parser.parse_args(argv)

    history = pd.read_csv(args.history, parse_dates=["Date"])
    if args.date:
        target_dates = [pd.Timestamp(args.date)]
    else:
        target_dates = None

    out = generate_features(
        target_dates=target_dates,
        days=args.days,
        history=history,
        out_path=args.out,
    )
    print(f"[daily_features] {len(out)} lignes écrites dans {args.out}")
    cols = out.columns
    nan_counts = out.isna().sum()
    nan_cols = nan_counts[nan_counts > 0]
    if len(nan_cols) > 0:
        print("[daily_features] NaN restants (à surveiller):")
        for c, n in nan_cols.items():
            print(f"  {c}: {n}")
    for _, row in out.head(3).iterrows():
        print(f"  {row['Date'].date()}  office={round(row['office_present'])}")


if __name__ == "__main__":
    main()