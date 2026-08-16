"""
Layer 4 — Suivi du gaspillage et boucle de feedback.

Ingestion quotidienne : repas préparés (P), repas servis (S).
Gaspillage G = P - S, taux g = G / P.
"""
import pandas as pd


def log_daily_waste(date, prepared: int, served: int) -> dict:
    waste = prepared - served
    rate = waste / prepared if prepared else 0.0
    return {"date": date, "prepared": prepared, "served": served, "waste": waste, "waste_rate": rate}


def load_waste_log(path: str) -> pd.DataFrame:
    return pd.read_csv(path, parse_dates=["date"])
