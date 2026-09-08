"""
Pré-remplit le log « candidats à examiner » (Phase 4) depuis l'historique
2025-data.csv : pour chaque plat principal non mappé au catalogue, enregistre
le texte avec sa fréquence réelle de rencontre dans l'historique.

Usage:
    python scripts/seed_unknown_dishes.py [--force]

Le log (data/processed/unknown_dishes.csv) est incrémental : les textes déjà
présents (par ex. signalés en live par le dashboard) voient leur fréquence
additionnée, ils ne sont pas écrasés. Sans --force, un fichier existant est
conservé tel quel (permet de relancer sans double-compter).
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from api.menus import UNKNOWN_FILE, log_unknown_dish  # noqa: E402
from src.menu_optimization.menu_catalog_py import find_dish  # noqa: E402

SOURCE_CSV = REPO_ROOT / "data" / "raw" / "2025-data.csv"


def heal(b: bytes) -> str:
    """Réconcilie l'encodage mixte de 2025-data.csv (UTF-8 mojibake vs cp1252)."""
    try:
        s = b.decode("utf-8")
        if "Ã" in s or "Â" in s:
            return s.encode("cp1252", errors="ignore").decode("utf-8", errors="replace")
        return s
    except UnicodeDecodeError:
        return b.decode("cp1252")


def read_rows():
    with open(SOURCE_CSV, "rb") as fh:
        fh.readline()  # en-tête
        for ln in fh:
            if not ln.strip():
                continue
            t = heal(ln).strip()
            parts = t.split(",")
            if len(parts) > 5:
                parts = [parts[0], parts[1], parts[2], ",".join(parts[3:-1]), parts[-1]]
            if len(parts) == 5:
                yield {"date": parts[0], "plat": parts[2]}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--force", action="store_true",
        help="Réinitialiser le log AVANT de rejouer l'historique.",
    )
    args = parser.parse_args(argv)

    if args.force and UNKNOWN_FILE.exists():
        import os
        os.remove(UNKNOWN_FILE)

    if UNKNOWN_FILE.exists():
        print("Le log existe déjà — initialisation déjà effectuée (skip).")
        print("Réinitialiser puis rejouer l'historique : --force.")
        return 0

    rows = list(read_rows())
    n_total = len(rows)
    n_unmapped = 0
    n_dates = set()
    for r in rows:
        plat = str(r["plat"]).strip()
        if not plat or plat.upper() in ("N/A", "NAN", "NONE", "NULL"):
            continue
        if find_dish(plat):
            continue
        n_unmapped += 1
        date = r["date"].strip()
        if date:
            n_dates.add(date)
            try:
                log_unknown_dish(plat, seen_on=date)
            except ValueError:
                pass

    print(f"Lignes 2025-data parsées : {n_total}")
    print(f"Plats principaux non mappés : {n_unmapped}")
    print(f"Dates couvertes : {min(n_dates)} → {max(n_dates)} ({len(n_dates)} jours)")
    print(f"Log : {UNKNOWN_FILE}")


if __name__ == "__main__":
    sys.exit(main())