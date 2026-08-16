"""
Layer 1 — Prévision de la demande.

Ce module contient la logique de prévision, portée depuis les notebooks
d'expérimentation (V9-V12) une fois validée. Toute nouvelle expérimentation
se fait d'abord dans notebooks/, et n'est portée ici qu'une fois stabilisée.
"""
import numpy as np
import pandas as pd


def asymmetric_cost(y_true, y_pred) -> float:
    """Coût asymétrique : sous-estimation pénalisée 2x plus qu'une sur-estimation."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    diff = y_pred - y_true
    return float(np.sum(np.where(diff < 0, -2 * diff, diff)) / np.sum(y_true))


def predict_ratio(features: pd.DataFrame, model) -> np.ndarray:
    """Prédit le ratio employees_count / office_present pour un batch de features."""
    raise NotImplementedError("Porter la logique de prédiction depuis le notebook validé")


def predict_count(features: pd.DataFrame, model, office_present: pd.Series) -> np.ndarray:
    """Prédiction finale en nombre de repas = ratio prédit x office_present réel."""
    ratio = predict_ratio(features, model)
    return ratio * office_present.values
