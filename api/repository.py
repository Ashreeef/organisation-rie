"""Canonical repository layer.

This project currently stores operational data in local files, but the code is
structured around a single repository interface so it can be backed by Supabase
later without changing the calling code.

The default implementation remains file-backed for local/dev compatibility, while
Supabase is activated automatically when the required environment variables are
present.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Optional

try:
    from supabase import Client, create_client  # type: ignore
except Exception:  # pragma: no cover
    Client = Any  # type: ignore
    create_client = None  # type: ignore


REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
OPERATIONAL_DIR = DATA_DIR / "operational"


class CanonicalStore:
    """Repository interface for application entities."""

    def list_menus(self, start: Optional[str] = None, end: Optional[str] = None) -> list[dict[str, Any]]:
        raise NotImplementedError

    def get_menu(self, date: str) -> Optional[dict[str, Any]]:
        raise NotImplementedError

    def upsert_menu(self, entry: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    def delete_menu(self, date: str) -> bool:
        raise NotImplementedError

    def list_weekly_plan(self, start: str, end: str) -> list[dict[str, Any]]:
        return self.list_menus(start=start, end=end)

    def list_dishes(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def list_operations(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def save_operation(self, entry: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError


class FileStore(CanonicalStore):
    """Local file-backed implementation used while the project is still local.

    The goal is to keep all menu and operational data in one place and to make it
    straightforward to replace this implementation with Supabase later.
    """

    def __init__(self):
        PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
        OPERATIONAL_DIR.mkdir(parents=True, exist_ok=True)
        self.menus_path = PROCESSED_DIR / "planned_menus.csv"
        self.dishes_path = PROCESSED_DIR / "canonical_dishes.json"
        self.operations_dir = OPERATIONAL_DIR
        self._ensure_menu_file()
        self._ensure_dishes_file()

    def _ensure_menu_file(self) -> None:
        if not self.menus_path.exists():
            import pandas as pd

            pd.DataFrame(
                columns=[
                    "date",
                    "entrees",
                    "plat_principal_1",
                    "plat_principal_2",
                    "plat_principal_1_id",
                    "plat_principal_2_id",
                ]
            ).to_csv(self.menus_path, index=False)

    def _ensure_dishes_file(self) -> None:
        if not self.dishes_path.exists():
            payload = {
                "dishes": [],
                "last_updated": None,
                "source": "canonical_menu_catalog",
            }
            self.dishes_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    def list_menus(self, start: Optional[str] = None, end: Optional[str] = None) -> list[dict[str, Any]]:
        import pandas as pd

        if not self.menus_path.exists():
            self._ensure_menu_file()
        df = pd.read_csv(self.menus_path)
        if df.empty or "date" not in df.columns:
            return []
        df = df.copy()
        df["date"] = pd.to_datetime(df["date"], errors="coerce")
        df = df.dropna(subset=["date"]).sort_values("date").reset_index(drop=True)
        if start:
            df = df[df["date"] >= pd.to_datetime(start)]
        if end:
            df = df[df["date"] <= pd.to_datetime(end)]
        out: list[dict[str, Any]] = []
        for _, row in df.iterrows():
            out.append(
                {
                    "date": pd.Timestamp(row["date"]).date().isoformat(),
                    "entrees": str(row.get("entrees") or ""),
                    "plat_principal_1": str(row.get("plat_principal_1") or ""),
                    "plat_principal_2": str(row.get("plat_principal_2") or ""),
                    "plat_principal_1_id": str(row.get("plat_principal_1_id") or ""),
                    "plat_principal_2_id": str(row.get("plat_principal_2_id") or ""),
                }
            )
        return out

    def get_menu(self, date: str) -> Optional[dict[str, Any]]:
        for menu in self.list_menus():
            if menu["date"] == date:
                return menu
        return None

    def upsert_menu(self, entry: dict[str, Any]) -> dict[str, Any]:
        import pandas as pd

        date = pd.Timestamp(entry["date"]).date().isoformat()
        clean = {
            "date": date,
            "entrees": str(entry.get("entrees") or ""),
            "plat_principal_1": str(entry.get("plat_principal_1") or ""),
            "plat_principal_2": str(entry.get("plat_principal_2") or ""),
            "plat_principal_1_id": str(entry.get("plat_principal_1_id") or ""),
            "plat_principal_2_id": str(entry.get("plat_principal_2_id") or ""),
        }
        if self.menus_path.exists():
            df = pd.read_csv(self.menus_path)
        else:
            df = pd.DataFrame(columns=[
                "date",
                "entrees",
                "plat_principal_1",
                "plat_principal_2",
                "plat_principal_1_id",
                "plat_principal_2_id",
            ])
        if df.empty or "date" not in df.columns:
            df = pd.DataFrame(columns=[
                "date",
                "entrees",
                "plat_principal_1",
                "plat_principal_2",
                "plat_principal_1_id",
                "plat_principal_2_id",
            ])
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)
            mask = df["date"] == date
            if mask.any():
                for col in [
                    "date",
                    "entrees",
                    "plat_principal_1",
                    "plat_principal_2",
                    "plat_principal_1_id",
                    "plat_principal_2_id",
                ]:
                    df.loc[mask, col] = clean[col]
            else:
                df = pd.concat([df, pd.DataFrame([clean])], ignore_index=True)
        else:
            df = pd.DataFrame([clean], columns=[
                "date",
                "entrees",
                "plat_principal_1",
                "plat_principal_2",
                "plat_principal_1_id",
                "plat_principal_2_id",
            ])
        df = df.drop_duplicates(subset="date", keep="last").sort_values("date")
        df.to_csv(self.menus_path, index=False)
        return clean

    def delete_menu(self, date: str) -> bool:
        import pandas as pd

        if not self.menus_path.exists():
            return False
        df = pd.read_csv(self.menus_path)
        if df.empty or "date" not in df.columns:
            return False
        before = len(df)
        serial = pd.Timestamp(date).date().isoformat()
        df = df[df["date"].astype(str) != serial]
        df.to_csv(self.menus_path, index=False)
        return len(df) < before

    def list_dishes(self) -> list[dict[str, Any]]:
        if not self.dishes_path.exists():
            self._ensure_dishes_file()
        payload = json.loads(self.dishes_path.read_text(encoding="utf-8") or "{\"dishes\": []}")
        return payload.get("dishes", [])

    def list_operations(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        for path in sorted(self.operations_dir.glob("*.json")):
            try:
                with path.open("r", encoding="utf-8") as fh:
                    data = json.load(fh)
                    out.append(data)
            except Exception:
                continue
        return out

    def save_operation(self, entry: dict[str, Any]) -> dict[str, Any]:
        self.operations_dir.mkdir(parents=True, exist_ok=True)
        day = entry["date"]
        entry = dict(entry)
        from datetime import datetime

        entry["modified_at"] = datetime.now().isoformat()
        path = self.operations_dir / f"{day}.json"
        with path.open("w", encoding="utf-8") as fh:
            json.dump(entry, fh, ensure_ascii=False, indent=2)
        return entry


class SupabaseStore(CanonicalStore):
    """Supabase-backed implementation. Activated when credentials are available."""

    def __init__(self):
        self.url = os.getenv("SUPABASE_URL")
        self.key = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_ANON_KEY")
        if not self.url or not self.key or create_client is None:
            raise RuntimeError("Supabase credentials not configured.")
        self.client: Client = create_client(self.url, self.key)  # type: ignore[arg-type]

    def list_menus(self, start: Optional[str] = None, end: Optional[str] = None) -> list[dict[str, Any]]:
        query = self.client.table("menus").select("*")
        if start:
            query = query.gte("date", start)
        if end:
            query = query.lte("date", end)
        response = query.order("date", desc=False).execute()
        return response.data or []

    def get_menu(self, date: str) -> Optional[dict[str, Any]]:
        response = self.client.table("menus").select("*").eq("date", date).limit(1).execute()
        rows = response.data or []
        return rows[0] if rows else None

    def upsert_menu(self, entry: dict[str, Any]) -> dict[str, Any]:
        if self.get_menu(entry["date"]):
            response = self.client.table("menus").update(entry).eq("date", entry["date"]).execute()
            return response.data[0]
        response = self.client.table("menus").insert(entry).execute()
        return response.data[0]

    def delete_menu(self, date: str) -> bool:
        response = self.client.table("menus").delete().eq("date", date).execute()
        return bool(response.data)

    def list_dishes(self) -> list[dict[str, Any]]:
        response = self.client.table("dishes").select("*").execute()
        return response.data or []

    def list_operations(self) -> list[dict[str, Any]]:
        response = self.client.table("operations").select("*").execute()
        return response.data or []

    def save_operation(self, entry: dict[str, Any]) -> dict[str, Any]:
        response = self.client.table("operations").upsert(entry, on_conflict="date").execute()
        return response.data[0]


def get_store() -> CanonicalStore:
    """Return the canonical store implementation.

    Supabase is preferred when configured; otherwise a local file-backed store is
    used. This keeps the app ready for the production DB migration without moving
    all callers at once.
    """
    if os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_KEY"):
        try:
            return SupabaseStore()
        except Exception:
            pass
    return FileStore()
