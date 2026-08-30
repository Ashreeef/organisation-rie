"""
Calendrier algérien unifié — jours fériés et Ramadan (source unique de vérité).

Tous les jours fériés sont calculés avec la bibliothèque ``holidays`` (>= 0.99),
qui fournit pour l'Algérie (``holidays.Algeria``) :
  - les jours fixes (01/01, 12/01 Yennayer, 01/05, 05/07, 01/11) ;
  - les fêtes islamiques calculées astronomiquement (Aïd el-Fitr, Aïd el-Adha,
    Mawlid/nouvel an hégirien, Achoura), marquées "(estimated)".

Aucune liste de dates n'est maintenue à la main : on dérive tout du calendrier
de la bibliothèque. Le seul réglage est la *convention Ramadan* :

  - ``features_train.csv`` (notebook 03) utilise une fenêtre
    [Aïd el-Fitr − 30 j, Aïd el-Fitr − 1 j] (« Ramadan de 30 jours se terminant
    la veille de l'Aïd »). On la reconstruit à partir de la date d'Aïd de la
    bibliothèque, ce qui reproduit exactement l'artefact d'entraînement pour
    2022-2024 sans liste manuelle de dates.

Les dates produites par ``holidays.Algeria`` sont identiques à celles du
notebook 03 pour la période d'entraînement (2022-2024) et corrigent les
estimations futures erronées (ex. Mawlid 2026-08-25 et 2027-08-14, pas en
septembre).
"""
from __future__ import annotations

import functools
from typing import Iterable, Tuple, Union

import holidays as hol
import pandas as pd

DateLike = Union[str, pd.Timestamp]
Range = Tuple[pd.Timestamp, pd.Timestamp]

# ---- Repères internes à la bibliothèque (stable pour holidays>=0.99) ---------

_ISLAMIC_LABEL = " (estimated)"
_ISLAMIC_EVENTS = (
    "Eid al-Fitr",
    "Eid al-Adha",
    "Islamic New Year",
    "Ashura",
    "Prophet's Birthday",
)
# Jours fériés nationaux fixes retenus dans l'entraînement (notebook 03) :
_ALGERIAN_FIXED_NAMES = ("Independence Day", "Revolution Day")  # 05/07 et 01/11


def _norm_years(years: Iterable[int]) -> Tuple[int, ...]:
    return tuple(sorted({int(y) for y in years}))


# ---------------------------------------------------------------------------
# Jours feries
# ---------------------------------------------------------------------------

@functools.lru_cache(maxsize=16)
def _algeria_dates_by_name(years: Tuple[int, ...]):
    """Dates du calendrier public algérien, indexées par nom (en_US)."""
    by_name: dict[str, set] = {}
    for y in years:
        dz = hol.Algeria(years=[y], language="en_US")
        for d, name in dz.items():
            by_name.setdefault(name.split(_ISLAMIC_LABEL)[0], set()).add(pd.Timestamp(d))
    return by_name


@functools.lru_cache(maxsize=32)
def _islamic_holiday_dates_cached(years: Tuple[int, ...]) -> frozenset:
    """Premier jour de chaque fête islamique (sémantique du notebook 03)."""
    dates = set()
    for y in years:
        by_name = _algeria_dates_by_name((y,))
        for name in _ISLAMIC_EVENTS:
            if name in by_name:
                dates.add(min(by_name[name]))
    return frozenset(dates)


@functools.lru_cache(maxsize=32)
def _algerian_public_dates_cached(years: Tuple[int, ...]) -> frozenset:
    """Tout le calendrier public algérien (fixes + islamiques, multi-jours inclus)."""
    dates = set()
    for y in years:
        dates.update(pd.Timestamp(d) for d in hol.Algeria(years=[y], language="en_US").keys())
    return frozenset(dates)


@functools.lru_cache(maxsize=32)
def _algerian_national_dates_cached(years: Tuple[int, ...]) -> frozenset:
    """Jours nationaux fixes du notebook 03 : {05/07, 01/11} chaque année."""
    dates = set()
    by_name = _algeria_dates_by_name(years)
    for name in _ALGERIAN_FIXED_NAMES:
        dates.update(by_name.get(name, set()))
    return frozenset(dates)


@functools.lru_cache(maxsize=16)
def _french_holiday_dates_cached(years: Tuple[int, ...]) -> frozenset:
    dates = set()
    for y in years:
        dates.update(pd.Timestamp(d) for d in hol.France(years=[y]).keys())
    return frozenset(dates)


@functools.lru_cache(maxsize=32)
def _eid_al_fitr_cached(years: Tuple[int, ...]) -> dict:
    """Premier jour de l'Aïd el-Fitr par année (de la bibliothèque)."""
    out = {}
    for y in years:
        eid = _algeria_dates_by_name((y,)).get("Eid al-Fitr")
        if eid:
            out[y] = min(eid)
    return out


@functools.lru_cache(maxsize=32)
def _ramadan_ranges_cached(years: Tuple[int, ...]) -> tuple:
    """Fenêtres Ramadan : [Aïd el-Fitr − 30 j, Aïd el-Fitr − 1 j] par année."""
    ranges = []
    for y in years:
        eid = _eid_al_fitr_cached((y,)).get(y)
        if eid is None:
            continue
        ranges.append((eid - pd.Timedelta(days=30), eid - pd.Timedelta(days=1)))
    return tuple(ranges)


# ---------------------------------------------------------------------------
# API publique
# ---------------------------------------------------------------------------

def islamic_holiday_dates(years: Iterable[int]) -> frozenset:
    """Premier jour de chaque fête islamique pour les années données."""
    return _islamic_holiday_dates_cached(_norm_years(years))


def algerian_public_dates(years: Iterable[int]) -> frozenset:
    """Dates du calendrier public algérien (jours fériés officiels)."""
    return _algerian_public_dates_cached(_norm_years(years))


def algerian_national_dates(years: Iterable[int]) -> frozenset:
    """Jours nationaux {indépendance 05/07, révolution 01/11} — drapeau notebook 03."""
    return _algerian_national_dates_cached(_norm_years(years))


def french_holiday_dates(years: Iterable[int]) -> frozenset:
    """Jours fériés français (mêmes dates que ``hol.France`` du notebook 03)."""
    return _french_holiday_dates_cached(_norm_years(years))


def ramadan_ranges(years: Iterable[int]) -> Tuple[Range, ...]:
    """Fenêtres [début, veille de l'Aïd] par année — convention du notebook 03."""
    return _ramadan_ranges_cached(_norm_years(years))


def is_ramadan(date: DateLike) -> bool:
    """Vrai si ``date`` tombe dans une fenêtre Ramadan (convention ci-dessus)."""
    d = pd.Timestamp(date)
    return any(start <= d <= end for start, end in ramadan_ranges([d.year]))


def is_public_holiday(date: DateLike) -> bool:
    """Vrai si ``date`` est un jour férié algérien (fixe ou islamique)."""
    d = pd.Timestamp(date)
    return d in algerian_public_dates([d.year])