"""Tests du calendrier opérationnel canonique (dimanche -> jeudi)."""
from datetime import date

from src.operational_calendar import (
    is_operational_day,
    next_operational_day,
    previous_operational_day,
    iso_next_operational_day,
    dow_label,
    OPERATIONAL_DOWS,
    NON_OPERATIONAL_DOWS,
)


def test_operational_dows_constants():
    # Python weekday: Lundi=0 ... Dimanche=6
    assert OPERATIONAL_DOWS == {0, 1, 2, 3, 6}
    assert NON_OPERATIONAL_DOWS == {4, 5}


def test_is_operational_day_calendar_days():
    # 3 septembre 2026 = jeudi (jour travaillé)
    assert is_operational_day(date(2026, 9, 3)) is True
    # 4 septembre 2026 = vendredi (fermé)
    assert is_operational_day(date(2026, 9, 4)) is False
    # 5 septembre 2026 = samedi (fermé)
    assert is_operational_day(date(2026, 9, 5)) is False
    # 6 septembre 2026 = dimanche (travaillé)
    assert is_operational_day(date(2026, 9, 6)) is True


def test_next_operational_day_thursday_to_sunday():
    # Jeudi 3 septembre 2026 -> Dimanche 6 septembre 2026 (PAS vendredi/samedi)
    assert next_operational_day(date(2026, 9, 3)) == date(2026, 9, 6)


def test_next_operational_day_full_cycle():
    # Mercredi -> Jeudi
    assert next_operational_day(date(2026, 9, 2)) == date(2026, 9, 3)
    # Vendredi -> Dimanche
    assert next_operational_day(date(2026, 9, 4)) == date(2026, 9, 6)
    # Samedi -> Dimanche
    assert next_operational_day(date(2026, 9, 5)) == date(2026, 9, 6)
    # Dimanche -> Lundi
    assert next_operational_day(date(2026, 9, 6)) == date(2026, 9, 7)
    # Lundi -> Mardi
    assert next_operational_day(date(2026, 9, 7)) == date(2026, 9, 8)
    # Jeudi -> Dimanche (never Friday)
    assert next_operational_day(date(2026, 9, 10)) == date(2026, 9, 13)


def test_next_operational_day_never_friday_or_saturday():
    # Quel que soit le point de départ, le résultat ne doit jamais être un
    # vendredi(4)/samedi(5).
    for day in range(2, 10):  # du 2 au 9 sept 2026
        result = next_operational_day(date(2026, 9, day)).weekday()
        assert result in (0, 1, 2, 3, 6), f"Résultat invalide (weekday={result})"


def test_previous_operational_day():
    # Dimanche 6 septembre -> Jeudi 3 septembre (vendredi/samedi exclus)
    assert previous_operational_day(date(2026, 9, 6)) == date(2026, 9, 3)
    # Jeudi -> Mercredi
    assert previous_operational_day(date(2026, 9, 3)) == date(2026, 9, 2)
    # Lundi -> Dimanche
    assert previous_operational_day(date(2026, 9, 7)) == date(2026, 9, 6)


def test_iso_variant_returns_string():
    assert iso_next_operational_day(date(2026, 9, 3)) == "2026-09-06"
    assert isinstance(iso_next_operational_day("2026-09-03"), str)


def test_accepts_iso_string_input():
    assert is_operational_day("2026-09-03") is True
    assert next_operational_day("2026-09-03") == date(2026, 9, 6)


def test_dow_label():
    assert dow_label(date(2026, 9, 3)) == "Jeudi"
    assert dow_label(date(2026, 9, 6)) == "Dimanche"
