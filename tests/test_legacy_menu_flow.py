"""
Tests d'intégration Phase 4 — chemin legacy menu texte-sans-id vers l'inférence.

Vérifie le warning soulevé en clôture de Phase 4 : un jour futur dont le menu
planifié contient un plat_principal_1 en texte libre NON résolu à un id
(ancien enregistrement pre-Phase 4, ou saisie passée entre les mailles du
filet) traverse le pipeline réel `regenerate_features_for_date` →
`generate_features` → `api.forecast.predict_today`.

L'exigence : AUCUN NaN / crash silencieux dans les colonnes que le modèle
consomme (déjà : le repli regex + TF-IDF/SVD + target-encoding à moyenne
globale absorbent le texte non mappé). Le test gèle ce comportement pour
éviter une résurgence du NaN silencieux (DecimalError).

Hermétiques : tout se joue dans tmp_path (planned_menus, features_live),
seuls l'historique réel (real_clean.csv) et le bundle réel (_deployment.pkl)
sont lus (lecture seule). Guarded si l'un des deux manque.
"""
import sys
from datetime import date as _date
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.forecasting import daily_features as df  # noqa: E402

DATA_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

HAS_REAL_KIT = (
    (DATA_DIR / "real_clean.csv").exists()
    and (DATA_DIR / "features_train.csv").exists()
    and (MODELS_DIR / "_deployment.pkl").exists()
)

pytestmark = pytest.mark.skipif(
    not HAS_REAL_KIT,
    reason="real_clean.csv / features_train.csv / _deployment.pkl absents",
)


@pytest.fixture()
def isolated_workspace(tmp_path, monkeypatch):
    """planned_menus.csv + features_live.csv dans tmp ; historique et modèles
    réels en lecture seule."""
    monkeypatch.setattr(df, "PLANNED_MENUS_FILE", tmp_path / "planned_menus.csv")
    monkeypatch.setattr(df, "OUT_FILE", tmp_path / "features_live.csv")
    monkeypatch.setattr(df, "HISTORY_FILE", DATA_DIR / "real_clean.csv")
    return tmp_path


def _future_operational_date(exclude=None) -> pd.Timestamp:
    """Une vraie date future opérationnelle hors historique (min +21j)."""
    history = pd.read_csv(DATA_DIR / "real_clean.csv", parse_dates=["Date"])
    horizon = pd.Timestamp(_date.today()) + pd.Timedelta(days=21)
    candidates = df._next_operational_dates(horizon, 12)
    taken = set(exclude or ())
    for c in candidates:
        key = c.normalize()
        if key not in taken and key not in set(history["Date"].dt.normalize()):
            return key
    raise AssertionError("aucune date future opérationnelle libre")


def _write_legacy_menu(date, plat_1, tmp_path):
    pm = pd.DataFrame([{
        "date": date, "entrees": "Salade",
        "plat_principal_1": plat_1, "plat_principal_2": "",
        "plat_principal_1_id": "", "plat_principal_2_id": "",
    }])
    pm.to_csv(tmp_path / "planned_menus.csv", index=False)


class TestLegacyMenuTextToInference:
    def test_legacy_text_without_id_no_nan_no_crash(self, isolated_workspace, tmp_path):
        import api.forecast as f

        # Bundle et historique réels, sorties dans tmp.
        f.MODELS_DIR = MODELS_DIR
        f.DATA_DIR = tmp_path
        f._deploy_cache = f._sub_cache = f._features_cache = None

        target = _future_operational_date()
        _write_legacy_menu(target, "Plat Fantome Legacy Non Reference XYZ", tmp_path)

        ok = df.regenerate_features_for_date(target)
        assert ok, "la régénération des features a échoué"

        live = pd.read_csv(tmp_path / "features_live.csv", parse_dates=["Date"])
        row = live[live["Date"].dt.normalize() == target.normalize()]
        assert len(row) == 1
        row = row.iloc[0]

        dep = f._load_deployment()
        feat_cols = dep.get("feat_cols", [])
        assert feat_cols, "bundle sans feat_cols"
        for c in feat_cols:
            assert c in row.index, f"colonne modèle absente de la ligne : {c}"
            assert not pd.isna(row[c]), f"NaN silencieux dans la colonne {c}"

        # Le repli doit être visible : texte libre = non mappé.
        assert row["menu_mapped"] == 0

        # L'inférence aboutit (ratio borné, jamais d'erreur nano/DecimalError).
        res = f.predict_today(str(target.date()))
        assert 0.30 <= res["predicted_ratio"] <= 0.88
        assert res["employees_count"] > 0

    def test_known_menu_is_mapped_and_predicts(self, isolated_workspace, tmp_path):
        # Contraste : un menu qui résout à un id du catalogue est mappé.
        from src.menu_optimization.menu_catalog_py import get_catalog

        dish = get_catalog()["dishes"][0]

        import api.forecast as f
        f.MODELS_DIR = MODELS_DIR
        f.DATA_DIR = tmp_path
        f._deploy_cache = f._sub_cache = f._features_cache = None

        target = _future_operational_date()
        pm = pd.DataFrame([{
            "date": target, "entrees": "Salade",
            "plat_principal_1": dish["name"], "plat_principal_2": "",
            "plat_principal_1_id": dish["id"], "plat_principal_2_id": "",
        }])
        pm.to_csv(tmp_path / "planned_menus.csv", index=False)

        assert df.regenerate_features_for_date(target)
        live = pd.read_csv(tmp_path / "features_live.csv", parse_dates=["Date"])
        row = live[live["Date"].dt.normalize() == target.normalize()].iloc[0]
        assert row["menu_mapped"] == 1
        res = f.predict_today(str(target.date()))
        assert 0.30 <= res["predicted_ratio"] <= 0.88


class TestPhase6ServeTimeEnrichment:
    """Phase 6 : un menu sélectionné via le dashboard (id canonique explicite)
    voit son texte enrichi de ses alias avant TF-IDF/SVD au serving — répond au
    sanity check « un menu canonique doit produire une prévision finie et
    bornée » (équivalent du menu Dar El Kaid)."""

    def _predict_for_menu(self, isolated_workspace, tmp_path, plat_1, plat_1_id):
        import api.forecast as f
        f.MODELS_DIR = MODELS_DIR
        f.DATA_DIR = tmp_path
        f._deploy_cache = f._sub_cache = f._features_cache = None

        target = _future_operational_date()
        pm = pd.DataFrame([{
            "date": target, "entrees": "Salade",
            "plat_principal_1": plat_1, "plat_principal_2": "",
            "plat_principal_1_id": plat_1_id, "plat_principal_2_id": "",
        }])
        pm.to_csv(tmp_path / "planned_menus.csv", index=False)

        assert df.regenerate_features_for_date(target)
        live = pd.read_csv(tmp_path / "features_live.csv", parse_dates=["Date"])
        row = live[live["Date"].dt.normalize() == target.normalize()].iloc[0]
        res = f.predict_today(str(target.date()))
        return row, res

    def test_canonical_dish_with_id_predicts_and_has_aliases_enriched(self, isolated_workspace, tmp_path):
        from src.menu_optimization.menu_catalog_py import get_catalog
        dish = get_catalog()["dishes"][0]  # « Poulet rôti » (avec alias)

        row, res = self._predict_for_menu(
            isolated_workspace, tmp_path, dish["name"], dish["id"])

        # mappé + prévision finie et bornée (l'enrichissement n'a rien cassé)
        assert row["menu_mapped"] == 1
        assert 0.30 <= res["predicted_ratio"] <= 0.88

    def test_unmapped_text_with_id_predicts_finite(self, isolated_workspace, tmp_path):
        # texte non mappé avec id bidon → pas d'enrichissement, prévision ok
        row, res = self._predict_for_menu(
            isolated_workspace, tmp_path,
            "Plat Fantome Legacy Non Reference XYZ", "totally-unknown")
        assert row["menu_mapped"] == 0
        assert 0.30 <= res["predicted_ratio"] <= 0.88