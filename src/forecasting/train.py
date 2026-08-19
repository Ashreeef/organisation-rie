"""
Training script — End-to-end pipeline for model serialization.

Usage:
    python -m src.forecasting.train

Loads raw data -> runs FE pipeline -> trains multi-alpha ensemble -> saves to models/
"""
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

import pandas as pd
from src.feature_engineering.pipeline import run_pipeline, save_processed
from src.forecasting.model import train_ensemble, save_model


def main():
    RAW_DIR   = ROOT / "data" / "raw"
    PROC_DIR  = ROOT / "data" / "processed"
    MODEL_DIR = ROOT / "models"

    print("=" * 60)
    print("  RIE BNP Paribas — Multi-Alpha Ensemble Training")
    print("=" * 60)

    # 1. Load raw data
    print("\n[1/5] Loading raw data...")
    train_raw = pd.read_csv(RAW_DIR / "train.csv", parse_dates=["Date"])
    test_raw  = pd.read_csv(RAW_DIR / "test.csv",  parse_dates=["Date"])
    print(f"  Train: {train_raw.shape} | Test: {test_raw.shape}")

    # 2. Feature engineering
    print("\n[2/5] Feature engineering pipeline...")
    train_df, test_df, feature_cols = run_pipeline(train_raw, test_raw)
    print(f"  Features: {len(feature_cols)} | Train: {train_df.shape} | Test: {test_df.shape}")

    # 3. Save processed data
    save_processed(train_df, test_df, feature_cols, PROC_DIR)
    print(f"  Saved processed data -> {PROC_DIR}")

    # 4. Train ensemble
    print("\n[3/5] Training multi-alpha LightGBM + XGBoost ensemble...")
    results = train_ensemble(train_df, test_df, feature_cols)

    # 5. Save models
    print(f"\n[4/5] Saving {len(results['models'])} models -> {MODEL_DIR}...")
    save_model(
        models=results["models"],
        weights=results["weights"],
        feature_cols=feature_cols,
        metrics=results["oof_metrics"],
        save_dir=MODEL_DIR,
    )
    print(f"  ensemble_meta.json + {len(results['models'])} .joblib files")

    # 6. Save submission
    submission = pd.DataFrame({
        "Date":            test_df["Date"].dt.strftime("%Y-%m-%d"),
        "employees_count": results["predictions"]["count"],
    })
    sub_path = PROC_DIR / "submission.csv"
    submission.to_csv(sub_path, index=False)

    print(f"\n[5/5] Submission saved -> {sub_path} ({len(submission)} rows)")

    # Summary
    print("\n" + "=" * 60)
    print("  DONE")
    print(f"  OOF Asym. Cost : {results['oof_metrics']['Asym. Cost']:.5f}")
    print(f"  OOF MAE        : {results['oof_metrics']['MAE (repas)']:.1f} repas")
    print(f"  Models saved   : {len(results['models'])} in {MODEL_DIR}")
    print(f"  Dashboard-ready: load via load_model('{MODEL_DIR}')")
    print("=" * 60)


if __name__ == "__main__":
    main()
