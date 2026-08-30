"""
Exécution quotidienne planifiée de la génération des features live.

Usage:
    python scripts/run_daily_features.py [--days 14]
        [--out data/processed/features_live.csv]
        [--history data/processed/real_clean.csv]
        [--log data/logs/daily_features.log]

Le runner déloge les sorties de `src.forecasting.daily_features` dans un
fichier horodaté (avec rotation au-delà de 5 Mo) et écrit un journal JSON
`data/logs/daily_features_last_run.json` (statut, horodatage, volume, NaN)
consultable par la tâche planifiée ou la supervision.

Code retour : 0 si succès, 1 sinon.
"""
import argparse
import json
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from src.forecasting.daily_features import HISTORY_FILE, OUT_FILE, generate_features  # noqa: E402

LOG_DIR = REPO_ROOT / "data" / "logs"
JOURNAL_FILE = LOG_DIR / "daily_features_last_run.json"
MAX_LOG_BYTES = 5 * 1024 * 1024


def _append_log(path, line):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > MAX_LOG_BYTES:
        path.with_suffix(".log.1").write_bytes(path.read_bytes())
        path.unlink()
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(line + "\n")


def _write_journal(payload):
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    JOURNAL_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                            encoding="utf-8")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=14)
    parser.add_argument("--out", type=str, default=str(OUT_FILE))
    parser.add_argument("--history", type=str, default=str(HISTORY_FILE))
    parser.add_argument("--log", type=str, default=str(LOG_DIR / "daily_features.log"))
    args = parser.parse_args(argv)

    ts = datetime.now().isoformat(timespec="seconds")
    t0 = time.time()
    payload = {"ts": ts, "days": args.days, "status": "error"}
    try:
        history = pd.read_csv(args.history, parse_dates=["Date"])
        out = generate_features(
            days=args.days,
            out_path=args.out,
            history=history,
        )
        rows = len(out)
        nan_total = int(out.isna().sum().sum())
        first_offices = [round(v) for v in out["office_present"].head(3)]
        payload.update({
            "status": "ok",
            "rows": rows,
            "nan_total": nan_total,
            "first_dates": [str(d) for d in out["Date"].head(3)],
            "office_samples": first_offices,
            "out": args.out,
            "duration_s": round(time.time() - t0, 1),
        })
        msg = (f"[{ts}] OK rows={rows} first_office={first_offices} "
               f"nan={nan_total} dur={payload['duration_s']}s -> {args.out}")
        print(msg)
        _append_log(args.log, msg)
        _write_journal(payload)
        return 0
    except Exception as exc:  # noqa: BLE001 — tout échec doit remonter au planificateur
        trac = traceback.format_exc()
        payload.update({"error": str(exc), "trace": trac,
                        "duration_s": round(time.time() - t0, 1)})
        msg = f"[{ts}] ERREUR {exc!r}"
        print(msg, file=sys.stderr)
        print(trac, file=sys.stderr)
        _append_log(args.log, msg)
        _write_journal(payload)
        return 1


if __name__ == "__main__":
    sys.exit(main())