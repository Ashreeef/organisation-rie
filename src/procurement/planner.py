"""
Layer 3 — Aide aux approvisionnements.

Traduit une prévision de repas en quantités d'ingrédients à commander
auprès des fournisseurs.

Quantité ingrédient = N_prévu x grammage_standard x (1 + marge_sécurité)
"""
from typing import Dict, Optional


# Standard grammages per ingredient type (grams per meal)
DEFAULT_GRAMMAGES = {
    "viande":       200,
    "poulet":       250,
    "dinde":        230,
    "boeuf":        200,
    "veau":         200,
    "poisson":      220,
    "riz":          150,
    "pates":        150,
    "pomme_terre":  120,
    "legumes":      100,
    "pain":          80,
    "huile":         15,
    "salade":       100,
    "soupe":        200,
    "epices":         5,
    "oeuf":          50,
    "lait":         100,
    "fromage":       30,
}

# Which ingredients are needed for each menu feature tag
INGREDIENT_MAP = {
    "menu_poulet":      ["poulet", "riz", "legumes", "huile", "epices"],
    "menu_boeuf":       ["boeuf", "riz", "legumes", "huile", "epices"],
    "menu_veau":        ["veau", "riz", "legumes", "huile", "epices"],
    "menu_dinde":       ["dinde", "riz", "legumes", "huile", "epices"],
    "menu_poisson":     ["poisson", "riz", "legumes", "huile", "epices"],
    "menu_sans_viande": ["legumes", "oeuf", "huile", "epices"],
    "menu_riz":         ["riz"],
    "menu_pates":       ["pates"],
    "menu_pomme_terre": ["pomme_terre"],
    "menu_frite":       ["huile"],
    "menu_grille":      ["huile", "epices"],
    "entree_salade":    ["salade", "huile"],
    "entree_soupe":     ["soupe"],
    "entree_sale":      ["fromage", "oeuf", "pain"],
    "entree_bourek":    ["pates", "oeuf", "huile"],
}


def compute_ingredient_quantities(
    predicted_count: int,
    menu: dict,
    safety_margin: float = 0.05,
    grammages: Optional[Dict[str, float]] = None,
    ingredient_map: Optional[Dict[str, list]] = None,
) -> dict:
    """
    Compute ingredient quantities to order.

    Args:
        predicted_count: forecasted number of meals
        menu: dict of binary features (e.g. {"menu_poulet": 1, "entree_salade": 1})
        safety_margin: extra fraction to buffer uncertainty (default 5%)
        grammages: override default grammages (grams per ingredient per meal)
        ingredient_map: override default ingredient-to-tag mapping

    Returns:
        dict of {ingredient: {"grams": float, "kg": float, "meals": int, "margin": float}}
    """
    if grammages is None:
        grammages = DEFAULT_GRAMMAGES
    if ingredient_map is None:
        ingredient_map = INGREDIENT_MAP

    # Aggregate required ingredients from active menu features
    ingredient_counts = {}
    for feature_tag, ingredients in ingredient_map.items():
        if menu.get(feature_tag, 0):
            for ing in ingredients:
                ingredient_counts[ing] = ingredient_counts.get(ing, 0) + 1

    # If no features matched, provide a basic default set
    if not ingredient_counts:
        ingredient_counts = {"viande": 1, "riz": 1, "legumes": 1, "huile": 1}

    # Compute quantities
    result = {}
    for ingredient, count in ingredient_counts.items():
        gram_per_meal = grammages.get(ingredient, 100) * min(count, 2)  # cap duplicate tags
        total_grams = predicted_count * gram_per_meal * (1 + safety_margin)
        result[ingredient] = {
            "grams": round(total_grams, 1),
            "kg":    round(total_grams / 1000, 2),
            "meals": predicted_count,
            "margin": safety_margin,
            "gram_per_meal": gram_per_meal,
        }

    return result


def format_procurement_order(ingredients: dict) -> str:
    """Format ingredient quantities as a human-readable procurement order."""
    lines = ["=== Commande d'approvisionnement ===", ""]
    total_kg = 0.0

    sorted_ings = sorted(ingredients.items(), key=lambda x: -x[1]["kg"])
    for name, info in sorted_ings:
        kg = info["kg"]
        total_kg += kg
        lines.append(f"  {name:20s}: {kg:7.1f} kg  ({info['grams']:.0f} g, {info['meals']} repas + {info['margin']*100:.0f}% marge)")

    lines.append("")
    lines.append(f"  {'TOTAL':20s}: {total_kg:7.1f} kg")
    return "\n".join(lines)
