"""
Layer 3 — Aide aux approvisionnements.

Traduit une prévision de repas en quantités d'ingrédients à commander.
"""


def compute_ingredient_quantities(predicted_count: int, menu: dict, safety_margin: float = 0.05) -> dict:
    """Quantité ingrédient = N_prévu x grammage_standard x (1 + marge_sécurité)."""
    raise NotImplementedError
