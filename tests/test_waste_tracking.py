"""Tests for src/waste_tracking/tracker.py"""
import tempfile
import os
import pandas as pd
import pytest
from src.waste_tracking.tracker import (
    log_daily_waste,
    load_waste_log,
    append_waste_entry,
    waste_summary,
    detect_anomalies,
    compute_feedback_signal,
)


class TestLogDailyWaste:
    def test_basic_logging(self):
        entry = log_daily_waste("2023-06-01", 300, 280)
        assert entry["waste"] == 20
        assert entry["waste_rate"] == pytest.approx(0.0667, abs=0.001)

    def test_zero_prepared(self):
        entry = log_daily_waste("2023-06-01", 0, 0)
        assert entry["waste"] == 0
        assert entry["waste_rate"] == 0.0

    def test_menu_stored(self):
        entry = log_daily_waste("2023-06-01", 300, 280, menu="Poulet riz")
        assert entry["menu"] == "Poulet riz"

    def test_negative_waste(self):
        entry = log_daily_waste("2023-06-01", 200, 250)
        assert entry["waste"] == -50


class TestLoadWasteLog:
    def test_nonexistent_file(self):
        df = load_waste_log("/tmp/nonexistent_file.csv")
        assert df.empty
        assert list(df.columns) == ["date", "prepared", "served", "waste", "waste_rate", "menu"]


class TestAppendWasteEntry:
    def test_creates_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "waste.csv")
            entry = log_daily_waste("2023-06-01", 300, 280)
            df = append_waste_entry(path, entry)
            assert len(df) == 1
            assert os.path.exists(path)

    def test_appends_multiple(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "waste.csv")
            e1 = log_daily_waste("2023-06-01", 300, 280)
            e2 = log_daily_waste("2023-06-02", 310, 300)
            append_waste_entry(path, e1)
            df = append_waste_entry(path, e2)
            assert len(df) == 2

    def test_roundtrip_persistence(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = os.path.join(tmpdir, "waste.csv")
            entry = log_daily_waste("2023-06-01", 300, 280, menu="Rechta")
            append_waste_entry(path, entry)
            loaded = load_waste_log(path)
            assert loaded.iloc[0]["prepared"] == 300
            assert loaded.iloc[0]["menu"] == "Rechta"


class TestWasteSummary:
    @pytest.fixture
    def waste_df(self):
        dates = pd.date_range("2023-06-01", periods=14, freq="D")
        return pd.DataFrame({
            "date": dates,
            "prepared": [300] * 14,
            "served": [280] * 14,
            "waste": [20] * 14,
            "waste_rate": [0.0667] * 14,
            "menu": ["test"] * 14,
        })

    def test_weekly_summary(self, waste_df):
        summary = waste_summary(waste_df, period="weekly")
        assert len(summary) > 0
        assert "total_waste" in summary.columns
        assert "overall_waste_rate" in summary.columns

    def test_monthly_summary(self, waste_df):
        summary = waste_summary(waste_df, period="monthly")
        assert len(summary) == 1
        assert summary.iloc[0]["total_waste"] == 280

    def test_empty_df(self):
        summary = waste_summary(pd.DataFrame(), period="weekly")
        assert summary.empty


class TestDetectAnomalies:
    def test_flags_high_waste(self):
        df = pd.DataFrame({
            "date": ["2023-06-01"],
            "waste_rate": [0.35],
            "prepared": [300],
        })
        flagged = detect_anomalies(df, threshold_rate=0.25)
        assert len(flagged) == 1

    def test_ignores_normal_waste(self):
        df = pd.DataFrame({
            "date": ["2023-06-01"],
            "waste_rate": [0.10],
            "prepared": [300],
        })
        flagged = detect_anomalies(df, threshold_rate=0.25)
        assert len(flagged) == 0


class TestComputeFeedbackSignal:
    def test_insufficient_data(self):
        df = pd.DataFrame({"date": [], "waste_rate": [], "prepared": []})
        signal = compute_feedback_signal(df)
        assert signal["bias_direction"] == "insufficient_data"

    def test_balanced_signal(self):
        df = pd.DataFrame({
            "date": pd.date_range("2023-01-01", periods=30),
            "waste_rate": [0.03] * 30,
            "prepared": [300] * 30,
        })
        signal = compute_feedback_signal(df)
        assert signal["bias_direction"] == "balanced"
        assert signal["recommended_adjustment"] == 0

    def test_over_prepares_signal(self):
        df = pd.DataFrame({
            "date": pd.date_range("2023-01-01", periods=30),
            "waste_rate": [0.10] * 30,
            "prepared": [300] * 30,
        })
        signal = compute_feedback_signal(df)
        assert signal["bias_direction"] == "over_prepares"
        assert signal["recommended_adjustment"] < 0
