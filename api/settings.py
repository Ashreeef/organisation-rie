"""
Paramètres d'application — persistance JSON (data/settings.json).

Porté côté serveur car ces réglages influencent la prévision (marge de
sécurité) et le contexte opérationnel (horaires), pas seulement l'UI.
"""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

SETTINGS_FILE = Path(__file__).resolve().parent.parent / "data" / "settings.json"

DEFAULTS: dict = {
    "site_name": "Siège — Alger",
    "safety_margin_pct": 4.0,
    "service_start": "12:30",
    "service_end": "13:30",
    "bilan_deadline": "15:00",
}

_cache: Optional[dict] = None


def load_settings() -> dict:
    """Lit les réglages (fusionnés avec les défauts), jamais None/partiel."""
    global _cache
    if _cache is not None:
        return dict(_cache)
    base = dict(DEFAULTS)
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as fh:
                stored = json.load(fh)
            if isinstance(stored, dict):
                base.update({k: v for k, v in stored.items() if k in DEFAULTS})
        except Exception as exc:
            logger.warning("settings.json illisible (%s) — défauts utilisés", exc)
    _cache = base
    return dict(base)


def save_settings(updates: dict) -> dict:
    """Écrase/sauvegarde les champs connus, retourne l'état complet."""
    global _cache
    clean = {k: v for k, v in (updates or {}).items() if k in DEFAULTS}
    if not clean:
        return load_settings()
    base = load_settings()
    base.update(clean)
    try:
        SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(SETTINGS_FILE, "w", encoding="utf-8") as fh:
            json.dump(base, fh, indent=2, ensure_ascii=False)
    except Exception as exc:
        logger.error("Échec écriture settings.json: %s", exc)
        raise
    _cache = dict(base)
    return dict(base)


def reset_settings_cache() -> None:
    global _cache
    _cache = None