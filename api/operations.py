"""Operational data storage (JSON file-based) + service clock lifecycle."""
import json
from datetime import date, datetime, time as datetime_time
from pathlib import Path
from typing import Optional

from .settings import load_settings


DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "operational"


def _ensure_dir():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _entry_path(day: str) -> Path:
    return DATA_DIR / f"{day}.json"


def get_today_entry(day: Optional[str] = None) -> Optional[dict]:
    if day is None:
        day = date.today().isoformat()
    _ensure_dir()
    p = _entry_path(day)
    if not p.exists():
        return None
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save_entry(entry: dict) -> dict:
    _ensure_dir()
    day = entry["date"]
    entry["modified_at"] = datetime.now().isoformat()
    p = _entry_path(day)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(entry, f, indent=2, ensure_ascii=False)
    return entry


def get_all_entries() -> list[dict]:
    _ensure_dir()
    entries = []
    for p in sorted(DATA_DIR.glob("*.json")):
        with open(p, encoding="utf-8") as f:
            entries.append(json.load(f))
    return entries


def list_dates() -> list[str]:
    _ensure_dir()
    return sorted(p.stem for p in DATA_DIR.glob("*.json"))


# ---------------------------------------------------------------------------
# Cycle de service piloté par l'horloge (Horaire du service dans /settings)
# ---------------------------------------------------------------------------
#  Phase dérivée de l'heure courante vs les réglages :
#    "before"  -> avant service_start   (préparation)
#    "during"  -> [service_start, service_end)   (service en cours)
#    "after"   -> [service_end, bilan_deadline)  (service terminé, bilan à saisir)
#    "late"    -> >= bilan_deadline              (bilan en retard)
#  L'avancement automatique ne recule JAMAIS (jamais de retour vers l'amont) et
#  ne franchit jamais l'étape "bilan_a_saisir" : la saisie/clôture du bilan
#  reste un acte manuel.

def _parse_hhmm(value: str) -> datetime_time:
    try:
        return datetime.strptime(str(value), "%H:%M").time()
    except Exception:
        return datetime_time(0, 0)


def derive_service_phase(now: Optional[datetime] = None) -> str:
    """Phase horaire du service selon les réglages (source unique : settings)."""
    settings = load_settings()
    now = now or datetime.now()
    t = now.time()
    start = _parse_hhmm(settings["service_start"])
    end = _parse_hhmm(settings["service_end"])
    deadline = _parse_hhmm(settings["bilan_deadline"])
    if t < start:
        return "before"
    if t < end:
        return "during"
    if t < deadline:
        return "after"
    return "late"


def advance_status_by_time(status: str, now: Optional[datetime] = None) -> str:
    """Avance le statut persistant vers l'aval selon l'heure courante.

    - "preparation" -> "service" dès l'heure de début atteinte.
    - "service"     -> "bilan_a_saisir" dès l'heure de fin atteinte.
    Ne modifie jamais "bilan_a_saisir", "bilan_a_confirmer" ni "cloturee"
    (saisie et clôture restent manuelles) et ne recule jamais.
    """
    phase = derive_service_phase(now)
    order = {"preparation": 0, "service": 1, "bilan_a_saisir": 2,
             "bilan_a_confirmer": 3, "cloturee": 4}
    target = {"before": "preparation", "during": "service",
              "after": "bilan_a_saisir", "late": "bilan_a_saisir"}[phase]
    if order.get(status, 0) < order[target]:
        return target
    return status
