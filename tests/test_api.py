"""
Tests for api.forecast — cascade inference, fallbacks et calendrier.

Hermétiques : MODELS_DIR / DATA_DIR pointent vers des dossiers temporaires
vides, donc `_load_deployment` construit le bundle de repli et aucune feature
réelle n'est lue, sauf dans TestIntegrationRealData (guarded, optionnel).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from api import forecast as f  # noqa: E402


@pytest.fixture(autouse=True)
def _isolate_dirs(tmp_path, monkeypatch):
    monkeypatch.setattr(f, "MODELS_DIR", tmp_path / "models")
    monkeypatch.setattr(f, "DATA_DIR", tmp_path / "data")
    (tmp_path / "models").mkdir(parents=True, exist_ok=True)
    (tmp_path / "data").mkdir(parents=True, exist_ok=True)
    f._deploy_cache = None
    f._sub_cache = None
    f._features_cache = None
    yield


def _write_features(df, tmp_path, name="features_live.csv"):
    path = tmp_path / "data" / name
    df.to_csv(path, index=False)
    return path


# ── Calendrier ─────────────────────────────────────────────────────

class TestCalendar:
    def test_algerian_dow_week_sun_sat(self):
        # 2026-09-07..13 = Lun..Dim ; convention date.weekday() : Lun=0..Dim=6
        dates = pd.date_range("2026-09-07", periods=7, freq="D")
        expected = [0, 1, 2, 3, 4, 5, 6]
        assert [f._algerian_dow(d) for d in dates] == expected

    def test_is_ramadan_window(self):
        assert f._is_ramadan(pd.Timestamp("2026-03-10")) is True
        assert f._is_ramadan(pd.Timestamp("2026-03-20")) is False  # Aïd el-Fitr

    def test_is_holiday_mawlid_corrected(self):
        # Mawlid 2026 = 25 août (corrigé) ; 25 septembre n'est plus férié
        assert f._is_holiday(pd.Timestamp("2026-08-25")) is True
        assert f._is_holiday(pd.Timestamp("2026-09-25")) is False


# ── get_model_info ─────────────────────────────────────────────────

class TestGetModelInfo:
    def test_fallback_bundle_counts(self):
        info = f.get_model_info()
        assert info["version"] == "3.0"
        assert info["total_models"] > 0
        assert info["lgb_count"] * info["xgb_count"] * info["catboost_count"] > 0
        assert info["feature_count"] == 0  # bundle de repli : aucun modèle entraîné
        assert set(info["oof_metrics"]) == {"Asym. Cost", "MAE (repas)", "RMSE (repas)"}


# ── predict_today sans features (repli calendaire) ─────────────────

class TestPredictTodayCalendarOnly:
    def test_explicit_office_echoed_and_bounds(self):
        res = f.predict_today("2026-09-01", office_present=300)
        assert res["date"] == "2026-09-01"
        assert res["office_present"] == 300
        assert 0.30 <= res["predicted_ratio"] <= 0.88
        assert res["employees_count"] >= 0
        assert res["recommended_meals"] >= res["employees_count"]
        assert res["confidence_lower"] <= res["employees_count"] <= res["confidence_upper"]
        assert res["confidence_level"] in ("high", "medium", "low")

    def test_ramadan_reduces_ratio(self):
        # 2026-03-05 : jeudi (dow 3 -> base 0.59) en Ramadan -> x0.85
        res = f.predict_today("2026-03-05", office_present=350)
        assert res["predicted_ratio"] == pytest.approx(0.59 * 0.85, abs=1e-6)
        assert "Ramadan" in res["recommendation_note"]

    def test_holiday_halves_ratio(self):
        # Mawlid 2026-08-25 : mardi (dow 1 -> base 0.57) -> x0.50 = 0.285,
        # cependant borné par clip_lo ratio (0.30) appliqué dans le fallback
        # calendaire → 0.30.
        res = f.predict_today("2026-08-25", office_present=350)
        assert res["predicted_ratio"] == pytest.approx(0.30, abs=1e-6)
        assert "Jour ferie" in res["recommendation_note"]

    def test_non_operational_day_note(self):
        # Samedi 2026-09-05 (jour NON travaillé dans le calendrier opérationnel
        # dimanche→jeudi ; vendredi/samedi exclus) → note "Jour non travaillé".
        res = f.predict_today("2026-09-05", office_present=300)
        assert "Jour non travaillé" in res["recommendation_note"]

    def test_operational_day_no_non_working_note(self):
        # Dimanche 2026-09-06 est une journée de service → ne doit PAS être
        # marqué "Jour non travaillé" (seuls vendredi/samedi le sont).
        res = f.predict_today("2026-09-06", office_present=300)
        assert "Jour non travaillé" not in res["recommendation_note"]

    def test_office_dow_fallback_deterministic(self):
        # Bundle de repli : dow_mean_actual {6:310(dim), 0:295(lun), 1:290(mar),
        # 2:300(mer), 3:298(jeu)} — clés date.weekday().
        d = pd.Timestamp("2026-09-01")  # mardi, dow 1
        assert f._office_dow_fallback(d) == pytest.approx(290.0)
        # Jour férié : divisé par deux mais borné par clip_lo (230)
        hol = pd.Timestamp("2026-08-25")  # Mawlid, mardi -> 290 -> 145 -> clip 230
        assert f._office_dow_fallback(hol) == pytest.approx(230.0)

    def test_predict_without_model_uses_dow_fallback(self):
        res = f.predict_today("2026-09-01")  # pas d'office explicite
        assert res["office_present"] == 290  # dow_mean_actual[1] (mardi)
        assert f._predict_office_present(pd.Timestamp("2026-09-01")) == pytest.approx(290.0)


# ── predict_today avec features (chemin live) ──────────────────────

class TestPredictTodayWithFeatures:
    def test_prefers_observed_office_from_features(self, tmp_path):
        _write_features(pd.DataFrame({"Date": ["2026-09-01"],
                                      "office_present": [555],
                                      "office_present_pred": [400]}), tmp_path, "features_live.csv")
        res = f.predict_today("2026-09-01")
        assert res["office_present"] == 555  # observé > prédit

    def test_uses_pred_when_observed_missing(self, tmp_path):
        _write_features(pd.DataFrame({"Date": ["2026-09-01"],
                                      "office_present": [np.nan],
                                      "office_present_pred": [400]}), tmp_path, "features_live.csv")
        res = f.predict_today("2026-09-01")
        assert res["office_present"] == 400
        assert res["predicted_ratio"] == pytest.approx(0.62, abs=1e-6)
        # compte = ratio x office -> offset DOW -> shrinkage -> clip
        dep = f._build_fallback_deployment()
        dow = f._algerian_dow(pd.Timestamp("2026-09-01"))
        raw = 0.62 * 400 + dep["offsets"][dow]
        count = int(round(np.clip(
            dep["lam_opt"] * raw + (1 - dep["lam_opt"]) * dep["dow_mean_actual"][dow],
            dep["clip_lo"], dep["clip_hi"],
        )))
        assert res["employees_count"] == count

    def test_live_wins_over_train_on_duplicate_date(self, tmp_path):
        _write_features(pd.DataFrame({"Date": ["2026-09-01"],
                                      "office_present": [500],
                                      "office_present_pred": [500]}), tmp_path, "features_live.csv")
        _write_features(pd.DataFrame({"Date": ["2026-09-01"],
                                      "office_present": [900],
                                      "office_present_pred": [900]}), tmp_path, "features_train.csv")
        res = f.predict_today("2026-09-01")
        assert res["office_present"] == 500

    def test_history_date_uses_train_office(self, tmp_path):
        _write_features(pd.DataFrame({"Date": ["2024-12-30"],
                                      "office_present": [412],
                                      "office_present_pred": [399]}), tmp_path, "features_train.csv")
        res = f.predict_today("2024-12-30")
        assert res["office_present"] == 412

    def test_office_from_features_row_nan(self):
        row = pd.Series({"office_present": np.nan, "office_present_pred": np.nan})
        assert f._office_from_features_row(row) is None
        row2 = pd.Series({"Date": "2026-09-01", "office_present_pred": 333})
        assert f._office_from_features_row(row2) == pytest.approx(333.0)


# ── Prévisions horizon futur (14 jours) / jours non opérationnels ─
#  Vérifie le comportement API : une date de service FUTURE sans menu planifié
#  produit quand même une prévision réelle du modèle (replis du pipeline), et
#  seuls vendredi/samedi sont marqués indisponibles.

class TestForecastHorizonFutur:
    def test_forecast_for_date_future_without_menu_is_unavailable(self, monkeypatch):
        import api.main as main

        # Isole le module API des fichiers réels : aucun menu planifié.
        monkeypatch.setattr(main, "get_menu", lambda d: None)
        monkeypatch.setattr(main, "_has_menu", lambda d: False)

        # Dimanche 2026-09-20 = semaine suivante, SANS menu → aucune prévision.
        # Le menu est le préalable obligatoire : sans menu, pas de prévision
        # (aucun repli par moyenne historique).
        fc = main._forecast_for_date("2026-09-20")
        assert fc.forecast_available is False
        assert fc.menu_planned is False
        assert "Aucun menu planifié" in (fc.unavailable_reason or "")
        assert fc.employees_count == 0

    def test_forecast_for_date_with_menu_is_available(self, monkeypatch):
        import api.main as main

        # Simule un menu planifié → la prévision devient disponible.
        monkeypatch.setattr(main, "get_menu", lambda d: {"date": d, "plat_principal_1": "Couscous"})
        monkeypatch.setattr(main, "_has_menu", lambda d: True)

        fc = main._forecast_for_date("2026-09-20")
        assert fc.forecast_available is True
        assert fc.menu_planned is True
        assert fc.employees_count > 0
        assert fc.recommended_meals >= fc.employees_count

    def test_forecast_for_date_friday_is_unavailable(self, monkeypatch):
        import api.main as main

        monkeypatch.setattr(main, "get_menu", lambda d: None)
        monkeypatch.setattr(main, "_has_menu", lambda d: False)

        # Vendredi 2026-09-18 : jour non travaillé → indisponible (pas de service).
        fc = main._forecast_for_date("2026-09-18")
        assert fc.forecast_available is False
        assert "Jour non travaillé" in (fc.unavailable_reason or "")


# ── Intégration optionnelle (données réelles du repo) ──────────────

class TestIntegrationRealData:
    @pytest.mark.skipif(
        not (ROOT / "data" / "processed" / "features_live.csv").exists()
        or not (ROOT / "models" / "_deployment.pkl").exists(),
        reason="features_live.csv et/ou _deployment.pkl absents",
    )
    def test_live_date_matches_generated_office(self):
        # Le fixture autouse pointe vers des dossiers vides : on revient aux
        # données réelles du repo pour ce test d'intégration.
        f.MODELS_DIR = ROOT / "models"
        f.DATA_DIR = ROOT / "data" / "processed"
        f._deploy_cache = None
        f._sub_cache = None
        f._features_cache = None
        live = pd.read_csv(ROOT / "data" / "processed" / "features_live.csv",
                           parse_dates=["Date"])
        day = live.iloc[0]
        res = f.predict_today(str(day["Date"].date()))
        assert res["office_present"] == int(round(day["office_present_pred"]))

    @pytest.mark.skipif(
        not (ROOT / "api" / "main.py").exists(),
        reason="api.main indisponible",
    )
    def test_daily_context_merges_menu_and_weather(self):
        # Export CSV de /history : menu réellement planifié + météo live.
        import api.main as main

        rows = main.daily_context()
        by_date = {r["date"]: r for r in rows}
        assert "2026-09-07" in by_date
        # Menu du 07/09 planifié dans planned_menus.csv (source de vérité).
        assert "Tagliatelles" in by_date["2026-09-07"]["menu"]
        # Météo du 07/09 présente dans features_live.csv.
        assert "°C" in by_date["2026-09-07"]["weather"]
        # Une date sans ligne de features renvoie une météo vide, jamais inventée.
        assert any(r["weather"] == "" for r in rows)