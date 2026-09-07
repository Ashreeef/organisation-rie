"""
Calendrier opérationnel RIE — source unique de vérité (jours travaillés).

La restauration fonctionne de **dimanche à jeudi**. Vendredi et samedi sont
des jours **non travaillés** : la « prochaine journée de service » après un
jeudi est donc le dimanche suivant (et jamais vendredi/samedi).

Convention de jours (``date.weekday()`` de Python) :
    Lundi=0, Mardi=1, Mercredi=2, Jeudi=3, Vendredi=4, Samedi=5, Dimanche=6

Jours opérationnels (travaillés) : Dimanche(6), Lundi(0), Mardi(1), Mercredi(2), Jeudi(3).
Jours non opérationnels (fermés) : Vendredi(4), Samedi(5).

Toute l'application (API backend, prévisions, planification) doit utiliser ce
module — et non un ``date + 1 jour`` codé en dur — pour dériver la prochaine
journée de service.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Iterable, Tuple, Union

# Python weekday (date.weekday()) : 0=Lundi ... 6=Dimanche
OPERATIONAL_DOWS = {0, 1, 2, 3, 6}      # Dimanche -> Jeudi
NON_OPERATIONAL_DOWS = {4, 5}           # Vendredi, Samedi

# Libellés des jours (FR) indexés par weekday Python, pour l'affichage UI.
DOW_LABELS = {
    0: "Lundi",
    1: "Mardi",
    2: "Mercredi",
    3: "Jeudi",
    4: "Vendredi",
    5: "Samedi",
    6: "Dimanche",
}


def is_operational_day(day: Union[date, str, "pd.Timestamp"]) -> bool:
    """Un jour est-il une journée de service (dimanche -> jeudi) ?"""
    d = _as_date(day)
    return d.weekday() in OPERATIONAL_DOWS


def next_operational_day(day: Union[date, str, "pd.Timestamp"]) -> date:
    """Journée de service suivante (après ``day``), vendredi/samedi exclus.

    Exemples : Jeudi -> Dimanche, Vendredi -> Dimanche, Samedi -> Dimanche.
    """
    cursor = _as_date(day) + timedelta(days=1)
    while not is_operational_day(cursor):
        cursor += timedelta(days=1)
    return cursor


def previous_operational_day(day: Union[date, str, "pd.Timestamp"]) -> date:
    """Journée de service précédente (avant ``day``), vendredi/samedi exclus."""
    cursor = _as_date(day) - timedelta(days=1)
    while not is_operational_day(cursor):
        cursor -= timedelta(days=1)
    return cursor


def iso_next_operational_day(day: Union[date, str, "pd.Timestamp"]) -> str:
    """Version ISO (YYYY-MM-DD) de ``next_operational_day`` — pour l'API."""
    return next_operational_day(day).isoformat()


def iso_previous_operational_day(day: Union[date, str, "pd.Timestamp"]) -> str:
    return previous_operational_day(day).isoformat()


def dow_label(day: Union[date, str, "pd.Timestamp"]) -> str:
    """Libellé français du jour de la semaine (ex. 'Dimanche')."""
    return DOW_LABELS[_as_date(day).weekday()]


def _as_date(value: Union[date, str, "pd.Timestamp"]) -> date:
    if isinstance(value, date) and not isinstance(value, str):
        return value
    if isinstance(value, str):
        return date.fromisoformat(value)
    # pd.Timestamp / datetime-like
    return value.date()
