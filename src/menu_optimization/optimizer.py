"""
Layer 2 — Optimisation des menus.

Étant donnée une prévision de N repas, sélectionne les plats qui maximisent
l'attractivité (S) tout en minimisant le gaspillage prédit (G), sous
contrainte de budget (C <= B).

Score d'attractivité = corrélation historique entre le type de plat et le ratio
de fréquentation (issue de l'EDA / feature importance).
"""
import numpy as np
from typing import List, Dict, Optional


# Historical attractiveness scores per menu feature (from EDA correlation with ratio)
# Positive = more attractive, Negative = less attractive
DEFAULT_ATTRACTIVENESS = {
    "entree_sale":        0.372,
    "has_2nd_plat":       0.355,
    "n_entree_choices":   0.305,
    "menu_pane_frit":     0.253,
    "menu_frite":         0.227,
    "menu_is_light":      0.207,
    "entree_salade":      0.178,
    "is_menu_chef":       0.144,
    "menu_grille":        0.139,
    "menu_pomme_terre":   0.117,
    "menu_poisson":       0.094,
    "menu_sans_viande":   0.059,
    "menu_riz":           0.046,
    "entree_soupe":       0.045,
    "menu_poulet":        0.020,
    "menu_veau":          0.012,
    "menu_sauce_mijote":  0.003,
    "entree_bourek":     -0.018,
    "menu_legumes":      -0.023,
    "menu_dinde":        -0.027,
    "menu_boeuf":        -0.080,
    "menu_pates":        -0.084,
    "menu_gratin":       -0.090,
    "menu_is_traditional": -0.196,
}

# Estimated cost per meal type (DZD, rough order of magnitude)
DEFAULT_COST_PER_MEAL = {
    "standard":  350.0,
    "premium":   500.0,
    "light":     250.0,
    "traditional": 300.0,
}

# Standard grammages per ingredient (grams per meal)
STANDARD_GRAMMAGES = {
    "viande":      200,
    "poisson":     220,
    "poulet":      250,
    "riz":         150,
    "pates":       150,
    "legumes":     100,
    "pain":         80,
    "huile":        15,
    "salade":      100,
    "soupe":       200,
}


def score_menu(
    menu_features: dict,
    historical_attractiveness: Optional[Dict[str, float]] = None,
) -> float:
    """
    Score d'attractivité d'un menu basé sur ses features binaires.

    Args:
        menu_features: dict of binary features (e.g. {"menu_poulet": 1, "entree_sale": 1, ...})
        historical_attractiveness: correlation of each feature with attendance ratio

    Returns:
        Aggregated attractiveness score (higher = more people will come).
    """
    if historical_attractiveness is None:
        historical_attractiveness = DEFAULT_ATTRACTIVENESS

    score = 0.0
    for feat, val in menu_features.items():
        if val and feat in historical_attractiveness:
            score += historical_attractiveness[feat]
    return score


def estimate_waste_risk(
    menu_features: dict,
    predicted_count: int,
) -> float:
    """
    Estimate waste risk for a menu given the predicted attendance.

    Menus with perishable items (fish, salad) have higher waste risk.
    Traditional/heavy menus tend to have lower waste risk (better shelf life).
    """
    risk = 0.0

    # Higher risk for perishable proteins
    if menu_features.get("menu_poisson"):
        risk += 0.15
    if menu_features.get("menu_salade"):
        risk += 0.05

    # Lower risk for traditional / hearty dishes
    if menu_features.get("menu_is_traditional"):
        risk -= 0.10
    if menu_features.get("menu_grille"):
        risk -= 0.05

    # Scale by predicted count (larger batches = more waste potential)
    scale = min(predicted_count / 300.0, 1.5)
    risk *= scale

    return max(0.0, min(1.0, risk))


def optimize_menu(
    predicted_count: int,
    budget: float,
    candidate_menus: List[dict],
    historical_attractiveness: Optional[Dict[str, float]] = None,
    waste_weight: float = 0.3,
    cost_weight: float = 0.2,
) -> dict:
    """
    Sélectionne le meilleur menu sous contrainte de budget.

    Each candidate menu is a dict with:
      - "name": str
      - "features": dict of binary features
      - "cost_per_meal": float (estimated cost in DZD)

    Optimization objective:
        max  S(menu) - waste_weight * G(menu) - cost_weight * C_normalized(menu)
        s.t. predicted_count * cost_per_meal <= budget

    Args:
        predicted_count: forecasted number of meals
        budget: total budget available (DZD)
        candidate_menus: list of menu dicts
        historical_attractiveness: feature-attractiveness mapping
        waste_weight: weight for waste risk penalty
        cost_weight: weight for cost penalty

    Returns:
        dict with "name", "score", "cost_total", "features", "waste_risk"
    """
    if not candidate_menus:
        return {"name": None, "score": 0.0, "cost_total": 0.0, "features": {}, "waste_risk": 0.0}

    best = None
    best_score = -np.inf

    for menu in candidate_menus:
        cost_per = menu.get("cost_per_meal", DEFAULT_COST_PER_MEAL["standard"])
        cost_total = predicted_count * cost_per

        # Budget constraint: skip if over budget
        if cost_total > budget:
            continue

        features = menu.get("features", {})
        attract = score_menu(features, historical_attractiveness)
        waste_risk = estimate_waste_risk(features, predicted_count)
        cost_normalized = cost_total / budget if budget > 0 else 0.0

        # Higher is better: attractiveness - penalties
        combined = attract - waste_weight * waste_risk - cost_weight * cost_normalized

        if combined > best_score:
            best_score = combined
            best = {
                "name": menu.get("name", "unknown"),
                "score": round(float(combined), 4),
                "attractiveness": round(float(attract), 4),
                "cost_total": round(float(cost_total), 2),
                "cost_per_meal": round(float(cost_per), 2),
                "features": features,
                "waste_risk": round(float(waste_risk), 4),
                "budget_remaining": round(float(budget - cost_total), 2),
            }

    if best is None:
        # All menus exceed budget — pick cheapest
        cheapest = min(candidate_menus, key=lambda m: m.get("cost_per_meal", 0))
        cost_total = predicted_count * cheapest.get("cost_per_meal", 0)
        best = {
            "name": cheapest.get("name", "unknown"),
            "score": 0.0,
            "cost_total": round(float(cost_total), 2),
            "cost_per_meal": round(float(cheapest.get("cost_per_meal", 0)), 2),
            "features": cheapest.get("features", {}),
            "waste_risk": 0.0,
            "budget_remaining": round(float(budget - cost_total), 2),
            "warning": "All menus exceed budget; selected cheapest option.",
        }

    return best
