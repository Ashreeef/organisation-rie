"""Tests pour src/forecasting/model.py — a compléter au fur et à mesure."""
from src.forecasting.model import asymmetric_cost


def test_asymmetric_cost_underprediction_penalized_2x():
    # Sous-estimation de 10 -> coût 20 ; sur-estimation de 10 -> coût 10
    under = asymmetric_cost([100], [90])
    over = asymmetric_cost([100], [110])
    assert under == 2 * over
