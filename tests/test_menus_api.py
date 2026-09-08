"""
Tests Phase 4 du backend menus : règle plat_principal_1 → id du catalogue
(validate_menu_plan) et log des candidats non reconnus (log_unknown_dish /
get_unknown_dishes / _to_iso).

Hermétiques : MENUS_FILE / UNKNOWN_FILE pointent vers le tmp_path ;
_trigger_feature_regen est neutralisé (ne dépend d'aucune feature réelle).
"""
import sys
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import api.menus as m  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate(tmp_path, monkeypatch):
    monkeypatch.setattr(m, "DATA_DIR", tmp_path)
    monkeypatch.setattr(m, "MENUS_FILE", tmp_path / "planned_menus.csv")
    monkeypatch.setattr(m, "UNKNOWN_FILE", tmp_path / "unknown_dishes.csv")
    # Neutralise la régénération tierce (mode tests) — le save ne doit pas
    # dépendre des features réelles.
    monkeypatch.setattr(m, "_trigger_feature_regen", lambda _: None)
    yield


def _valid_id():
    from src.menu_optimization.menu_catalog_py import get_catalog
    return next(iter(get_catalog()["dishes"]))["id"]


# ---------------------------------------------------------------------------
# validate_menu_plan

class TestValidateMenuPlan:
    def test_accepts_empty_entrees_and_p2(self):
        # Jour 100 % vide (week-end, non planifié) : OK.
        m.validate_menu_plan({"entrees": "", "plat_principal_1": "",
                              "plat_principal_1_id": "", "plat_principal_2": ""})

    def test_accepts_valid_catalog_id(self):
        m.validate_menu_plan({"plat_principal_1": "Couscous",
                              "plat_principal_1_id": _valid_id()})

    def test_rejects_text_without_id(self):
        # Ancien flux legacy texte-sans-id : bloqué (Phase 4).
        with pytest.raises(ValueError):
            m.validate_menu_plan({"plat_principal_1": "Plat libre quelconque",
                                  "plat_principal_1_id": ""})

    def test_whitespace_p1_equivalent_empty(self):
        # "   " est strip → plat principal vide (jour non planifié) : OK.
        m.validate_menu_plan({"plat_principal_1": "   ",
                              "plat_principal_1_id": ""})

    def test_rejects_id_not_in_catalog(self):
        with pytest.raises(ValueError):
            m.validate_menu_plan({"plat_principal_1": "Plat",
                                  "plat_principal_1_id": "dish-inexistant"})

    def test_rejects_accompaniment_id_as_p1(self):
        # Un id d'accompagnement ne doit pas passer comme plat principal.
        from src.menu_optimization.menu_catalog_py import get_catalog
        acc = next(iter(get_catalog()["accompaniments"]))["id"]
        with pytest.raises(ValueError):
            m.validate_menu_plan({"plat_principal_1": "X", "plat_principal_1_id": acc})


# ---------------------------------------------------------------------------
# log_unknown_dish / get_unknown_dishes

class TestUnknownDishLog:
    def test_known_returns_true_without_logging(self, tmp_path):
        # Un texte qui résout au catalogue ne doit RIEN écrire (ni fichier).
        res = m.log_unknown_dish("Couscous")
        assert res["known"] is True
        assert res["dish_id"]
        path = tmp_path / "unknown_dishes.csv"
        assert not path.exists() or pd.read_csv(path).empty

    def test_known_variant_alias(self):
        # Même via un alias : considéré connu, pas de log.
        res = m.log_unknown_dish("Titli au poulet")
        assert res["known"] is True

    def test_unknown_logged_with_norm(self, tmp_path):
        res = m.log_unknown_dish("Plat Totalement Inconnu XYZ")
        assert res["known"] is False
        assert res["count"] == 1
        df = pd.read_csv(tmp_path / "unknown_dishes.csv")
        assert len(df) == 1
        assert df.iloc[0]["text_norm"] == "plat totalement inconnu xyz"

    def test_increment_on_same_normalized_text(self, tmp_path):
        # Deux saisies différentes du MÊME plat normé → une entrée, count=2.
        m.log_unknown_dish("Escalope de dinde + riz")
        res = m.log_unknown_dish("escalope de dinde  +  riz")  # casing/espaces
        assert res["count"] == 2
        df = pd.read_csv(tmp_path / "unknown_dishes.csv")
        assert len(df) == 1
        assert df.iloc[0]["count"] == 2

    def test_increment_keeps_first_seen(self, tmp_path):
        r1 = m.log_unknown_dish("Escalope de dinde + riz", seen_on="01/02/2025")
        assert r1["first_seen"] == "2025-02-01"
        r2 = m.log_unknown_dish("Escalope de dinde + riz", seen_on="15/03/2025")
        assert r2["count"] == 2
        assert r2["first_seen"] == "2025-02-01"  # pas réécrasée
        assert r2["last_seen"] == "2025-03-15"

    def test_invalid_date_raises(self):
        with pytest.raises(ValueError):
            m.log_unknown_dish("Plat X", seen_on="pas-une-date")

    def test_empty_text_raises(self):
        with pytest.raises(ValueError):
            m.log_unknown_dish("   ")

    def test_get_unknown_sorted_by_frequency(self, tmp_path):
        m.log_unknown_dish("Rare XYZ")
        m.log_unknown_dish("Commun ABC", seen_on="01/01/2025")
        m.log_unknown_dish("Commun ABC", seen_on="02/01/2025")
        out = m.get_unknown_dishes()
        ids = [r["text_norm"] for r in out]
        # "commun abc" (count=2) d'abord, puis "rare xyz" (count=1)
        assert ids[0] == "commun abc"
        assert ids[1] == "rare xyz"
        assert out[0]["count"] == 2
        assert out[1]["count"] == 1


# ---------------------------------------------------------------------------
# _to_iso

class TestToIso:
    @pytest.mark.parametrize("raw,expected", [
        ("2025-02-01", "2025-02-01"),
        ("01/02/2025", "2025-02-01"),
        ("01/02/25", "2025-02-01"),
        ("  2025-02-01  ", "2025-02-01"),
        ("2025-02-01T10:30:00", "2025-02-01"),
    ])
    def test_formats(self, raw, expected):
        assert m._to_iso(raw) == expected

    def test_invalid(self):
        with pytest.raises(ValueError):
            m._to_iso("pas-une-date")

    def test_empty(self):
        with pytest.raises(ValueError):
            m._to_iso("")