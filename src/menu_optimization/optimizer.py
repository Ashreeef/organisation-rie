"""
Layer 2 — Optimisation des menus.

Étant donnée une prévision de N repas, sélectionne les plats qui maximisent
l'attractivité (S) tout en minimisant le gaspillage prédit (G), sous
contrainte de budget (C <= B).
"""


def score_menu(menu: dict, historical_attractiveness: dict) -> float:
    """Score d'attractivité d'un menu basé sur l'historique."""
    raise NotImplementedError


def optimize_menu(predicted_count: int, budget: float, candidate_menus: list) -> dict:
    """Sélectionne le meilleur menu sous contrainte de budget."""
    raise NotImplementedError
