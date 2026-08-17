"""
menu_cleaning.py — Normalize, deduplicate, and categorize the free-text
'entrées', 'plat pricipal_1' / 'plat_principal_1', and 'plat principal_2' menu columns.

This module structures unstructured cafeteria menu text into clean, multi-axis
features suitable for Exploratory Data Analysis (EDA), correlation analysis,
and Machine Learning forecasting pipelines.
"""

import re
import unicodedata
from typing import Dict, List, Any, Optional
import pandas as pd

# Optional RapidFuzz import with graceful fallback to standard library difflib
try:
    from rapidfuzz import fuzz, process
    HAS_RAPIDFUZZ = True
except ImportError:
    HAS_RAPIDFUZZ = False
    import difflib


# ---------------------------------------------------------------------------
# 1. TEXT NORMALIZATION & SPLITTING
# ---------------------------------------------------------------------------

def strip_accents(s: Any) -> str:
    """Remove diacritics and accents from a unicode string."""
    return ''.join(c for c in unicodedata.normalize('NFKD', str(s)) if not unicodedata.combining(c))


def normalize_text(s: Any) -> str:
    """Lowercase, strip accents, collapse whitespace/newlines, standardize separators."""
    if s is None or pd.isna(s):
        return ''
    s = str(s).replace('\n', ' ')
    s = strip_accents(s.lower())
    s = re.sub(r'[\'’]', ' ', s)          # apostrophes -> space
    s = re.sub(r'\s+', ' ', s)             # collapse multiple whitespaces
    s = s.strip()
    # Standardize connector variants: "+", "/", "&", "|" all mean "combined with"
    s = re.sub(r'\s*[/&|]\s*', ' + ', s)
    s = re.sub(r'\s*\+\s*', ' + ', s)
    return s


def split_composite(normalized: str) -> List[str]:
    """Split composite entries (e.g. 'plat principal + accompagnement')."""
    if not normalized:
        return []
    return [p.strip() for p in normalized.split('+') if p.strip()]


# ---------------------------------------------------------------------------
# 2. ENTRÉES CATEGORIZATION
# ---------------------------------------------------------------------------

def clean_entrees(raw_value: Any) -> Dict[str, int]:
    """Parse and categorize the free-text 'entrées' column into binary flags and a choice count."""
    norm = normalize_text(raw_value)
    if not norm:
        return {
            'entree_salade': 0,
            'entree_soupe': 0,
            'entree_sale': 0,
            'entree_bourek': 0,
            'n_entree_choices': 0
        }
    has_salade = int(bool(re.search(r'salade', norm)))
    has_soupe = int(bool(re.search(r'soupe|chorba|hrira|lentille', norm)))
    has_sale = int(bool(re.search(r'sale|sales|pizza', norm)))
    has_bourek = int(bool(re.search(r'bourak|bourek|brik', norm)))
    n_choices = has_salade + has_soupe + has_sale + has_bourek
    return {
        'entree_salade': has_salade,
        'entree_soupe': has_soupe,
        'entree_sale': has_sale,
        'entree_bourek': has_bourek,
        'n_entree_choices': max(n_choices, 1)
    }


# ---------------------------------------------------------------------------
# 3. REGEX TAXONOMY FOR ALGERIAN CAFETERIA MENUS
# ---------------------------------------------------------------------------

PROTEIN_PATTERNS = {
    'poulet':       r'poulet|chiken|chicken|volaille|djaj|kfc|chichtaouk|chiche taouk|escalope(?!\s*(?:de\s*boeuf|de\s*veau))|dinde',
    'dinde':        r'dinde',
    'boeuf':        r'\bbouf\b|\bboeuf\b|b(oe|œ)uf|\bviande\b|steak\b|hach|kefta|boulette|bolognaise|parmentier|bourguignon|lham',
    'veau':         r'\bveau\b',
    'poisson':      r'poisson|sole|dorade|sardine|thon|merlu|limo|goujonnette|crevette|calamar|seiche|fruits de mer|colin|saumon|espadon|hout|chien de mer|mernousse',
    'sans_viande':  r'legume|epinard|jben|fromage(?!.*viande)|salade(?!.*poulet)|tortilla|omelette|oeuf|margherita|vegetarien|cr(e|ê)pe',
}

COOKING_PATTERNS = {
    'grille':       r'grill|brochette|chawarma|chichtaouk|chiche taouk',
    'pane_frit':    r'pan(n|e)|goujonnette|frite|escalope|kfc|nugget|cordon bleu',
    'roti':         r'roti|r(o|ô)ti',
    'sauce_mijote': r'sauce|blanquette|chtitha|tadjin|tajine|tajin|moussaka|boulette|chekhchoukha|tchekhchoukha|chekchouka|curry|ragout|rago(u|û)t|saute|saut(e|é)|doulma|mtewem|mtawem|kbab|bourguignon',
    'gratin':       r'gratin|lasagne|cannelloni|parmentier',
    'hache':        r'hach|steak hache|kefta|boulette|bolognaise|parmentier',
}

TRADITIONAL_PATTERNS = (
    r'couscous|tajine|tadjin|tajin|chekhchoukha|tchekhchoukha|chekchouka|doulma|mtawem|mtewem|'
    r'chtitha|rechta|rachta|tlitli|kbab|chichtaouk|chiche taouk|batata fliou|'
    r'kefta|chawarma|dar el kaid|berkoukes|trida|zviti|chorba|harira|brik|bourek|maadnoussia|marhaba'
)

ACCOMPANIMENT_PATTERNS = {
    'riz':          r'\briz\b|pilaf|paella|maklouba',
    'pates':        r'p(a|â)te|spaghetti|lasagne|tagliatelle|macaroni|penne|tagliatelles|vermicelle',
    'pomme_terre':  r'pomme(?!.*purée)|patate|puree|pur(e|é)e|rissole|rissol(e|é)e|croquette|coucha|dauphinoise|boulangere|lyonnaise|espagnole|bordelaise',
    'frite':        r'frite|fritte',
    'legume':       r'legume|ratatouille|epinard|haricot|petit pois|chou|carotte|champignon|artichaut|fondant',
    'sandwich':     r'sandwich|sandwiche|burger|tacos|panini|wrap',
}


def _match_any(text: str, patterns: Dict[str, str]) -> List[str]:
    return [tag for tag, pat in patterns.items() if re.search(pat, text)]


# ---------------------------------------------------------------------------
# 4. SINGLE DISH & DATAFRAME CATEGORIZATION
# ---------------------------------------------------------------------------

def categorize_dish(raw_value: Any) -> Dict[str, Any]:
    """Tag a single raw dish string across independent culinary axes."""
    norm = normalize_text(raw_value)
    if not norm:
        return {
            'normalized': '', 'proteins': [], 'cooking': [], 'accompaniments': [],
            'is_traditional': False, 'is_light': False, 'n_components': 0,
            'protein_unspecified': True,
        }

    proteins = _match_any(norm, PROTEIN_PATTERNS)
    cooking = _match_any(norm, COOKING_PATTERNS)
    accomp = _match_any(norm, ACCOMPANIMENT_PATTERNS)
    is_traditional = bool(re.search(TRADITIONAL_PATTERNS, norm))
    is_light = ('sandwich' in accomp) or bool(re.search(r'sandwich|burger|tacos|panini|wrap|cr(e|ê)pe', norm))
    n_components = len(split_composite(norm))
    protein_unspecified = len(proteins) == 0

    return {
        'normalized': norm,
        'proteins': proteins,
        'cooking': cooking,
        'accompaniments': accomp,
        'is_traditional': is_traditional,
        'is_light': is_light,
        'n_components': n_components,
        'protein_unspecified': protein_unspecified,
    }


def build_category_dataframe(raw_values: Any) -> pd.DataFrame:
    """Apply categorize_dish to a list/Series of raw dish strings, returning a tidy DataFrame."""
    rows = []
    for v in raw_values:
        tags = categorize_dish(v)
        row = {
            'raw': v,
            'normalized': tags['normalized'],
            'is_traditional': int(tags['is_traditional']),
            'is_light': int(tags['is_light']),
            'protein_unspecified': int(tags['protein_unspecified']),
            'n_components': tags['n_components']
        }
        for p in PROTEIN_PATTERNS:
            row[f'protein_{p}'] = int(p in tags['proteins'])
        for c in COOKING_PATTERNS:
            row[f'cooking_{c}'] = int(c in tags['cooking'])
        for a in ACCOMPANIMENT_PATTERNS:
            row[f'accomp_{a}'] = int(a in tags['accompaniments'])
        rows.append(row)
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# 5. FULL DAILY MENU FEATURE EXTRACTION PIPELINE
# ---------------------------------------------------------------------------

def _find_column(df: pd.DataFrame, candidates: List[str]) -> Optional[str]:
    """Robustly find a column in df matching normalized candidate keywords."""
    for col in df.columns:
        norm_col = strip_accents(str(col).lower().replace(' ', '_'))
        for cand in candidates:
            if cand in norm_col:
                return col
    return None


def extract_menu_features(df: pd.DataFrame) -> pd.DataFrame:
    """Extract full structured menu features from a DataFrame containing
    'entrées', 'plat pricipal_1' (or 'plat_principal_1'), and 'plat principal_2'.
    
    Returns a DataFrame with identical index and clean binary/numerical features.
    """
    col1 = _find_column(df, ['plat_pricipal_1', 'plat_principal_1', 'plat1', 'plat_1'])
    col2 = _find_column(df, ['plat_principal_2', 'plat_pricipal_2', 'plat2', 'plat_2'])
    col_entree = _find_column(df, ['entree', 'entrees'])

    feature_rows = []
    for _, row in df.iterrows():
        p1 = normalize_text(row.get(col1, '')) if col1 else ''
        p2 = normalize_text(row.get(col2, '')) if col2 else ''
        entree_dict = clean_entrees(row.get(col_entree, '')) if col_entree else {
            'entree_salade': 0, 'entree_soupe': 0, 'entree_sale': 0, 'entree_bourek': 0, 'n_entree_choices': 0
        }
        
        has_2nd_plat = int(bool(p2 and p2 != 'nan'))
        combined_plats = f"{p1} + {p2}".strip(" +")
        
        is_menu_chef = int(bool(re.search(r'menu chef|plat chef|plat du chef|grillade.*oeuf', combined_plats)))
        is_traditional = int(bool(re.search(TRADITIONAL_PATTERNS, combined_plats)))
        is_light = int(bool(re.search(r'sandwich|sandwiche|burger|tacos|panini|wrap|cr(e|ê)pe', combined_plats)))
        
        proteins = _match_any(combined_plats, PROTEIN_PATTERNS)
        cookings = _match_any(combined_plats, COOKING_PATTERNS)
        accomps = _match_any(combined_plats, ACCOMPANIMENT_PATTERNS)
        
        row_feat = {
            'has_2nd_plat': has_2nd_plat,
            'is_menu_chef': is_menu_chef,
            'menu_is_traditional': is_traditional,
            'menu_is_light': is_light,
            'menu_poulet': int('poulet' in proteins),
            'menu_boeuf': int('boeuf' in proteins),
            'menu_poisson': int('poisson' in proteins),
            'menu_dinde': int('dinde' in proteins),
            'menu_veau': int('veau' in proteins),
            'menu_sans_viande': int('sans_viande' in proteins),
            'menu_grille': int('grille' in cookings),
            'menu_pane_frit': int('pane_frit' in cookings),
            'menu_sauce_mijote': int('sauce_mijote' in cookings),
            'menu_gratin': int('gratin' in cookings),
            'menu_frite': int('frite' in accomps),
            'menu_riz': int('riz' in accomps),
            'menu_pates': int('pates' in accomps),
            'menu_pomme_terre': int('pomme_terre' in accomps),
            'menu_legumes': int('legume' in accomps),
        }
        row_feat.update(entree_dict)
        feature_rows.append(row_feat)
        
    return pd.DataFrame(feature_rows, index=df.index)


# ---------------------------------------------------------------------------
# 6. FUZZY CANONICALIZATION (OPTIONAL / REPORTING ONLY)
# ---------------------------------------------------------------------------

def canonicalize_fuzzy(raw_values: Any, threshold: int = 88) -> Dict[str, str]:
    """Cluster near-duplicate spellings into one canonical name.
    Uses RapidFuzz when available, or difflib fallback."""
    counts = pd.Series(raw_values).value_counts()
    normed = {v: normalize_text(v) for v in counts.index}

    clusters = {}
    canonical_of = {}

    for raw_val in counts.index:
        n = normed[raw_val]
        if not n:
            canonical_of[raw_val] = raw_val
            continue
        
        rep_norm = None
        if clusters:
            if HAS_RAPIDFUZZ:
                match = process.extractOne(
                    n, list(clusters.keys()), scorer=fuzz.token_sort_ratio,
                    score_cutoff=threshold
                )
                if match:
                    rep_norm = match[0]
            else:
                cutoff_ratio = threshold / 100.0
                matches = difflib.get_close_matches(n, list(clusters.keys()), n=1, cutoff=cutoff_ratio)
                if matches:
                    rep_norm = matches[0]

        if rep_norm:
            clusters[rep_norm].append(raw_val)
            canonical_of[raw_val] = clusters[rep_norm][0]
        else:
            clusters[n] = [raw_val]
            canonical_of[raw_val] = raw_val

    return canonical_of