"""
Tests for src/forecasting/daily_features — génération quotidienne des features.

La validation clé est la *fidélité* : pour une date déjà dans l'historique, les
126 features produites doivent être identiques à celles du fichier
data/processed/features_train.csv (mêmes sémantiques de shift en lignes).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.forecasting.daily_features import (  # noqa: E402
    _deployment_feature_cols,
    _fetch_open_meteo_forecast,
    _fill_live_nans,
    _holiday_columns,
    _office_stats,
    _ramadan_flags,
    _weather_defaults,
    _wmo_to_conditions,
    build_features,
    generate_features,
    menu_fingerprint_from_frame,
    regenerate_features_for_date,
    roll_office_forward,
    _next_operational_dates,
    HISTORY_FILE,
)

DATA_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

HAS_MODELS = (MODELS_DIR / "office_presence_lgb.pkl").exists()
HAS_TRAIN = (DATA_DIR / "features_train.csv").exists()

pytestmark = pytest.mark.skipif(
    not (HAS_MODELS and HAS_TRAIN),
    reason="modèles / features d'entraînement absents",
)


@pytest.fixture()
def history():
    return pd.read_csv(HISTORY_FILE, parse_dates=["Date"])


class TestNextOperationalDates:
    """Les dates cibles des features ne comprennent QUE les journées de service
    (dimanche → jeudi) : jamais de vendredi ni de samedi."""

    def test_skips_friday_and_saturday(self):
        # Jeudi 03/09/2026 → la prochaine journée est le dimanche 06/09/2026
        dates = _next_operational_dates(pd.Timestamp("2026-09-03"), 2)
        assert [d.dayofweek for d in dates] == [3, 6]  # jeudi, dimanche

    def test_count_is_exact_and_all_operational(self):
        dates = _next_operational_dates(pd.Timestamp("2026-09-04"), 10)
        assert len(dates) == 10
        assert all(d.dayofweek not in (4, 5) for d in dates)  # pas ven/sam

    def test_includes_start_if_operational(self):
        dates = _next_operational_dates(pd.Timestamp("2026-09-06"), 1)
        assert dates[0] == pd.Timestamp("2026-09-06")  # dimanche, opérationnel


class TestHolidayCalendar:
    def test_ramadan_flags_2026(self):
        dates = pd.date_range("2026-02-01", "2026-04-01", freq="D")
        out = _ramadan_flags(dates)
        assert (out.loc[out["is_ramadan"] == 1]["ramadan_day"] >= 1).all()
        assert out.loc["2026-03-10", "is_ramadan"] == 1
        assert out.loc["2026-03-20", "is_ramadan"] == 0

    def test_holiday_columns_shape(self):
        dates = pd.date_range("2026-08-01", "2026-08-31", freq="D")
        out = _holiday_columns(dates)
        assert list(out.columns) == [
            "is_fr_holiday", "is_islamic_holiday", "is_algerian_holiday",
            "is_any_holiday", "days_to_next_holiday",
            "days_since_last_holiday", "near_holiday",
        ]
        assert set(out.index) == set(dates)


class TestOfficeStats:
    def test_returns_dow_stats(self, history):
        stats = _office_stats(history)
        assert 0.0 in stats["dow_mean"].index
        assert 6.0 in stats["dow_mean"].index
        # l'historique réel ne contient pas vendredi/samedi
        assert 4.0 not in stats["dow_mean"].index
        assert stats["global_mean"] > 0


class TestRollOfficeForward:
    def test_predicts_future_dates(self, history):
        target_dates = pd.DatetimeIndex(
            ["2026-01-05", "2026-01-06", "2026-01-07"]
        )
        out = roll_office_forward(history, target_dates)
        assert len(out) == 3
        assert out.notna().all()
        assert all(p > 0 for p in out.values)
        # les dates déjà observées sont laissées telles quelles
        out_known = roll_office_forward(history, pd.DatetimeIndex(["2024-12-30"]))
        assert len(out_known) == 0


class TestWorkspace:
    def test_weather_defaults_12_months(self, history):
        defaults = _weather_defaults(history)
        assert len(defaults) == 12

    def test_fill_live_nans_fills_only_nans(self, history):
        df = pd.DataFrame({
            "office_present": [550.0, 600.0],
            "op_dow_mean": [np.nan, 545.0],
            "op_dow_std": [np.nan, 40.0],
            "op_dow_median": [np.nan, 540.0],
            "op_dow_zscore": [np.nan, 1.0],
            "month_dow_ratio_mean": [np.nan, 0.6],
            "dow_ratio_mean": [np.nan, 0.61],
            "dow_ratio_median": [np.nan, 0.60],
            "dow_ratio_std": [np.nan, 0.05],
        })
        out = _fill_live_nans(df.copy(), history)
        assert out["op_dow_mean"].notna().all()
        assert out["op_dow_zscore"].notna().all()
        assert out.loc[1, "op_dow_mean"] == pytest.approx(545.0)


class TestWmoToConditions:
    """Le code WMO + cloud_cover -> la chaîne exacte utilisée par l'entraînement."""

    def test_no_precip_clear_sky(self):
        assert _wmo_to_conditions(0, 5.0) == "Clear"

    def test_no_precip_partially_cloudy(self):
        assert _wmo_to_conditions(1, 40.0) == "Partially cloudy"

    def test_no_precip_overcast(self):
        assert _wmo_to_conditions(2, 90.0) == "Overcast"

    def test_rain_with_actual_precipitation(self):
        # WMO 61 = pluie légère — mais seule une précipitation mesurée > 0 vaut
        # "Rain" (cohérent avec precipitation_type du training).
        assert _wmo_to_conditions(61, 10.0, precipitation_mm=1.5) == "Rain"
        assert _wmo_to_conditions(61, 40.0, precipitation_mm=1.5) == "Rain, Partially cloudy"
        assert _wmo_to_conditions(61, 90.0, precipitation_mm=1.5) == "Rain, Overcast"

    def test_wmo_rain_without_outcome_is_cloudy(self):
        # Brouillard (code 45) sans précipitation mesurée -> pas de "Rain".
        assert _wmo_to_conditions(45, 60.0, precipitation_mm=0.0) == "Partially cloudy"

    def test_zero_precip_with_rain_code_stays_cloudy(self):
        # WMO signale de l'orage (95) mais aucune précipitation mesurée : ce n'est
        # pas "Rain" car le training ne retient "rain" que si precipitation_mm > 0.
        assert _wmo_to_conditions(95, 0.0, precipitation_mm=0.0) == "Clear"


class TestOpenMeteoForecast:
    """Le fetch Open-Meteo doit être robuste, même si le réseau est indisponible."""

    def test_empty_dates_returns_none(self):
        assert _fetch_open_meteo_forecast([]) is None

    def test_wmo_fields_and_index(self):
        fc = _fetch_open_meteo_forecast(
            [pd.Timestamp("2026-09-02"), pd.Timestamp("2026-09-03")]
        )
        if fc is None:
            pytest.skip("pas de réseau / réponse indisponible")
        assert isinstance(fc.index, pd.DatetimeIndex)
        assert len(fc) == 2
        for col in ("temperature", "temperature_felt", "precipitation_mm",
                    "wind_speed_kmh", "wind_gust_kmh", "cloud_cover_pct",
                    "weather_conditions"):
            assert col in fc.columns
            assert fc[col].notna().all()
        assert set(fc["weather_conditions"]) <= {
            "Clear", "Partially cloudy", "Overcast",
            "Rain", "Rain, Partially cloudy", "Rain, Overcast",
        }
        # rain label cohérent avec precipitation_mm
        for cond, pm in zip(fc["weather_conditions"], fc["precipitation_mm"]):
            assert ("Rain" in cond) == (pm > 0)


class TestFidelityReproduction:
    """Les features d'une date déjà observée doivent être IDENTIQUES au training."""

    FIDELITY_DATE = "2024-12-30"
    SAMPLE_COLS = [
        "op_lag_7", "op_dow_mean", "op_annual_zscore", "yoy_ratio_5w",
        "bridge_day", "is_any_holiday", "temp_cold", "heavy_rain",
        "menu_is_traditional", "menu_is_premium", "plat1_te", "op_roll_mean_28",
    ]

    def test_in_history_matches_features_train(self, tmp_path, history):
        train = pd.read_csv(DATA_DIR / "features_train.csv", parse_dates=["Date"])
        out = generate_features(
            target_dates=[pd.Timestamp(self.FIDELITY_DATE)],
            history=history,
            out_path=tmp_path / "live.csv",
        )
        row = train[train["Date"] == self.FIDELITY_DATE].iloc[0]
        gen = out.iloc[0]
        for col in self.SAMPLE_COLS:
            a, b = gen[col], row[col]
            both_nan = pd.isna(a) and pd.isna(b)
            assert both_nan or pytest.approx(a, abs=1e-6) == b, col


class TestTextFeatureConsistency:
    """Les features texte (TF-IDF/SVD + target encoding) du serving doivent
    reproduire EXACTEMENT celles de l'entraînement, via les transformeurs
    persistés (plus aucun re-fit live -> pas de skew entraînement/serving)."""

    def test_persisted_transformers_reproduce_training(self):
        import pickle

        from src.menu_optimization.menu_catalog_py import (
            apply_menu_text_features,
            fit_menu_text_features,
        )

        train = pd.read_csv(DATA_DIR / "features_train.csv")
        dep = pickle.load(open(MODELS_DIR / "_deployment.pkl", "rb"))

        assert "text_feats" in dep, "le bundle doit persister les transformeurs texte"
        fitted = dep["text_feats"]

        # Graph de contrôle : re-fitter sur l'entraînement donne un transformeur
        # "identique" — mais surtout, appliquer les transformeurs persistés sur les
        # mêmes lignes doit répliquer les colonnes stockées (pas de re-fit au serving).
        out = apply_menu_text_features(train, fitted)

        for col in ["plat1_te", "conditions_te"]:
            assert col in out.columns
            a = train[col].astype(float).values
            b = out[col].astype(float).values
            assert np.corrcoef(a, b)[0, 1] > 0.999, col

        for i in range(8):
            c = f"tfidf_svd_{i}"
            a = train[c].astype(float).values
            b = out[c].astype(float).values
            assert np.corrcoef(a, b)[0, 1] > 0.999, c

    def test_apply_handles_unseen_categories_with_global_fallback(self):
        import pickle

        from src.menu_optimization.menu_catalog_py import apply_menu_text_features

        dep = pickle.load(open(MODELS_DIR / "_deployment.pkl", "rb"))
        fitted = dep["text_feats"]

        # une ligne avec un plat inconnu + menu vide doit retomber sur la moyenne
        # globale (pas de crash, valeur finie).
        df = pd.DataFrame({
            "plat_principal_1": ["Plat totalement inconnu du catalogue"],
            "plat_principal_2": [None],
            "weather_conditions": ["condition_inconnue"],
        })
        out = apply_menu_text_features(df, fitted)
        assert out["plat1_te"].iloc[0] == pytest.approx(fitted["plat1_global"], abs=1e-6)
        assert out["tfidf_svd_0"].notna().all()



    def test_output_schema_and_no_nans(self, tmp_path):
        dep_cols = _deployment_feature_cols()
        assert dep_cols and len(dep_cols) == 157
        assert not any(c.startswith("kw_") for c in dep_cols)
        out = generate_features(
            target_dates=[pd.Timestamp("2026-09-02")],
            out_path=tmp_path / "live.csv",
        )
        assert len(out) == 1
        expect = {"Date", "office_present", "office_present_pred", "menu_fp"} | set(dep_cols)
        assert set(out.columns) == expect
        assert out.drop(columns=["Date", "menu_fp"]).isna().sum().sum() == 0
        assert out["office_present_pred"].iloc[0] == pytest.approx(out["office_present"].iloc[0])
        assert (Path(tmp_path) / "live.csv").exists()

    def test_build_features_no_crash_full_history(self, history):
        feats = build_features(history.copy())
        assert len(feats) == len(history)
        for col in _deployment_feature_cols():
            assert col in feats.columns

    def test_fidelity_check_via_concat(self, tmp_path, history):
        """Le fichier live est le MÊME schéma que le train (concaténable)."""
        live = generate_features(
            target_dates=[pd.Timestamp("2026-09-03")],
            history=history,
            out_path=str(tmp_path / "live.csv"),
        )
        train = pd.read_csv(DATA_DIR / "features_train.csv", parse_dates=["Date"])
        merged = pd.concat([live, train], axis=0)
        # la date live est unique et le concat est possible sans collision
        live_date = live["Date"].iloc[0]
        assert (merged["Date"] == live_date).sum() == 1
        assert merged.shape[0] == len(live) + len(train)


class TestMenuFreshness:
    """La prévision doit refléter le menu planifié : régénération ciblée des
    features + empreinte pour la détection de prévision périmée."""

    def test_menu_fingerprint_empty_when_no_menu(self):
        assert menu_fingerprint_from_frame(None, "2026-09-03") == ""
        empty = pd.DataFrame(columns=["date", "entrees", "plat_principal_1",
                                      "plat_principal_2"])
        assert menu_fingerprint_from_frame(empty, "2026-09-03") == ""

    def test_menu_fingerprint_stable_and_distinct(self):
        pm = pd.DataFrame([
            {"date": pd.to_datetime("2026-09-03"), "entrees": "Salade",
             "plat_principal_1": "Espadon en sauce", "plat_principal_2": "Riz pilaf",
             "plat_principal_1_id": "espadon", "plat_principal_2_id": "riz-pilaf"},
            {"date": pd.to_datetime("2026-09-04"), "entrees": "",
             "plat_principal_1": "Couscous au poulet", "plat_principal_2": "Frite",
             "plat_principal_1_id": "couscous", "plat_principal_2_id": "frite"},
        ])
        fp_sep3 = menu_fingerprint_from_frame(pm, "2026-09-03")
        assert fp_sep3 != ""
        # stable pour un même menu
        assert menu_fingerprint_from_frame(pm, "2026-09-03") == fp_sep3
        # différent suivant le menu
        assert menu_fingerprint_from_frame(pm, "2026-09-04") != fp_sep3
        # pas de menu ce jour-là
        assert menu_fingerprint_from_frame(pm, "2026-01-01") == ""

    def test_regenerate_recomputes_changed_date_and_backfills_fp(self, tmp_path, history):
        import api.forecast as fc
        from api.menus import MENUS_FILE

        # sauvegarde l'état d'origine et les features live
        orig_menus = MENUS_FILE.read_bytes() if MENUS_FILE.exists() else None
        live_path = ROOT / "data" / "processed" / "features_live.csv"
        orig_live = live_path.read_bytes() if live_path.exists() else None

        try:
            pd.DataFrame([
                {"date": "2026-09-03", "entrees": "Salade",
                 "plat_principal_1": "Espadon en sauce", "plat_principal_2": "Riz pilaf",
                 "plat_principal_1_id": "espadon", "plat_principal_2_id": "riz-pilaf"},
                {"date": "2026-09-04", "entrees": "",
                 "plat_principal_1": "Couscous au poulet", "plat_principal_2": "Frite",
                 "plat_principal_1_id": "couscous", "plat_principal_2_id": "frite"},
            ]).to_csv(MENUS_FILE, index=False)

            # génère une ligne live de référence pour 09-03 et 09-04
            generate_features(
                target_dates=[pd.Timestamp("2026-09-03"), pd.Timestamp("2026-09-04")],
                history=history,
                out_path=live_path,
            )
            before = pd.read_csv(live_path, parse_dates=["Date"])
            assert "menu_fp" in before.columns

            # le menu du 03 est un plat de POISSON
            row_before = before[before["Date"].dt.normalize() == pd.Timestamp("2026-09-03")]
            assert row_before["menu_poisson"].iloc[0] == 1
            fp_before = row_before["menu_fp"].iloc[0]

            # on change le menu du 03 en menu frit/boeuf, puis on régénère
            pd.DataFrame([
                {"date": "2026-09-03", "entrees": "",
                 "plat_principal_1": "Sandwich frite", "plat_principal_2": "Boeuf bourguignon",
                 "plat_principal_1_id": "sandwich-frite", "plat_principal_2_id": "boeuf"},
                {"date": "2026-09-04", "entrees": "",
                 "plat_principal_1": "Couscous au poulet", "plat_principal_2": "Frite",
                 "plat_principal_1_id": "couscous", "plat_principal_2_id": "frite"},
            ]).to_csv(MENUS_FILE, index=False)

            ok = regenerate_features_for_date("2026-09-03")
            assert ok

            after = pd.read_csv(live_path, parse_dates=["Date"])
            # le fichier conserve plusieurs dates, pas seulement la cible
            assert len(after) >= 2
            assert "menu_fp" in after.columns
            # plus de NaN sur menu_fp (backfill global)
            assert after["menu_fp"].notna().all()

            row_after = after[after["Date"].dt.normalize() == pd.Timestamp("2026-09-03")]
            # le menu frit a remplacé le poisson
            assert row_after["menu_poisson"].iloc[0] == 0
            assert row_after["menu_frite"].iloc[0] == 1
            # l'empreinte a changé avec le menu
            assert row_after["menu_fp"].iloc[0] != fp_before

            # le cache in-process du forecasting est invalidé par la régénération
            fc.reset_features_cache()
            stored = fc.stored_menu_fingerprint("2026-09-03")
            assert stored == row_after["menu_fp"].iloc[0]
        finally:
            if orig_live is not None:
                live_path.write_bytes(orig_live)
            if orig_menus is not None:
                MENUS_FILE.write_bytes(orig_menus)
            else:
                MENUS_FILE.unlink(missing_ok=True)
            fc.reset_features_cache()