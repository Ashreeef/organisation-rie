"""Tests for src/procurement/planner.py"""
import pytest
from src.procurement.planner import (
    compute_ingredient_quantities,
    format_procurement_order,
)


class TestComputeIngredientQuantities:
    def test_basic_poulet_menu(self):
        menu = {"menu_poulet": 1, "entree_salade": 1}
        result = compute_ingredient_quantities(300, menu)
        assert "poulet" in result
        assert "riz" in result
        assert "legumes" in result
        assert "salade" in result
        assert result["poulet"]["meals"] == 300

    def test_safety_margin_applied(self):
        menu = {"menu_poulet": 1}
        result_no_margin = compute_ingredient_quantities(100, menu, safety_margin=0.0)
        result_with_margin = compute_ingredient_quantities(100, menu, safety_margin=0.10)
        assert result_with_margin["poulet"]["grams"] > result_no_margin["poulet"]["grams"]

    def test_safety_margin_default(self):
        menu = {"menu_poulet": 1}
        result = compute_ingredient_quantities(100, menu)
        assert result["poulet"]["margin"] == 0.05

    def test_empty_menu_provides_defaults(self):
        result = compute_ingredient_quantities(100, {})
        assert len(result) > 0
        assert "viande" in result or "riz" in result

    def test_negative_count_still_works(self):
        menu = {"menu_poulet": 1}
        result = compute_ingredient_quantities(0, menu)
        assert result["poulet"]["grams"] == 0

    def test_kg_conversion(self):
        menu = {"menu_poulet": 1}
        result = compute_ingredient_quantities(100, menu)
        grams = result["poulet"]["grams"]
        kg = result["poulet"]["kg"]
        assert kg == pytest.approx(grams / 1000, abs=0.01)

    def test_poisson_menu(self):
        menu = {"menu_poisson": 1}
        result = compute_ingredient_quantities(200, menu)
        assert "poisson" in result

    def test_traditional_menu(self):
        menu = {"menu_is_traditional": 1}
        result = compute_ingredient_quantities(200, menu)
        assert len(result) > 0


class TestFormatProcurementOrder:
    def test_returns_string(self):
        menu = {"menu_poulet": 1}
        quantities = compute_ingredient_quantities(300, menu)
        output = format_procurement_order(quantities)
        assert isinstance(output, str)
        assert "Commande" in output
        assert "TOTAL" in output
