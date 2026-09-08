"""Tests de la logique de matching find_dish/findDishByName (Phase 3 – règles strictes).

Couvre :
  1. Cas « probes » Phase 1 (11 faux positifs identifiés).
  2. Cas mesurés Phase 2 (contamination, « OU », rows non mappées).
  3. Parité ALLOW_TOKENS Python ↔ menu-catalog.ts.
"""
import json
import re
from pathlib import Path

import pytest

from src.menu_optimization.menu_catalog_py import ALLOW_TOKENS, find_dish

TS_PATH = Path(__file__).resolve().parent.parent / "dashboard" / "lib" / "menu-catalog.ts"

# ───────── helpers ──────────────────────────────────────────────────────────
def _id(text):
    dish = find_dish(text)
    return dish["id"] if dish else None


# ───────── parité ALLOW ─────────────────────────────────────────────────────
class TestAllowSync:
    def test_allow_tokens_vs_ts(self):
        ts = TS_PATH.read_text(encoding="utf-8")
        m = re.search(r'const ALLOW = new Set\((\[.*?\])\)', ts, re.DOTALL)
        assert m, "ALLOW introuvable dans menu-catalog.ts"
        ts_allow = set(json.loads(m.group(1)))
        assert ALLOW_TOKENS == ts_allow, (
            f"Désynchronisation ALLOW : +{ts_allow - ALLOW_TOKENS} "
            f"-{ALLOW_TOKENS - ts_allow}"
        )


# ───────── probes Phase 1 : les 11 faux positifs doivent être killés ────────
@pytest.mark.parametrize(
    "input_text, expected_id",
    [
        # --- 11 faux positifs identifiés en Phase 1 ---
        ("sole",                                  "sole-farcie"),      # token0 prefix → sole-farcie (premier dish « sole »)
        ("escalope",                              "escalope-grille"),   # token0 prefix → escalope-grille (premier dish « escalope »)
        ("riz",                                   None),               # ALLOW → weak bloqué → None
        ("pomme",                                 None),               # ALLOW → weak bloqué → None
        ("pates",                                 None),               # ALLOW → weak bloqué → None
        ("pate",                                  None),               # idem
        ("creme",                                 None),               # ALLOW → weak bloqué → None
        ("boeuf",                                 "navarin-boeuf"),    # alias « Boeuf Navarin » token0 → weak → navarin
        ("veaux",                                 None),               # aucun alias / dish
        ("brochette",                             "brochette-royale"), # alias Brochette Royale token0 → weak → brochette-royale
        # --- cas de Phase 1 qui restaient identiques ---
        ("sole farci et pates coudes",            None),              # alias inexistante (l'alias catalogue est « Sole Farci + Légumes… »)
        ("poulet roti basquaise",                 None),               # alias « Poulet rôti » + basquaise non ALLOW → None
    ],
)
def test_kill_phase1_false_positives(input_text, expected_id):
    assert _id(input_text) == expected_id


# ───────── cas exacts / légitimes (doivent toujours matcher) ─────────────────
@pytest.mark.parametrize(
    "input_text, expected_id",
    [
        ("poulet roti",                          "poulet-roti"),
        ("escalope grillee",                     "escalope-grille"),
        ("saut\u00e9 de b\u0153uf",             "saute-boeuf"),   # ligature
        ("Saut\u00e9 de boeuf",                  "saute-boeuf"),   # ASCII
        ("navarin de b\u0153uf",                 "navarin-boeuf"),
        ("Navarin de boeuf",                     "navarin-boeuf"),
        # collision (Phase 1) : la galette doit aller vers dinde-hachee-gratinee
        ("galette de dinde gratinee au fromage", "dinde-hachee-gratinee"),
        ("Galette de dinde gratin\u00e9e au fromage",
                                                 "dinde-hachee-gratinee"),
        ("kbab",                                 "kbab-poulet"),
        ("rechta",                               "rechta-poulet"),
        ("dolma",                                "doulma"),
        # alias exacte : « Chawarma » (pas « chawarma » brut)
        ("Chawarma",                             "chawarma"),
        ("chawarma",                             "chawarma"),
        ("tacos",                                "tacos"),
        ("couscous",                             "couscous-poulet"),
    ],
)
def test_exact_matches(input_text, expected_id):
    assert _id(input_text) == expected_id


# ───────── règles de préfixe + allowance (Phase 2 rows) ─────────────────────
@pytest.mark.parametrize(
    "input_text, expected_id",
    [
        # « Roulé de viande +Riz » → name exact « Roulé de viande » + leftover riz ∈ ALLOW
        ("Roul\u00e9 de viande +Riz",            "rouleau-viande"),
        # « Rôti d'Bœuf + Pomme Rissolée » → apostrophe nettoyée, « roti d boeuf »
        # alias « R\u00f4ti de b\u0153uf » [roti,de,boeuf] ≠ [roti,d,boeuf] → None
        ("R\u00f4ti d'B\u0153uf + Pomme Rissol\u00e9e",
                                                 None),
        # Escalope grillée + P\u00e2tes \u00e0 la cr\u00e8me : alias exact existe
        ("Escalope grill\u00e9e + P\u00e2tes \u00e0 la cr\u00e8me",
                                                 "escalope-grille"),
        # Escalope pan\u00e9e + Pomme espagnole : alias exacte (token-equality)
        ("Escalope pan\u00e9e + Pomme espagnole", "escalope-panee"),
        # Escalope pan\u00e9 + Riz libanais : alias « Escalope pan\u00e9e » ≠ prefix → None
        ("Escalope pan\u00e9 + Riz libanais",    None),
    ],
)
def test_prefix_and_allowance(input_text, expected_id):
    assert _id(input_text) == expected_id


# ───────── Phase 5 : « OU » ne doit pas être autorisé dans les leftovers ───
@pytest.mark.parametrize(
    "input_text",
    [
        "Merlan frit + Riz OU Kbab",
        "Sole Farci et P\u00e2tes Coudes OU Moussaka",
        # cas réels 2025-data (Phase 2) ajoutés à la demande de validation
        "Pomme de terre OU Riz",
        "Poulet \u00e0 la Mexicaine OU Rechta",
    ],
)
def test_ou_combos_unmapped(input_text):
    assert _id(input_text) is None


# ───────── split « + » : les alias combos legit contenant « + » doivent
# ───────── matcher ENTIERS (égalité de tokens, std 100+len) — pas via un token isolé
@pytest.mark.parametrize(
    "input_text, expected_id",
    [
        ("Cuisse de poulet grill\u00e9e + Pomme croquette sauce mexicaine",
                                                 "cuisse-poulet-grille"),
        ("Escalope grill\u00e9e + Gratin dauphinois",
                                                 "escalope-grille"),
        ("Escalope pan\u00e9e + Riz oriental",   "escalope-panee"),
        ("Steak Haché de Dinde + Riz aux petits l\u00e9gumes",
                                                 "steak-hache-dinde"),
    ],
)
def test_split_plus_alias_combos_stay_whole(input_text, expected_id):
    assert _id(input_text) == expected_id


# ───────── tajine-zaligou : ancien first-match-wins volait la ligne ────────
def test_tajine_zaligou_exact():
    """Row « Tajine zaligou » devait mapper tajine-zaligou (exact name)."""
    assert _id("Tajine zaligou") == "tajine-zaligou"


# ───────── slash et séparateurs ─────────────────────────────────────────────
@pytest.mark.parametrize(
    "input_text, expected_id",
    [
        ("Poulet r\u00f4ti / Chekchouka",         "poulet-roti"),
        ("Escalope en sauce + Pomme saut\u00e9e + L\u00e9gumes",
                                                 "escalope-creme"),
    ],
)
def test_separators(input_text, expected_id):
    assert _id(input_text) == expected_id


# ───────── choices assumés (short-search / mots isolés) ─────────────────────
# Ces mots isolés résolvent par « short-search » (token0 == un seul mot), qui
# choisit le PREMIER dish par ordre du tableau correspondant, sans préférence
# sémantique. C'est un choix ASSUMÉ (Phase 3) et documenté ici exprès :
#
#   - Ce ne sont plus des faux positifs CROSS-CATÉGORIE (Phase 1 : « sole »
#     pointait vers un plat de poulet). Aujourd'hui ils pointent vers le bon type
#     de protéine : « sole » → un plat de SOLE, « escalope » → un plat d'escalope.
#   - Vérification CSV (Phase 3) : ces mots isolés existent vraiment dans
#     l'historique (real.csv) — « Escalope », « Sandwich », « Doulma »,
#     « Moussaka », « Couscous », « Kbab », « Tacos », « Chawarma »,
#     « Chichtaouk », « Goujonnette », « Lasagne », « Maadnoussia », « Mtawem ».
#     La majorité sont des noms propres de plats (univ, sans ambiguïté). Les
#     seules ambiguïtés intra-catégorie réelles sont « Escalope » → escalope-grille
#     (1 ligne / 666) et « Chichtaouk » → 1 seul dish. Aucun mot isolé historique
#     n'est CROSS-catégorie.
#   - Le risque résiduel (mauvais plat d'escalope/sole choisi « par ordre du
#     tableau ») se réduira mécaniquement en Phase 4 : la saisie libre du planner
#     sera fermée, donc ce chemin ne concernera plus que la réinterprétation de
#     texte historique, pas la saisie future.
#
# Si tu modifies ces attentes, c'est donc un changement de politique, pas un bug.
@pytest.mark.parametrize(
    "input_text, expected_id",
    [
        ("sole",        "sole-farcie"),        # premier dish de type « sole »
        ("escalope",    "escalope-grille"),     # 1re escalope (ordre catalogue)
        ("dinde",       "dinde-hachee-gratinee"),
        ("brochette",   "brochette-royale"),
        ("chawarma",    "chawarma"),
        # mots isolés À ALLOW → None (pas de dish ; blocage voulu)
        ("riz",         None),
        ("pomme",       None),
        ("pates",       None),
        ("pate",        None),
        ("creme",       None),
        ("sauce",       None),
        ("veau",        None),
        ("fromage",     None),
        ("salade",      None),   # ancien faux négatif → reste None
        ("briket",      None),   # idem
    ],
)
def test_shortsearch_policy(input_text, expected_id):
    assert _id(input_text) == expected_id
