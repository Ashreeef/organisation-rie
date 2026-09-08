"""
menu_catalog_py.py — Mappe le texte libre des menus vers le catalogue canonique
(src/menu_optimization/menu_catalog.json) et en dérive des features structurées.

Ce module est la contrepartie Python du catalogue utilisé par le dashboard. Il
garantit que le pipeline d'entraînement (feature_engineering/pipeline.py) et le
pipeline "live" (forecasting/daily_features.py) produisent les MÊMES features,
éliminant ainsi le skew entraînement/serving qui existait entre les taxonomies
`menu_*` (regex, notebook 03) et `kw_*` (inline, daily_features).

Stratégie de mapping :
  1. Candidat canonique donné explicitement (optionnel) -> utilisée en direct.
  2. Alias exacts (normalisés) du catalogue.
  3. Correspondance floue (rapidfuzz si dispo, sinon difflib) sur les noms/alias.
  4. Échec -> features "inconnu" + repli regex (menu_cleaning) pour ne rien perdre.
"""
import json
import re
import unicodedata
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

try:
    from rapidfuzz import fuzz, process
    HAS_RAPIDFUZZ = True
except ImportError:  # pragma: no cover
    HAS_RAPIDFUZZ = False
    import difflib

CATALOG_PATH = Path(__file__).resolve().parent / "menu_catalog.json"

CATEGORY_FEATURES = [
    "menu_cat_volaille_poulet",
    "menu_cat_volaille_dinde",
    "menu_cat_viande_rouge",
    "menu_cat_poisson",
    "menu_cat_traditionnel",
    "menu_cat_pates_grains",
    "menu_cat_street_food",
    "menu_cat_plats_chef",
]
RATIO_BAND_FEATURES = [
    "menu_band_faible",
    "menu_band_moyen",
    "menu_band_eleve",
    "menu_band_tres_eleve",
]
ACC_FEATURES = [
    "acc_riz",
    "acc_pommes_terre",
    "acc_pates",
    "acc_legumes",
    "acc_menu_complet",
]

# Colonnes canoniques stables produites par map_menu_features — utilisées à
# l'entraînement ET au serving de façon identique.
CANONICAL_MENU_FEATURES = CATEGORY_FEATURES + RATIO_BAND_FEATURES + ACC_FEATURES + [
    "menu_is_traditional",
    "menu_is_premium",
    "menu_typical_ratio",
    "menu_mapped",       # 1 si plat_principal_1 mappé au catalogue
    "menu_has_2nd_dish",  # 1 si un plat_principal_2 / accompagnement est fourni
]


def _col_or_zero(df: pd.DataFrame, col: str) -> pd.Series:
    """Retourne une colonne (int) ou une série de zéros si absente — évite de
    dépendre de colonnes calendaires non encore ajoutées par l'appelant."""
    if col in df.columns:
        return df[col].astype(int)
    return pd.Series(0, index=df.index, dtype=int)


def _explicit_ids(df: pd.DataFrame, col: str) -> Optional[dict]:
    """Extrait les IDs canoniques explicites (clé = position de ligne) d'une
    colonne, ou None si la colonne est absente / ne contient aucun ID."""
    if col not in df.columns:
        return None
    out = {}
    for i, v in enumerate(df[col].values):
        if v is not None and not pd.isna(v) and str(v).strip():
            out[i] = str(v).strip()
    return out or None


def _load_catalog() -> dict:
    return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


_CATALOG = None


def get_catalog() -> dict:
    global _CATALOG
    if _CATALOG is None:
        _CATALOG = _load_catalog()
    return _CATALOG


def _normalize(s) -> str:
    """Minuscules, sans accents, espaces réduits (miroir de menu_cleaning).

    Les ligatures françaises (œ → oe, æ → ae) sont décomposées explicitement :
    la normalisation Unicode (NFD/NFKD) les laisse intactes, ce qui ferait
    diverger « bœuf » et « boeuf » (miroir de iconv() côté TS).
    """
    if s is None or pd.isna(s):
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"['’]", " ", s)
    s = s.lower()
    s = s.replace("œ", "oe").replace("æ", "ae")
    s = re.sub(r"\s*[/&|+]\s*", " + ", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


# Tokens autorisés dans le « reste » d'une correspondance préfixe (mirror TS ALLOW)
# Tenir synchronisé avec gen_menu_catalog_ts.py ALLOW_TOKENS.
ALLOW_TOKENS = frozenset({
    "+", "et", "avec", "de", "a", "la", "le", "les", "au", "aux", "du", "des", "en",
    "riz", "pilaf", "basmati", "chairia", "libanais", "oriental", "paella", "creole", "indien", "rouge",
    "pomme", "pommes", "puree", "vapeur", "sautee", "rissolee", "rissolees", "croquette", "croquettes",
    "boulangere", "espagnole", "angroise", "coucha", "hangroise", "dauphine", "bordelaise", "epicee",
    "frite", "frites", "friture", "paille",
    "legumes", "ratatouille", "jardiniere", "haricots", "haricot", "verts", "petits",
    "sauce", "tartare", "mexicaine", "mexicain", "curry", "moutarde", "barbecue", "fromage",
    "piquante", "vierge", "financiere", "creme", "aufour",
    "pates", "tagliatelles", "spaghetti", "risotto",
    "chekchouka", "batata", "fliou", "salade", "sale", "dauphinoises", "gratin", "grillee", "grillees",
    # Élargissement Phase 3 — tokens révélés par la catégorisation des unmatched
    # 2025-data (variantes d'accompagnements). Chacun vérifié EN MOT-ISOLÉ avant ajout :
    # find_dish(token)=None (règle short-search ne les résout PAS → pas un nom de plat).
    # farci/viande : sûrs aussi — aucun alias ne COMMENCE par ces tokens (toujours 2e+) et
    # ils servent de rest légitime (« Escalope à la crème + Pomme farci », « Dolma à la viande »).
    "pate", "chinoise", "cha3ria", "viande", "farci", "flou", "italienne",
    "champignons", "pistou", "panee", "napolitaine", "julienne", "tchekhouka",
    "chakhchouka", "bourghoul", "terre", "florentine", "maison", "provencale",
    "turque", "rotte", "pasta", "tagliatelle", "tourte", "clafoutis", "l",
})


def _score(a_tokens, t_tokens):
    """Scoring miroir TS score(): exact > prefix+allowance > short-search."""
    if not a_tokens or not t_tokens:
        return 0
    if len(a_tokens) == len(t_tokens) and all(x == y for x, y in zip(a_tokens, t_tokens)):
        return 100 + len(a_tokens)
    if (
        len(a_tokens) >= 2
        and len(t_tokens) > len(a_tokens)
        and all(a_tokens[i] == t_tokens[i] for i in range(len(a_tokens)))
        and all(tok in ALLOW_TOKENS for tok in t_tokens[len(a_tokens) :])
    ):
        return len(a_tokens)
    if len(t_tokens) == 1 and len(a_tokens) >= 2 and a_tokens[0] == t_tokens[0]:
        if t_tokens[0] not in ALLOW_TOKENS:
            return 0.5
    return 0


def _split_components(norm: str):
    if not norm:
        return []
    return [p.strip() for p in norm.split("+") if p.strip()]


def _dish_candidates(catalog: dict):
    """Index normalisé nom->dish et alias->dish."""
    norm_index = {}
    for d in catalog["dishes"]:
        norm_index.setdefault(_normalize(d["name"]), []).append(d)
        for a in d["aliases"]:
            norm_index.setdefault(_normalize(a), []).append(d)
    return norm_index


_DISH_INDEX = None
_ACC_INDEX = None


def _get_dish_index(catalog: dict) -> dict:
    global _DISH_INDEX
    if _DISH_INDEX is None:
        _DISH_INDEX = _dish_candidates(catalog)
    return _DISH_INDEX


def _acc_candidates(catalog: dict) -> dict:
    idx = {}
    for a in catalog["accompaniments"]:
        idx.setdefault(_normalize(a["name"]), []).append(a)
        for al in a["aliases"]:
            idx.setdefault(_normalize(al), []).append(a)
    return idx


def _get_acc_index(catalog: dict) -> dict:
    global _ACC_INDEX
    if _ACC_INDEX is None:
        _ACC_INDEX = _acc_candidates(catalog)
    return _ACC_INDEX


def _best_dish_name_for_index(catalog: dict):
    # Liste des noms canoniques + alias distincts pour la recherche floue
    names = set()
    for d in catalog["dishes"]:
        names.add(_normalize(d["name"]))
        for a in d["aliases"]:
            names.add(_normalize(a))
    return sorted(names)


def find_dish(free_text, explicit_id: Optional[str] = None) -> Optional[dict]:
    """Retourne le dish canonique correspondant à ``free_text`` (ou None).

    Logique stricte miroir TS findDishByName : exact > préfixe+allowance > short-search.
    La recherche floue (rapidfuzz/difflib) est volontairement supprimée Phase 3 :
    les textes ambigus deviennent « unmapped » et remontent en Phase 4 comme
    candidats d'alias ou de nouveaux dishes.
    """
    catalog = get_catalog()
    if not free_text or (isinstance(free_text, float) and pd.isna(free_text)):
        return None

    if explicit_id:
        for d in catalog["dishes"]:
            if d["id"] == explicit_id:
                return d

    norm = _normalize(free_text)
    if not norm:
        return None

    tokens = norm.split()
    best = None
    best_score = 0
    for d in catalog["dishes"]:
        cands = [_normalize(d["name"])] + [_normalize(a) for a in d["aliases"]]
        for a in cands:
            s = _score(a.split(), tokens)
            if s > best_score:
                best_score = s
                best = d
    return best


def _fuzzy_search(norm: str, candidates) -> Optional[str]:
    if not norm:
        return None
    if HAS_RAPIDFUZZ:
        match = process.extractOne(norm, candidates, scorer=fuzz.WRatio, score_cutoff=78)
        return match[0] if match else None
    # Fallback difflib
    match = difflib.get_close_matches(norm, candidates, n=1, cutoff=0.72)
    return match[0] if match else None


def find_accompaniment(free_text, explicit_id: Optional[str] = None) -> Optional[dict]:
    """Retourne l'accompagnement canonique correspondant à ``free_text`` (ou None)."""
    catalog = get_catalog()
    if not free_text or pd.isna(free_text):
        return None
    text = str(free_text).strip()
    norm = _normalize(text)

    if explicit_id:
        for a in catalog["accompaniments"]:
            if a["id"] == explicit_id:
                return a

    idx = _get_acc_index(catalog)
    if norm in idx:
        return idx[norm][0]
    for key, accs in idx.items():
        if key and (key in norm or norm in key):
            return accs[0]
    candidates = _best_acc_name_for_index(catalog)
    best = _fuzzy_search(norm, candidates)
    return idx[best][0] if best else None


def _best_acc_name_for_index(catalog: dict):
    names = set()
    for a in catalog["accompaniments"]:
        names.add(_normalize(a["name"]))
        for al in a["aliases"]:
            names.add(_normalize(al))
    return sorted(names)


def _category_features(category_id: str) -> dict:
    return {f"menu_cat_{c}": 0 for c in
            ["volaille_poulet", "volaille_dinde", "viande_rouge", "poisson",
             "traditionnel", "pates_grains", "street_food", "plats_chef"]} | \
        {f"menu_cat_{category_id}": 1} if category_id in [
            "volaille_poulet", "volaille_dinde", "viande_rouge", "poisson",
            "traditionnel", "pates_grains", "street_food", "plats_chef"] else \
        {f"menu_cat_{c}": 0 for c in
         ["volaille_poulet", "volaille_dinde", "viande_rouge", "poisson",
          "traditionnel", "pates_grains", "street_food", "plats_chef"]}


def _ratio_band_features(effect: str) -> dict:
    bands = {"faible": 0, "moyen": 0, "eleve": 0, "tres_eleve": 0}
    if effect in bands:
        bands[effect] = 1
    return {f"menu_band_{b}": v for b, v in bands.items()}


def _bound_ratio(effect: str) -> float:
    # Valeur indicative par bande, utilisée quand typical_ratio absent
    return {"tres_eleve": 0.72, "eleve": 0.66, "moyen": 0.60, "faible": 0.54}.get(
        effect, 0.60
    )


def map_menu_features(
    df: pd.DataFrame,
    p1_explicit=None,
    p2_explicit=None,
) -> pd.DataFrame:
    """
    Dérive les features canoniques du menu pour un DataFrame avec un index
    identique. Colonnes attendues (optionnelles) : plat_principal_1,
    plat_principal_2, entrees.

    ``p1_explicit`` / ``p2_explicit`` : dicts optionnels {index: dish_id}
    permettant d'injecter directement un plat canonique (ex: retour dashboard).
    """
    catalog = get_catalog()

    col1 = df["plat_principal_1"] if "plat_principal_1" in df.columns else pd.Series(index=df.index, dtype=object)
    col2 = df["plat_principal_2"] if "plat_principal_2" in df.columns else pd.Series(index=df.index, dtype=object)

    rows = []
    for i, (p1, p2) in enumerate(zip(col1.values, col2.values)):
        dish = find_dish(p1, p1_explicit.get(i) if p1_explicit else None)
        dish2 = find_dish(p2, p2_explicit.get(i) if p2_explicit else None)
        acc = find_accompaniment(p2, p2_explicit.get(i) if p2_explicit else None)
        candidates = [c for c in [dish, dish2] if c is not None]

        if candidates:
            selected = candidates[0]
            if len(candidates) > 1:
                trad_candidates = [c for c in candidates if c.get("category") == "traditionnel"]
                if trad_candidates:
                    selected = trad_candidates[0]
                elif any(c.get("is_premium") for c in candidates):
                    selected = max(candidates, key=lambda c: (bool(c.get("is_premium")), float(c.get("typical_ratio", 0.0))))
            cat_feats = _category_features(selected["category"])
            band_feats = _ratio_band_features(selected.get("ratio_effect", "moyen"))
            typical = _bound_ratio(selected.get("ratio_effect", "moyen"))
            if selected.get("typical_ratio") is not None:
                typical = float(selected["typical_ratio"])
            traditional = int(any(c.get("is_traditional") for c in candidates))
            premium = int(any(c.get("is_premium") for c in candidates))
            mapped = 1
        else:
            cat_feats = _category_features(None)
            band_feats = _ratio_band_features("moyen")
            typical = 0.60
            traditional = 0
            premium = 0
            mapped = 0

        acc_feats = {f"acc_{a}": 0 for a in ["riz", "pommes_terre", "pates", "legumes", "menu_complet"]}
        has_2nd = 1 if (p2 is not None and str(p2).strip() and str(p2).strip().lower() != "nan") else 0
        if acc is not None:
            acc_feats[f"acc_{acc['category']}"] = 1

        row = {}
        row.update(cat_feats)
        row.update(band_feats)
        row.update(acc_feats)
        row.update({
            "menu_is_traditional": traditional,
            "menu_is_premium": premium,
            "menu_typical_ratio": typical,
            "menu_mapped": mapped,
            "menu_has_2nd_dish": has_2nd,
        })
        rows.append(row)

    return pd.DataFrame(rows, index=df.index)[CANONICAL_MENU_FEATURES]


def build_menu_features(df: pd.DataFrame) -> pd.DataFrame:
    """Fonction partagée menu -> features, utilisée à l'entraînement ET au
    serving de façon identique (elimine le skew entraînement/serving).

    Produit pour un DataFrame avec index identique :
      * les features canoniques du catalogue (menu_cat_*, menu_band_*, acc_*,
        menu_is_*, menu_mapped, menu_has_2nd_dish),
      * le repli regex (extract_menu_features) pour les textes non mappés,
      * les indicateurs dérivés du plat canonique (is_premium_day, is_light_day,
        has_second_dish, premium_x_sun, premium_x_thu, light_x_thu,
        traditional_x_ramadan). Ces derniers supposent les colonnes is_sun,
        is_thu, is_ramadan présentes (ajoutées par l'appelant).
    """
    from src.menu_optimization.menu_cleaning import extract_menu_features  # noqa: E402

    out = df.copy()

    # Repli regex (menu_cleaning) pour ne rien perdre des textes non mappés.
    try:
        regex_feats = extract_menu_features(out)
        out = pd.concat([out, regex_feats], axis=1)
    except Exception:
        pass

    # IDs canoniques éventuellement fournis (retour dashboard) : colonnes
    # plat_principal_1_id / plat_principal_2_id — évitent le mapping flou.
    p1_explicit = _explicit_ids(out, "plat_principal_1_id")
    p2_explicit = _explicit_ids(out, "plat_principal_2_id")

    # Features canoniques du catalogue (autorité).
    out = pd.concat([out, map_menu_features(out, p1_explicit, p2_explicit)], axis=1)

    # Colonnes en double (regex + catalogue produisent tous deux par ex.
    # menu_is_traditional) : on garde la version canonique (dernière).
    if out.columns.duplicated().any():
        out = out.loc[:, ~out.columns.duplicated(keep="last")]

    # Indicateurs dérivés du plat canonique (attributs du catalogue).
    out["is_premium_day"] = out["menu_is_premium"].astype(int)
    out["is_light_day"] = _col_or_zero(out, "menu_cat_street_food")
    out["has_second_dish"] = out["menu_has_2nd_dish"].astype(int)
    out["premium_x_sun"] = out["is_premium_day"] * _col_or_zero(out, "is_sun")
    out["premium_x_thu"] = out["is_premium_day"] * _col_or_zero(out, "is_thu")
    out["light_x_thu"] = out["is_light_day"] * _col_or_zero(out, "is_thu")
    out["traditional_x_ramadan"] = (
        out["menu_is_traditional"].astype(int) * _col_or_zero(out, "is_ramadan")
    )

    return out


def category_id_of(dish_id: str) -> Optional[str]:
    for d in get_catalog()["dishes"]:
        if d["id"] == dish_id:
            return d["category"]
    return None


def dish_by_id(dish_id: str) -> Optional[dict]:
    for d in get_catalog()["dishes"]:
        if d["id"] == dish_id:
            return d
    for a in get_catalog()["accompaniments"]:
        if a["id"] == dish_id:
            return a
    return None


# ---------------------------------------------------------------------------
# Features texte dérivées (TF-IDF/SVD + target encoding) — partagées
# entraînement/serving pour éliminer le skew.
#
# Les plats mappés par build_menu_features produisent des features
# catégorielles canoniques. En PLUS, le modèle consomme des features texte
# latentes (tfidf_svd_*) et des encodages cible (plat1_te, conditions_te).
# Historiquement le serving « refitait » ces transformeurs sur quelques lignes
# live, ce qui dérivait des valeurs d'entraînement. On persiste désormais les
# transformeurs ajustés sur l'entraînement (fit_menu_text_features) et le
# serving les applique tels quels (apply_menu_text_features) : même code,
# mêmes transformeurs, features identiques.
# ---------------------------------------------------------------------------

_TFIDF_PARAMS = {"max_features": 300, "min_df": 2}
_SVD_COMPONENTS = 8


def _clean_combined(s) -> str:
    """Nettoie le texte combiné des deux plats (identique entraînement/serving)."""
    if s is None or (isinstance(s, float) and pd.isna(s)):
        return ""
    s = "".join(c for c in unicodedata.normalize("NFD", str(s))
                if unicodedata.category(c) != "Mn")
    s = re.sub(r"[^a-z0-9 ]", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def _build_menu_combined(df: pd.DataFrame) -> pd.Series:
    return (df["plat_principal_1"].fillna("") + " " +
            df["plat_principal_2"].fillna("")).apply(_clean_combined)


def _fit_target_map(df: pd.DataFrame, col: str, target: str,
                    n_folds: int = 5, smoothing: float = 20.0, seed: int = 42):
    """Encodeur cible type KFold (même logique qu'à l'entraînement).
    Renvoie (map_catégorie -> valeur encodée moyenne OOF, moyenne globale)."""
    from sklearn.model_selection import KFold  # noqa: E402

    global_mean = float(df[target].mean())
    enc = pd.Series(np.nan, index=df.index)
    kf = KFold(n_splits=n_folds, shuffle=True, random_state=seed)
    for tr_idx, va_idx in kf.split(df):
        tr = df.iloc[tr_idx]
        stats_ = tr.groupby(col)[target].agg(["mean", "count"])
        smooth = (stats_["count"] * stats_["mean"] + smoothing * global_mean) / \
                 (stats_["count"] + smoothing)
        enc.iloc[va_idx] = df.iloc[va_idx][col].map(smooth.to_dict())
    cat_map = enc.groupby(df[col]).mean().to_dict()
    return cat_map, global_mean


def fit_menu_text_features(df: pd.DataFrame) -> dict:
    """Ajuste (une seule fois, sur l'entraînement) les transformeurs texte.

    Attendu : df possède plat_principal_1, plat_principal_2, weather_conditions
    et la cible `ratio`. Renvoie un dict persistant (pkl) avec vectorizer, svd
    et les maps de target encoding.
    """
    from sklearn.decomposition import TruncatedSVD  # noqa: E402
    from sklearn.feature_extraction.text import TfidfVectorizer  # noqa: E402

    fitted = {}
    dfx = df.copy()

    # TF-IDF + SVD latents
    menu_combined = _build_menu_combined(dfx)
    menu_texts = menu_combined.replace("", "empty")
    vectorizer = TfidfVectorizer(**_TFIDF_PARAMS)
    tfidf_mat = vectorizer.fit_transform(menu_texts)
    svd = TruncatedSVD(n_components=_SVD_COMPONENTS, random_state=42)
    svd.fit(tfidf_mat)
    fitted["vectorizer"] = vectorizer
    fitted["svd"] = svd

    # Target encoding
    if "ratio" in dfx.columns:
        if "plat_principal_1" in dfx.columns:
            fitted["plat1_map"], fitted["plat1_global"] = _fit_target_map(
                dfx, "plat_principal_1", "ratio")
        if "weather_conditions" in dfx.columns:
            fitted["conditions_map"], fitted["conditions_global"] = _fit_target_map(
                dfx, "weather_conditions", "ratio")

    fitted["tfidf_params"] = _TFIDF_PARAMS
    fitted["svd_components"] = _SVD_COMPONENTS
    return fitted


def apply_menu_text_features(df: pd.DataFrame, fitted: dict) -> pd.DataFrame:
    """Applique les transformeurs pré-ajustés (ex : serving) pour produire
    menu_combined, tfidf_svd_*, plat1_te, conditions_te — sans re-fit.

    Si `fitted` est absent ou incomplet (par ex. bundle serialisé avant l'ajustage
    complet), on refit localement sur les données passées en entrée. Ce repli est
    explicite et sécurise la production, sans réintroduire le skew pendant le
    serving si le bundle est valide.
    """
    out = df.copy()
    menu_combined = _build_menu_combined(out)
    out["menu_combined"] = menu_combined.values

    needs_local_fit = (
        fitted is None or "vectorizer" not in fitted or "svd" not in fitted
        or not hasattr(fitted["vectorizer"], "idf_")
        or not hasattr(fitted["svd"], "components_")
    )

    if needs_local_fit:
        from sklearn.decomposition import TruncatedSVD  # noqa: E402
        from sklearn.feature_extraction.text import TfidfVectorizer  # noqa: E402

        menu_texts = menu_combined.replace("", "empty")
        vectorizer = TfidfVectorizer(**_TFIDF_PARAMS)
        svd = TruncatedSVD(n_components=_SVD_COMPONENTS, random_state=42)
        tfidf_mat = vectorizer.fit_transform(menu_texts)
        tfidf_comps = svd.fit_transform(tfidf_mat)
        for i in range(_SVD_COMPONENTS):
            out[f"tfidf_svd_{i}"] = tfidf_comps[:, i]

        if fitted is not None and fitted.get("plat1_map") and "plat_principal_1" in out.columns:
            out["plat1_te"] = out["plat_principal_1"].map(
                fitted["plat1_map"]).fillna(fitted.get("plat1_global", 0.0))
        elif "plat1_te" in out.columns:
            out["plat1_te"] = out["plat1_te"].fillna(0.0)

        if fitted is not None and fitted.get("conditions_map") and "weather_conditions" in out.columns:
            out["conditions_te"] = out["weather_conditions"].map(
                fitted["conditions_map"]).fillna(fitted.get("conditions_global", 0.0))
        elif "conditions_te" in out.columns:
            out["conditions_te"] = out["conditions_te"].fillna(0.0)

        return out

    # Transform (pas de re-fit) avec le bundle validé.
    tfidf_mat = fitted["vectorizer"].transform(menu_combined.replace("", "empty"))
    tfidf_comps = fitted["svd"].transform(tfidf_mat)
    for i in range(_SVD_COMPONENTS):
        out[f"tfidf_svd_{i}"] = tfidf_comps[:, i]

    if fitted.get("plat1_map") and "plat_principal_1" in out.columns:
        out["plat1_te"] = out["plat_principal_1"].map(
            fitted["plat1_map"]).fillna(fitted.get("plat1_global", 0.0))
    elif "plat1_te" in out.columns:
        out["plat1_te"] = out["plat1_te"].fillna(0.0)

    if fitted.get("conditions_map") and "weather_conditions" in out.columns:
        out["conditions_te"] = out["weather_conditions"].map(
            fitted["conditions_map"]).fillna(fitted.get("conditions_global", 0.0))
    elif "conditions_te" in out.columns:
        out["conditions_te"] = out["conditions_te"].fillna(0.0)

    return out
