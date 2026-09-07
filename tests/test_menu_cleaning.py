"""Tests for src/menu_optimization/menu_cleaning.py"""
import pandas as pd
import pytest
from src.menu_optimization.menu_cleaning import (
    strip_accents,
    normalize_text,
    split_composite,
    clean_entrees,
    categorize_dish,
    extract_menu_features,
)


class TestStripAccents:
    def test_basic_accents(self):
        assert strip_accents("café") == "cafe"
        assert strip_accents("résumé") == "resume"

    def test_no_accents(self):
        assert strip_accents("hello") == "hello"

    def test_empty_string(self):
        assert strip_accents("") == ""

    def test_none_input(self):
        result = strip_accents(None)
        assert isinstance(result, str)


class TestNormalizeText:
    def test_lowercase_and_accents(self):
        assert normalize_text("Café Résumé") == "cafe resume"

    def test_collapse_whitespace(self):
        assert normalize_text("  hello   world  ") == "hello world"

    def test_apostrophes_to_space(self):
        result = normalize_text("l'hotel d' Alger")
        assert "'" not in result

    def test_separators标准化(self):
        result = normalize_text("riz / poulet")
        assert " + " in result

    def test_none_returns_empty(self):
        assert normalize_text(None) == ""


class TestSplitComposite:
    def test_single_item(self):
        assert split_composite("riz") == ["riz"]

    def test_multiple_items(self):
        result = split_composite("riz + poulet + legumes")
        assert len(result) == 3

    def test_empty_string(self):
        assert split_composite("") == []


class TestCleanEntrees:
    def test_salade_soupe(self):
        result = clean_entrees("Salade, Soupe")
        assert result["entree_salade"] == 1
        assert result["entree_soupe"] == 1
        assert result["n_entree_choices"] == 2

    def test_empty_input(self):
        result = clean_entrees("")
        assert result["n_entree_choices"] == 0
        assert all(v == 0 for k, v in result.items() if k != "n_entree_choices")

    def test_bourek_detected(self):
        result = clean_entrees("Bourek")
        assert result["entree_bourek"] == 1

    def test_sale_detected(self):
        result = clean_entrees("Pizza")
        assert result["entree_sale"] == 1


class TestCategorizeDish:
    def test_poulet_grille(self):
        result = categorize_dish("Poulet grille avec riz")
        assert "poulet" in result["proteins"]
        assert "grille" in result["cooking"]
        assert "riz" in result["accompaniments"]

    def test_empty_input(self):
        result = categorize_dish("")
        assert result["is_traditional"] is False
        assert result["n_components"] == 0

    def test_traditional_detection(self):
        result = categorize_dish("Couscous au poulet")
        assert result["is_traditional"] is True

    def test_light_detection(self):
        result = categorize_dish("Sandwich poulet")
        assert result["is_light"] is True


class TestExtractMenuFeatures:
    @pytest.fixture
    def sample_df(self):
        return pd.DataFrame({
            "entrées": ["Salade, Soupe", "Pizza", None],
            "plat pricipal_1": ["Poulet grille + riz", "Rechta au poulet", "Couscous"],
            "plat principal_2": [None, "Salade", None],
            "Date": pd.date_range("2023-01-01", periods=3),
        })

    def test_returns_correct_shape(self, sample_df):
        result = extract_menu_features(sample_df)
        assert len(result) == 3
        assert result.shape[1] == 24

    def test_has_expected_columns(self, sample_df):
        result = extract_menu_features(sample_df)
        expected_cols = [
            "has_2nd_plat", "is_menu_chef", "menu_is_traditional", "menu_is_light",
            "menu_poulet", "entree_salade", "entree_soupe", "n_entree_choices",
        ]
        for col in expected_cols:
            assert col in result.columns

    def test_has_2nd_plat_detected(self, sample_df):
        result = extract_menu_features(sample_df)
        assert result["has_2nd_plat"].iloc[1] == 1
        assert result["has_2nd_plat"].iloc[0] == 0

    def test_preserves_index(self, sample_df):
        result = extract_menu_features(sample_df)
        pd.testing.assert_index_equal(result.index, sample_df.index)
