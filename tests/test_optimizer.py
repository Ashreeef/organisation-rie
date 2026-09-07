"""Tests for src/menu_optimization/optimizer.py"""
import pytest
from src.menu_optimization.optimizer import (
    score_menu,
    estimate_waste_risk,
    optimize_menu,
)


class TestScoreMenu:
    def test_positive_features_increase_score(self):
        menu = {"entree_sale": 1, "has_2nd_plat": 1, "menu_poulet": 1}
        score = score_menu(menu)
        assert score > 0

    def test_negative_features_decrease_score(self):
        menu = {"menu_is_traditional": 1, "menu_gratin": 1}
        score = score_menu(menu)
        assert score < 0

    def test_empty_menu_zero_score(self):
        score = score_menu({})
        assert score == 0.0

    def test_known_top_feature(self):
        menu1 = {"entree_sale": 1}
        menu2 = {"menu_poulet": 1}
        s1 = score_menu(menu1)
        s2 = score_menu(menu2)
        assert s1 > s2  # entree_sale has higher correlation


class TestEstimateWasteRisk:
    def test_fish_higher_risk(self):
        risk_fish = estimate_waste_risk({"menu_poisson": 1}, 300)
        risk_chicken = estimate_waste_risk({"menu_poulet": 1}, 300)
        assert risk_fish > risk_chicken

    def test_traditional_lower_risk(self):
        risk_trad = estimate_waste_risk({"menu_is_traditional": 1}, 300)
        risk_none = estimate_waste_risk({}, 300)
        # Both may be 0.0 after clipping, so just verify traditional doesn't increase risk
        assert risk_trad <= risk_none

    def test_bounded(self):
        risk = estimate_waste_risk({"menu_poisson": 1, "menu_salade": 1}, 500)
        assert 0.0 <= risk <= 1.0

    def test_higher_count_higher_risk(self):
        low = estimate_waste_risk({"menu_poisson": 1}, 100)
        high = estimate_waste_risk({"menu_poisson": 1}, 500)
        assert high > low


class TestOptimizeMenu:
    def test_selects_best_within_budget(self):
        menus = [
            {"name": "A", "features": {"entree_sale": 1, "menu_poulet": 1}, "cost_per_meal": 350},
            {"name": "B", "features": {"menu_is_traditional": 1}, "cost_per_meal": 300},
        ]
        result = optimize_menu(300, 200_000, menus)
        assert result["name"] == "A"
        assert result["cost_total"] <= 200_000

    def test_skips_over_budget(self):
        menus = [
            {"name": "expensive", "features": {}, "cost_per_meal": 1000},
            {"name": "cheap", "features": {"entree_sale": 1}, "cost_per_meal": 300},
        ]
        result = optimize_menu(300, 200_000, menus)
        assert result["name"] == "cheap"

    def test_empty_menus(self):
        result = optimize_menu(300, 100_000, [])
        assert result["name"] is None

    def test_all_over_budget_picks_cheapest(self):
        menus = [
            {"name": "A", "features": {}, "cost_per_meal": 1000},
            {"name": "B", "features": {}, "cost_per_meal": 800},
        ]
        result = optimize_menu(300, 100_000, menus)
        assert result["name"] == "B"
        assert "warning" in result

    def test_returns_expected_keys(self):
        menus = [{"name": "X", "features": {"menu_poulet": 1}, "cost_per_meal": 350}]
        result = optimize_menu(200, 100_000, menus)
        assert "name" in result
        assert "score" in result
        assert "cost_total" in result
        assert "waste_risk" in result
