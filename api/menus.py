"""
Menus planifiés — stockage et lecture des menus saisis par le gestionnaire.

Persistance : data/processed/planned_menus.csv
Format : date,entrees,plat_principal_1,plat_principal_2

C'est le fichier consumé par src/forecasting/daily_features.py pour
reconstruire les features des jours cibles à partir des vrais menus.
"""
import pandas as pd
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"
MENUS_FILE = DATA_DIR / "planned_menus.csv"

MENU_COLS = ["date", "entrees", "plat_principal_1", "plat_principal_2",
             "plat_principal_1_id", "plat_principal_2_id"]


def _ensure_file():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not MENUS_FILE.exists():
        pd.DataFrame(columns=MENU_COLS).to_csv(MENUS_FILE, index=False)


def _load_all() -> pd.DataFrame:
    _ensure_file()
    return pd.read_csv(MENUS_FILE)


def get_menus(start: Optional[str] = None, end: Optional[str] = None) -> list[dict]:
    """Liste les menus planifiés, éventuellement bornés par date (inclusif)."""
    df = _load_all()
    if df.empty or "date" not in df.columns:
        return []
    df["date"] = pd.to_datetime(df["date"], errors="coerce").dropna()
    df = df.dropna(subset=["date"])
    if start:
        df = df[df["date"] >= pd.to_datetime(start)]
    if end:
        df = df[df["date"] <= pd.to_datetime(end)]
    df = df.sort_values("date")
    out = []
    for _, r in df.iterrows():
        row = {"date": pd.Timestamp(r["date"]).date().isoformat()}
        for c in ["entrees", "plat_principal_1", "plat_principal_2",
                  "plat_principal_1_id", "plat_principal_2_id"]:
            v = r.get(c)
            row[c] = ("" if pd.isna(v) else str(v))
        out.append(row)
    return out


def get_menu(date: str) -> Optional[dict]:
    """Retourne le menu planifié pour une date donnée (ou None)."""
    target = pd.Timestamp(date).normalize()
    for m in get_menus():
        if pd.Timestamp(m["date"]).normalize() == target:
            return m
    return None


def upsert_menu(entry: dict) -> dict:
    """Crée ou met à jour le menu planifié pour une date.

    ``entry`` : {date, entrees, plat_principal_1, plat_principal_2}.
    Les champs vides remplacent les valeurs existantes par "".
    """
    _ensure_file()
    date = pd.Timestamp(entry["date"]).date().isoformat()
    clean = {
        "date": date,
        "entrees": str(entry.get("entrees") or ""),
        "plat_principal_1": str(entry.get("plat_principal_1") or ""),
        "plat_principal_2": str(entry.get("plat_principal_2") or ""),
        "plat_principal_1_id": str(entry.get("plat_principal_1_id") or ""),
        "plat_principal_2_id": str(entry.get("plat_principal_2_id") or ""),
    }
    df = _load_all()
    if not df.empty and "date" in df.columns:
        df["date"] = df["date"].astype(str)
        mask = df["date"] == date
        if mask.any():
            df.loc[mask, MENU_COLS] = [clean[c] for c in MENU_COLS]
        else:
            df = pd.concat([df, pd.DataFrame([clean])], ignore_index=True)
    else:
        df = pd.DataFrame([clean], columns=MENU_COLS)

    df = df.drop_duplicates(subset="date", keep="last")
    df = df.sort_values("date")
    df.to_csv(MENUS_FILE, index=False)
    return clean


def delete_menu(date: str) -> bool:
    """Supprime le menu planifié pour une date. Retourne True si supprimé."""
    _ensure_file()
    df = _load_all()
    if df.empty or "date" not in df.columns:
        return False
    df["date"] = df["date"].astype(str)
    before = len(df)
    df = df[df["date"] != pd.Timestamp(date).date().isoformat()]
    removed = before - len(df)
    df.to_csv(MENUS_FILE, index=False)
    return removed > 0
