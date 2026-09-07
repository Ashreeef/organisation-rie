"""Operational data storage (JSON file-based)."""
import json
from datetime import date, datetime
from pathlib import Path
from typing import Optional


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
