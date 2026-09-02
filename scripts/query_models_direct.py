"""
Query the deployed RIE models DIRECTLY (no API server).

Replicates the exact cascade of api/forecast.predict_today but regenerates the
2026-09-01 feature row WITH the menu the user saved on the website
(planned_menus.csv), so menu text features (tfidf_svd_*, plat1_te, menu_cat_*,
acc_*, menu_band_*) actually reflect "Poulet rôti" / "Pomme sautée" instead of
zeros, and prints every intermediate step of the pipeline.

Regression-style sleep demo of what the serving layer does:
  1. features_live pattern = daily_features.generate_features(...) with the
     planned menu merged (same code path as the daily regeneration job);
  2. ratio = ensemble blend (LGB/XGB/CatBoost) over the full 157 feat_cols;
  3. count = ratio * office_present  -> DOW offset -> shrinkage toward DOW mean;
  4. clip + round -> safety margin (+4%/+6% Ramadan) -> confidence band.

Usage:
    .venv\\Scripts\\python.exe scripts/query_models_direct.py [YYYY-MM-DD]
"""
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from api import forecast as fc
from src.forecasting.daily_features import generate_features

SEP = "-" * 62


def main(target_date: str = "2026-09-01") -> None:
    dep = fc._load_deployment()
    print(SEP)
    print(f"DEPLOYED BUNDLE  models/_deployment.pkl")
    print(f"  blend weights      LGB {dep['best_blend_w'][0]:.4f} | "
          f"XGB {dep['best_blend_w'][1]:.4f} | "
          f"CAT {dep['best_blend_w'][2]:.4f}")
    print(f"  lam_opt={float(dep['lam_opt']):.4f}  offsets={dep['offsets']}")
    print(f"  clip=({dep['clip_lo']}, {dep['clip_hi']})")
    print(f"  n_feat_cols={len(dep['feat_cols'])}  n_models="
          f"{len(dep['lgb_models'])}+{len(dep['xgb_models'])}+{len(dep['cb_models'])}")

    # --- 1. what the user saved on the website -------------------------------
    planned = pd.read_csv(REPO / "data" / "processed" / "planned_menus.csv")
    pm = planned[planned["date"] == target_date]
    if pm.empty:
        print(f"\nNo planned menu for {target_date} !")
        menu_1, menu_2, entrees = "Poulet rôti", "Pomme sautée", "Salade ou Soupe ou Salé"
    else:
        r = pm.iloc[0]
        menu_1 = r["plat_principal_1"]
        menu_2 = r["plat_principal_2"] if pd.notna(r["plat_principal_2"]) else None
        entrees = r["entrees"] if pd.notna(r["entrees"]) else None
    print(f"\nWEBSITE MENU ({target_date}):")
    print(f"  entrees           : {entrees}")
    print(f"  plat_principal_1  : {menu_1}")
    print(f"  plat_principal_2  : {menu_2}")

    # --- 2. rebuild the live feature row WITH this menu -----------------------
    # Same function the daily job runs; merges planned_menus.csv so the text
    # features (tfidf_svd_*, plat1_te) are computed for the real dishes.
    temp_out = REPO / "data" / "processed" / "features_live_QUERYONLY.csv"
    feats_df = generate_features(
        target_dates=[pd.Timestamp(target_date)],
        out_path=temp_out,
    )
    row = feats_df[feats_df["Date"] == pd.Timestamp(target_date)].iloc[0]
    print(f"\nFEATURE ROW for {target_date}:")
    for c in ("office_present", "plat1_te", "menu_typical_ratio", "menu_mapped"):
        if c in row:
            print(f"  {c:<20}= {row[c]}")
    print("  tfidf_svd_0..7    =", [round(float(row[f"tfidf_svd_{i}"]), 4)
                                     for i in range(8)])

    # --- 3. cascade (identical to api/forecast.predict_today) ----------------
    d = pd.Timestamp(target_date)
    dow = fc._algerian_dow(d)

    op_pred = fc._office_from_features_row(row)
    print(f"\nCASCADE for {target_date} (dow={dow}):")

    # 3a. raw ensemble ratio (157 features)
    ratio_pred = fc._predict_ratio_from_features(dep, row)
    print(f"  [1] ratio_pred (blend)               = {ratio_pred:.4f}")

    # 3b. ratio -> count + DOW offset
    raw_count = ratio_pred * op_pred
    off = dep["offsets"].get(dow, 0.0)
    after_offset = raw_count + off
    print(f"  [2] ratio*office={ratio_pred:.4f}*{op_pred:.1f} = {raw_count:.2f}")
    print(f"  [3] + offset[{dow}]={off:.2f}          = {after_offset:.2f}")

    # 3c. shrinkage toward DOW mean
    lam = float(dep["lam_opt"])
    dow_mean = dep["dow_mean_actual"].get(dow, raw_count)
    shrunk = lam * after_offset + (1 - lam) * dow_mean
    print(f"  [4] shrink lam={lam:.3f} mean_dow[{dow}]={float(dow_mean):.2f} -> {shrunk:.2f}")

    # 3d. clip + round
    count = float(np.clip(shrunk, dep["clip_lo"], dep["clip_hi"]))
    count_int = int(round(count))
    print(f"  [5] clip+round                       = {count_int}")

    # 3e. safety margin + confidence
    safety = 0.06 if fc._is_ramadan(d) else 0.04
    recommended = int(round(count_int * (1 + safety)))
    spread = max(10, int(round(op_pred * 0.045)))
    lo = max(0, count_int - spread)
    hi = count_int + spread
    level = "high" if spread <= 18 else "medium" if spread <= 28 else "low"
    print(f"  [6] safety={safety:.2f} -> recommended    = {recommended}")
    print(f"  [7] office={int(round(op_pred))} spread={spread} -> CI [{lo}, {hi}] ({level})")

    print("\nFINAL (direct model query):")
    print(f"  office_present     : {int(round(op_pred))}")
    print(f"  predicted_ratio    : {round(ratio_pred, 4)}")
    print(f"  employees_count    : {count_int}")
    print(f"  recommended_meals  : {recommended}")
    print(f"  confidence         : [{lo}, {hi}] ({level})")

    # --- 4. compare with what the API would say WITHOUT the regenerated menu --
    fc._features_cache = None  # force reload so we see ONLY the temp live file
    print(SEP)
    print("Sanity: api.predict_today on same (regenerated) features:")
    print(" ", fc.predict_today(target_date))

    temp_out.unlink(missing_ok=True)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "2026-09-01")