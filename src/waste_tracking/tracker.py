"""
Layer 4 — Suivi du gaspillage et boucle de feedback.

Ingestion quotidienne : repas préparés (P), repas servis (S).
Gaspillage G = P - S, taux g = G / P.

Provides:
- Daily waste logging
- Waste log persistence (CSV)
- Summary statistics (weekly, monthly)
- Feedback signal for model recalibration
"""
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Optional


def log_daily_waste(date, prepared: int, served: int, menu: str = "") -> dict:
    """Log waste for a single day. Returns the waste record."""
    waste = prepared - served
    rate = waste / prepared if prepared else 0.0
    return {
        "date": date,
        "prepared": prepared,
        "served": served,
        "waste": waste,
        "waste_rate": round(rate, 4),
        "menu": menu,
    }


def load_waste_log(path: str) -> pd.DataFrame:
    """Load the waste log CSV into a DataFrame."""
    p = Path(path)
    if not p.exists():
        return pd.DataFrame(columns=["date", "prepared", "served", "waste", "waste_rate", "menu"])
    df = pd.read_csv(p, parse_dates=["date"])
    return df


def append_waste_entry(path: str, entry: dict) -> pd.DataFrame:
    """Append a single waste entry to the CSV log and return the updated DataFrame."""
    df = load_waste_log(path)
    new_row = pd.DataFrame([entry])
    df = pd.concat([df, new_row], ignore_index=True)
    df.to_csv(path, index=False)
    return df


def waste_summary(df: pd.DataFrame, period: str = "weekly") -> pd.DataFrame:
    """
    Aggregate waste statistics over a time period.

    Args:
        df: waste log DataFrame (must have 'date', 'waste', 'waste_rate', 'prepared')
        period: 'daily', 'weekly', or 'monthly'

    Returns:
        DataFrame with aggregated stats
    """
    if df.empty:
        return pd.DataFrame()

    df = df.copy()
    df["date"] = pd.to_datetime(df["date"])

    if period == "daily":
        df["period"] = df["date"].dt.date
    elif period == "weekly":
        df["period"] = df["date"].dt.isocalendar().week.astype(str) + "-" + df["date"].dt.year.astype(str)
    elif period == "monthly":
        df["period"] = df["date"].dt.to_period("M").astype(str)
    else:
        raise ValueError(f"Unknown period: {period}. Use 'daily', 'weekly', or 'monthly'.")

    summary = df.groupby("period").agg(
        days=("date", "count"),
        total_prepared=("prepared", "sum"),
        total_served=("served", "sum"),
        total_waste=("waste", "sum"),
        avg_waste_rate=("waste_rate", "mean"),
        max_waste_rate=("waste_rate", "max"),
    ).reset_index()

    summary["overall_waste_rate"] = (
        summary["total_waste"] / summary["total_prepared"].replace(0, np.nan)
    ).round(4)

    return summary


def detect_anomalies(df: pd.DataFrame, threshold_rate: float = 0.25) -> pd.DataFrame:
    """Flag days where waste rate exceeds threshold (potential operational issues)."""
    if df.empty:
        return pd.DataFrame()
    flagged = df[df["waste_rate"] > threshold_rate].copy()
    flagged["reason"] = flagged["waste_rate"].apply(
        lambda r: f"Waste rate {r*100:.1f}% exceeds threshold {threshold_rate*100:.0f}%"
    )
    return flagged


def compute_feedback_signal(df: pd.DataFrame, last_n_days: int = 30) -> dict:
    """
    Compute a feedback signal from recent waste data for model recalibration.
    
    Returns:
        dict with:
        - avg_over_preparation: mean of (prepared - served) / prepared over last N days
        - bias_direction: 'over_prepares' if avg > 0.05, 'under_prepares' if < -0.02, 'balanced'
        - recommended_adjustment: float to add to model prediction (negative = predict less)
    """
    if df.empty or len(df) < 5:
        return {
            "avg_over_preparation": 0.0,
            "bias_direction": "insufficient_data",
            "recommended_adjustment": 0,
        }

    recent = df.sort_values("date").tail(last_n_days)
    avg_waste_rate = float(recent["waste_rate"].mean())

    if avg_waste_rate > 0.05:
        direction = "over_prepares"
        adjustment = -avg_waste_rate * recent["prepared"].mean()
    elif avg_waste_rate < -0.02:
        direction = "under_prepares"
        adjustment = abs(avg_waste_rate) * recent["prepared"].mean()
    else:
        direction = "balanced"
        adjustment = 0.0

    return {
        "avg_over_preparation": round(avg_waste_rate, 4),
        "bias_direction": direction,
        "recommended_adjustment": round(float(adjustment), 1),
    }
