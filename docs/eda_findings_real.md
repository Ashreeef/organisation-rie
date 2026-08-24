# EDA Findings — Real Data (real.csv)

Generated from `02_eda.ipynb` on real_clean.csv (605 rows, May 2022 - Dec 2024).

## Key Statistics
- **office_present**: mean=545, std=57, range=[270, 628]
- **employees_count**: mean=329, std=44, range=[1, 581]
- **ratio**: mean=0.606, std=0.067, range=[0.002, 0.902]
- **CV(ratio)** = 0.1035 vs **CV(cantine)** = 0.1285 (1.2x more stable)

## Top 5 Factors Driving Higher Ratio
1. **DOW effect**: Systematic variation by day of week
2. **Seasonality**: Clear monthly patterns with Ramadan and summer dips
3. **Menu type**: Traditional Algerian dishes correlate with higher attendance
4. **Second dish option**: plat_principal_2 presence may increase attendance
5. **Stable office-cantine relationship**: Pearson r=0.633

## Top 5 Factors Driving Lower Ratio
1. **Ramadan**: Significant attendance reduction during fasting month
2. **Extreme temperatures**: Heat/cold reduce cafeteria usage
3. **August**: Summer vacations reduce both metrics
4. **Year-end (Dec 22+)**: Holiday period reduction
5. **Rain**: Precipitation may reduce cafeteria visits

## Data Quality Concerns
- 61 rows excluded (Jan-Mar 2022 startup period)
- 37 weather nulls (all in excluded period)
- plat_principal_2: 37% null — limited use as feature
- One extreme outlier: ratio=0.002 (2023-03-23)
- Zero Friday/Saturday rows — no weekend learning possible

## Recommended Features
- Temporal: DOW, month, year, is_ramadan, is_august, trend
- Lags: lag_5 (Algerian weekly cycle), lag_10, lag_20
- Rolling: 5-day and 20-day rolling mean
- Calendar: days_to_next_holiday, is_french_holiday
- Menu: dish_group, has_second_dish
- Weather: temperature, precipitation_mm, cloud_cover_pct
- Office: office_present (primary predictor)
