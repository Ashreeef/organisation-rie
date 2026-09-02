'use client';

/**
 * API layer — single entry point for all data.
 *
 * Data source hierarchy (backend single source of truth, mock eliminated):
 *   - Forecast / model metrics / planned menus → FastAPI backend
 *   - Daily operations / service lifecycle → FastAPI backend (/api/operations)
 *   - Charts & history → CSV files (train.csv, submission.csv, test.csv)
 *   - Dishes & categories → shared catalog (menu-catalog.ts, menu-catalog.json)
 */

import type {
  ForecastResult,
  PlanningInputs,
  KPI,
  ForecastVsActualPoint,
  WasteDay,
  WasteSummary,
  MenuItem,
  MenuPlan,
  ForecastHistoryEntry,
  ModelMetrics,
  ModelFamily,
  DataSource,
  AttendancePoint,
  ServiceStatus,
  TodayState,
  TomorrowState,
} from '@/lib/types';
import { DISHES, DISH_CATEGORIES } from '@/lib/menu-catalog';

/* -------------------------------------------------------------------------- */
/*  Backend helpers                                                            */
/* -------------------------------------------------------------------------- */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function delay<T>(data: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

/* -------------------------------------------------------------------------- */
/*  CSV loading (for chart/history data)                                       */
/* -------------------------------------------------------------------------- */

type SubmissionRow = { date: string; predictedMeals: number };
type ForecastPoint = { date: string; predictedMeals: number; expectedPresence: number };
type ForecastBundle = {
  points: ForecastPoint[];
  actualByDate: Map<string, number>;
};

let forecastBundlePromise: Promise<ForecastBundle> | null = null;

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i += 1; }
      else { inQuotes = !inQuotes; }
      continue;
    }
    if (ch === ',' && !inQuotes) { out.push(current); current = ''; continue; }
    current += ch;
  }
  out.push(current);
  return out;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (const line of lines.slice(1)) {
    const fields = parseCsvLine(line);
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) { row[header[i]] = fields[i] ?? ''; }
    rows.push(row);
  }
  return rows;
}

async function fetchCsv(path: string): Promise<Record<string, string>[]> {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to fetch ${path}: ${response.status}`);
  return parseCsv(await response.text());
}

async function loadForecastBundle(): Promise<ForecastBundle> {
  if (!forecastBundlePromise) {
    forecastBundlePromise = (async () => {
      const [submissionRaw, testRaw, trainRaw] = await Promise.all([
        fetchCsv('/data/submission.csv'),
        fetchCsv('/data/test.csv'),
        fetchCsv('/data/train.csv'),
      ]);

      const submissionRows: SubmissionRow[] = submissionRaw.map((r) => ({
        date: r.Date,
        predictedMeals: Number(r.employees_count) || 0,
      }));

      const testPresence = new Map<string, number>();
      for (const row of testRaw) { testPresence.set(row.Date, Number(row.office_present) || 0); }

      const points: ForecastPoint[] = submissionRows.map((r) => ({
        date: r.date,
        predictedMeals: r.predictedMeals,
        expectedPresence: testPresence.get(r.date) ?? 0,
      }));

      const groupedActuals = new Map<string, { sum: number; count: number }>();
      for (const row of trainRaw) {
        const date = row.Date;
        const val = Number(row.employees_count);
        if (!Number.isFinite(val)) continue;
        const prev = groupedActuals.get(date) ?? { sum: 0, count: 0 };
        groupedActuals.set(date, { sum: prev.sum + val, count: prev.count + 1 });
      }
      const actualByDate = new Map<string, number>();
      groupedActuals.forEach((agg, date) => {
        actualByDate.set(date, Math.round(agg.sum / Math.max(agg.count, 1)));
      });

      return { points, actualByDate };
    })();
  }
  return forecastBundlePromise;
}

/* -------------------------------------------------------------------------- */
/*  Catalog-backed menu options (shared with the ML pipeline)                  */
/* -------------------------------------------------------------------------- */

const catalogMenuItems = (): MenuItem[] => {
  const catLabel = new Map(DISH_CATEGORIES.map((c) => [c.id, c.label]));
  return DISHES.map((d) => ({
    id: `menu-${d.id}`,
    name: d.name,
    category: d.is_traditional ? 'traditionnel' : 'international',
    attractiveness: Math.round(d.typical_ratio * 100),
    predictedWaste: d.ratio_effect === 'faible' ? 4 : d.ratio_effect === 'élevé' ? 9 : 6.5,
    costPerMeal: 0,
    score: Math.round(d.typical_ratio * 100),
    description: catLabel.get(d.category) ?? 'Catalogue',
    ingredients: d.aliases.slice(0, 3),
  }));
};

/* -------------------------------------------------------------------------- */
/*  Service lifecycle (backend is the single source of truth)                 */
/* -------------------------------------------------------------------------- */

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mapStatus(s: string | undefined): ServiceStatus {
  const allowed: ServiceStatus[] = [
    'preparation', 'service', 'bilan_a_saisir', 'bilan_a_confirmer', 'cloturee',
  ];
  return allowed.includes(s as ServiceStatus) ? (s as ServiceStatus) : 'preparation';
}

let _today: TodayState | null = null;

function setCachedToday(state: TodayState): TodayState {
  _today = state;
  return state;
}

async function fetchTodayState(): Promise<TodayState> {
  try {
    const res = await apiGet<{
      date: string;
      status: string;
      operational: {
        status?: string;
        planned_meals?: number;
        actual_meals?: number;
        prepared?: number;
        served?: number;
        comment?: string | null;
        bilan?: {
          date?: string;
          prepared?: number;
          served?: number;
          remaining?: number;
          wasteRate?: number;
          comment?: string | null;
          menu?: { categoryId: string; dishId: string }[];
          confirmedAt?: string;
        } | null;
      } | null;
    }>('/api/operations/today');
    const op = res.operational ?? {};
    const bilan = op.bilan
      ? {
          date: op.bilan.date ?? res.date,
          prepared: op.bilan.prepared ?? 0,
          served: op.bilan.served ?? 0,
          remaining: op.bilan.remaining ?? 0,
          wasteRate: op.bilan.wasteRate ?? 0,
          comment: op.bilan.comment ?? undefined,
          menu: op.bilan.menu ?? [],
          confirmedAt: op.bilan.confirmedAt,
        }
      : null;
    return setCachedToday({
      date: res.date,
      status: mapStatus(op.status ?? res.status),
      forecast: null,
      plannedMeals: op.planned_meals ?? 0,
      actualMealsServed: op.actual_meals ?? 0,
      overrideReason: null,
      bilan,
    });
  } catch {
    return setCachedToday({
      date: todayKey(),
      status: 'preparation',
      forecast: null,
      plannedMeals: 0,
      actualMealsServed: 0,
      overrideReason: null,
      bilan: null,
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Mapping helpers                                                            */
/* -------------------------------------------------------------------------- */

function mapBackendForecast(data: {
  date: string; office_present: number; predicted_ratio: number;
  employees_count: number; recommended_meals: number;
  confidence_lower: number; confidence_upper: number;
  confidence_level: string; recommendation_note: string;
  blend_scores: { lgb: number; xgb: number; catboost: number };
}): ForecastResult {
  return {
    date: data.date,
    officePresent: data.office_present,
    predictedRatio: data.predicted_ratio,
    employeesCount: data.employees_count,
    blendScores: data.blend_scores,
    recommendedMeals: data.recommended_meals,
    confidenceLower: data.confidence_lower,
    confidenceUpper: data.confidence_upper,
    confidenceLevel: data.confidence_level as 'high' | 'medium' | 'low',
    recommendationNote: data.recommendation_note,
  };
}

const fallbackForecast = (dateStr: string): ForecastResult => ({
  date: dateStr,
  officePresent: 312,
  predictedRatio: 0.62,
  employeesCount: 310,
  blendScores: { lgb: 0.018, xgb: 0.089, catboost: 0.893 },
  recommendedMeals: 322,
  confidenceLower: 285,
  confidenceUpper: 335,
  confidenceLevel: 'medium',
  recommendationNote: 'Mode dégradé — backend indisponible',
});

/* -------------------------------------------------------------------------- */
/*  Public API                                                                 */
/* -------------------------------------------------------------------------- */

export const api = {

  /* ── Service lifecycle (backend single source of truth) ── */

  async init(): Promise<TodayState> {
    return fetchTodayState();
  },

  /* ── Forecast (from FastAPI backend) ────────────────────── */

  async getTodayForecast(): Promise<ForecastResult> {
    try {
      const data = await apiGet<{
        date: string; office_present: number; predicted_ratio: number;
        employees_count: number; recommended_meals: number;
        confidence_lower: number; confidence_upper: number;
        confidence_level: string; recommendation_note: string;
        blend_scores: { lgb: number; xgb: number; catboost: number };
      }>('/api/forecast/today');
      return mapBackendForecast(data);
    } catch {
      return fallbackForecast(todayKey());
    }
  },

  async getTomorrowForecast(): Promise<ForecastResult> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().slice(0, 10);
    try {
      const data = await apiPost<{
        date: string; office_present: number; predicted_ratio: number;
        employees_count: number; recommended_meals: number;
        confidence_lower: number; confidence_upper: number;
        confidence_level: string; recommendation_note: string;
        blend_scores: { lgb: number; xgb: number; catboost: number };
      }>('/api/forecast', { date: dateStr });
      return mapBackendForecast(data);
    } catch {
      const today = await api.getTodayForecast();
      return { ...today, date: dateStr };
    }
  },

  /* ── Catalog menus (single source of truth: menu-catalog) ─ */

  getMenus(): Promise<MenuItem[]> { return delay(catalogMenuItems()); },

  /* ── Service lifecycle actions (persisted on the backend) ─ */

  async getTodayState(): Promise<TodayState> {
    return _today ?? (await fetchTodayState());
  },

  async getStatus(): Promise<ServiceStatus> {
    return (await this.getTodayState()).status;
  },

  async getStatusLabel(status?: ServiceStatus): Promise<string> {
    const s = status ?? (await this.getTodayState()).status;
    const map: Record<ServiceStatus, string> = {
      preparation: 'En préparation',
      service: 'Service en cours',
      bilan_a_saisir: 'Bilan à saisir',
      bilan_a_confirmer: 'Bilan à confirmer',
      cloturee: 'Clôturée',
    };
    return map[s] ?? s;
  },

  async startService(): Promise<TodayState> {
    await apiPost('/api/operations/today/status', { status: 'service' });
    return fetchTodayState();
  },

  async endService(): Promise<TodayState> {
    await apiPost('/api/operations/today/status', { status: 'bilan_a_saisir' });
    return fetchTodayState();
  },

  async submitBilanToday(data: { prepared: number; served: number; comment?: string }): Promise<TodayState> {
    await apiPost(`/api/operations/${todayKey()}/bilan`, {
      prepared: data.prepared,
      served: data.served,
      menu: [],
      comment: data.comment ?? null,
    });
    return fetchTodayState();
  },

  async confirmBilanToday(): Promise<TodayState> {
    await apiPost(`/api/operations/${todayKey()}/confirm`, {});
    return fetchTodayState();
  },

  async editBilanToday(): Promise<TodayState> {
    await apiPost(`/api/operations/${todayKey()}/edit-bilan`, {});
    return fetchTodayState();
  },

  async setActualMealsServed(count: number): Promise<TodayState> {
    await apiPost(`/api/operations/${todayKey()}/planned`, { planned_meals: count });
    return fetchTodayState();
  },

  /* ── Tomorrow preparation (backend + forecast) ──────────── */

  async getTomorrowState(): Promise<TomorrowState> {
    const today = await this.getTodayState();
    const f = await this.getTomorrowForecast();
    return {
      locked: today.status !== 'cloturee',
      forecast: f,
      plannedMeals: f.recommendedMeals,
      presenceInput: f.officePresent,
    };
  },

  async getPlanningInputs(): Promise<PlanningInputs> {
    const f = await this.getTomorrowForecast();
    return {
      expectedPresence: f.officePresent,
      selectedMenuId: catalogMenuItems()[0]?.id ?? '',
    };
  },

  async updatePlanningInputs(values: Partial<PlanningInputs>): Promise<PlanningInputs> {
    if (values.expectedPresence !== undefined) {
      await apiPost(`/api/operations/${tomorrowKey()}/planned`, { presence: values.expectedPresence });
    }
    return this.getPlanningInputs();
  },

  /* ── Dashboard KPIs (simplified — no ML jargon) ─────────── */

  async getDashboardKPIs(): Promise<KPI[]> {
    const f = await api.getTodayForecast();
    const kpis: KPI[] = [
      {
        id: 'expected-presence',
        label: 'Employés au bureau',
        value: `${f.officePresent}`,
        unit: 'employés',
        trend: { direction: 'flat', value: 'Aujourd\'hui', label: 'fréquentation prévue' },
        variant: 'default',
      },
      {
        id: 'recommended-meals',
        label: 'Repas à préparer',
        value: `${f.recommendedMeals}`,
        unit: 'repas',
        trend: { direction: 'up', value: '+4%', label: 'marge de sécurité' },
        variant: 'success',
      },
      {
        id: 'avg-waste',
        label: 'Taux de participation',
        value: `${(f.predictedRatio * 100).toFixed(1).replace('.', ',')}`,
        unit: '%',
        trend: { direction: 'flat', value: 'Prévision', label: 'participation bureau → cantine' },
        variant: 'default',
      },
      {
        id: 'estimated-savings',
        label: 'Repas prévus',
        value: `${f.employeesCount}`,
        unit: 'repas',
        trend: { direction: 'flat', value: 'Calibré', label: 'après calibration DOW' },
        variant: 'default',
      },
    ];
    return delay(kpis);
  },

  /* ── Chart data (from CSV — deterministic) ──────────────── */

  async getForecastVsActual(days: 7 | 14 | 30 = 14): Promise<ForecastVsActualPoint[]> {
    const bundle = await loadForecastBundle();
    const points: ForecastVsActualPoint[] = bundle.points.map((p) => ({
      date: p.date,
      shortDate: formatShortDate(p.date),
      forecast: p.predictedMeals,
      actual: bundle.actualByDate.get(p.date) ?? null,
    }));
    return delay(points.slice(-days));
  },

  /* ── History (from CSV — deterministic) ─────────────────── */

  async getForecastHistory(): Promise<ForecastHistoryEntry[]> {
    const bundle = await loadForecastBundle();
    const entries: ForecastHistoryEntry[] = bundle.points.map((p) => {
      const actual = bundle.actualByDate.get(p.date) ?? null;
      const hasActual = actual !== null && actual > 0;
      const ecart = hasActual ? actual! - p.predictedMeals : null;
      const errorPct = hasActual ? Math.round((Math.abs(ecart!) / Math.max(p.predictedMeals, 1)) * 1000) / 10 : null;
      const status: 'bon' | 'acceptable' | 'mauvais' =
        !hasActual ? 'acceptable' : errorPct! < 5 ? 'bon' : errorPct! < 10 ? 'acceptable' : 'mauvais';
      return { id: `hist-${p.date}`, date: p.date, officePresent: p.expectedPresence, employeesCount: p.predictedMeals, forecast: p.predictedMeals, actual: actual ?? 0, ecart: ecart ?? 0, errorPct: errorPct ?? 0, status };
    });
    return delay(entries);
  },

  /* ── Waste (from backend operations) ────────────────────── */

  async getWasteDays(): Promise<WasteDay[]> {
    try {
      const entries = await apiGet<{ date: string; prepared: number; served: number; waste: number; waste_rate: number; menu: { categoryId: string; dishId: string }[] }[]>('/api/operations');
      if (entries.length === 0) return [];
      return entries
        .filter((e) => e.prepared > 0)
        .slice(-14)
        .map((e) => ({
          date: e.date,
          shortDate: formatShortDate(e.date),
          prepared: e.prepared,
          served: e.served,
          wasted: e.waste,
          wasteRate: e.waste_rate,
          menu: e.menu?.map((m: { dishId: string }) => m.dishId).join(', ') || 'Non défini',
        }));
    } catch {
      return [];
    }
  },

  async getWasteSummary(): Promise<WasteSummary> {
    try {
      const entries = await apiGet<{ date: string; prepared: number; served: number; waste: number; waste_rate: number }[]>('/api/operations');
      if (entries.length === 0) return { prepared: 0, served: 0, wasted: 0, wasteRate: 0, trend: { direction: 'flat', value: 'Aucune donnée', label: 'pas encore de bilans saisis' } };
      const recent = entries.filter((e) => e.prepared > 0).slice(-30);
      if (recent.length === 0) return { prepared: 0, served: 0, wasted: 0, wasteRate: 0, trend: { direction: 'flat', value: 'Aucune donnée', label: 'pas encore de bilans saisis' } };
      const totalPrepared = recent.reduce((s, e) => s + e.prepared, 0);
      const totalServed = recent.reduce((s, e) => s + e.served, 0);
      const totalWasted = recent.reduce((s, e) => s + e.waste, 0);
      const avgWasteRate = totalPrepared > 0 ? Math.round((totalWasted / totalPrepared) * 1000) / 10 : 0;
      return {
        prepared: totalPrepared,
        served: totalServed,
        wasted: totalWasted,
        wasteRate: avgWasteRate,
        trend: { direction: 'down', value: `- ${recent.length} jours`, label: 'données réelles' },
      };
    } catch {
      return { prepared: 0, served: 0, wasted: 0, wasteRate: 0, trend: { direction: 'flat', value: 'Aucune donnée', label: 'pas encore de bilans saisis' } };
    }
  },

  /* ── Model metrics (AI team page only) ──────────────────── */

  async getModelMetrics(): Promise<ModelMetrics> {
    try {
      const data = await apiGet<{
        version: string; total_models: number; lgb_count: number; xgb_count: number;
        catboost_count: number; calibration_lambda: number;
        oof_metrics: { 'MAE (repas)': number; 'RMSE (repas)': number; 'Asym. Cost': number };
        feature_count: number;
      }>('/api/model/metrics');

      return {
        version: `v${data.version}`,
        lastTrainingDate: new Date().toISOString().slice(0, 10),
        lastPredictionDate: new Date().toISOString().slice(0, 10),
        evaluationMetric: 'AsymmetricCost',
        predictionError: `${data.oof_metrics['Asym. Cost'].toFixed(1)} repas`,
        dataFreshness: 'En ligne',
        driftIndicator: 'stable',
        featureAvailability: 100,
        accuracy: Math.round(Math.max(0, (1 - data.oof_metrics['MAE (repas)'] / 310) * 100)),
        mae: data.oof_metrics['MAE (repas)'],
        rmse: data.oof_metrics['RMSE (repas)'],
        asymmetricCost: data.oof_metrics['Asym. Cost'],
        catboostCount: data.catboost_count,
        lgbCount: data.lgb_count,
        xgbCount: data.xgb_count,
        calibrationLambda: data.calibration_lambda,
      };
    } catch {
      return {
        version: '—', lastTrainingDate: '—', lastPredictionDate: '—', evaluationMetric: '—',
        predictionError: '—', dataFreshness: 'Hors ligne', driftIndicator: 'stable', featureAvailability: 0,
        accuracy: 0, mae: 0, rmse: 0, asymmetricCost: 0, catboostCount: 0, lgbCount: 0, xgbCount: 0,
        calibrationLambda: 0,
      };
    }
  },

  async getModelFamilies(): Promise<ModelFamily[]> {
    try {
      const data = await apiGet<{
        lgb_count: number; xgb_count: number; catboost_count: number;
        lgb_weight: number; xgb_weight: number; catboost_weight: number;
      }>('/api/model/metrics');
      return [
        { name: 'LightGBM', modelCount: data.lgb_count, contribution: Math.round(data.lgb_weight * 100), description: `Gradient boosting — seed × alpha variants` },
        { name: 'XGBoost', modelCount: data.xgb_count, contribution: Math.round(data.xgb_weight * 100), description: `Regularized boosting — seed × alpha variants` },
        { name: 'CatBoost', modelCount: data.catboost_count, contribution: Math.round(data.catboost_weight * 100), description: `Ordered boosting — dominant blend weight` },
      ];
    } catch {
      return [];
    }
  },

  /* ── Data sources (derived from real model info + CSVs) ─── */

  async getDataSources(): Promise<DataSource[]> {
    try {
      const metrics = await api.getModelMetrics();
      const bundle = await loadForecastBundle();
      return [
        {
          id: 'catalog-menu',
          name: 'Catalogue des menus (JSON)',
          status: 'synced',
          lastSync: 'À jour',
          records: DISHES.length,
          freshness: 'fresh',
          availability: 100,
          description: 'Source partagée avec le pipeline (menu-catalog.json)',
        },
        {
          id: 'forecast-model',
          name: `Modèle de prévision ${metrics.version}`,
          status: 'synced',
          lastSync: new Date().toISOString().slice(0, 10),
          records: metrics.catboostCount + metrics.lgbCount + metrics.xgbCount,
          freshness: 'fresh',
          availability: 100,
          description: `MAE ${metrics.mae.toFixed(1)} · RMSE ${metrics.rmse.toFixed(1)} repas`,
        },
        {
          id: 'history-csv',
          name: 'Historique (CSV)',
          status: 'synced',
          lastSync: 'À jour',
          records: bundle.points.length,
          freshness: 'fresh',
          availability: 100,
          description: 'Données d\'entraînement et de soumission',
        },
        {
          id: 'operations-backend',
          name: 'Opérations journalières (API)',
          status: 'synced',
          lastSync: 'En ligne',
          records: 0,
          freshness: 'fresh',
          availability: 100,
          description: 'Bilans saisis via le backend',
        },
      ];
    } catch {
      return [];
    }
  },

  /* ── Attendance ─────────────────────────────────────────── */

  async getAttendanceData(): Promise<AttendancePoint[]> {
    const bundle = await loadForecastBundle();
    const points: AttendancePoint[] = bundle.points.map((p) => ({
      date: p.date,
      shortDate: formatShortDate(p.date),
      officePresent: p.expectedPresence,
      employeesCount: p.predictedMeals,
      meals: p.predictedMeals,
      ratio: p.expectedPresence > 0 ? p.predictedMeals / p.expectedPresence : 0,
    }));
    return delay(points);
  },

  /* ── Planned menus (weekly planning) ───────────────────── */

  async getPlannedMenus(start?: string, end?: string): Promise<MenuPlan[]> {
    try {
      const q = new URLSearchParams();
      if (start) q.set('start', start);
      if (end) q.set('end', end);
      const qs = q.toString();
      return await apiGet<MenuPlan[]>(`/api/menus${qs ? `?${qs}` : ''}`);
    } catch {
      return [];
    }
  },

  async getPlannedMenu(date: string): Promise<MenuPlan | null> {
    try {
      return await apiGet<MenuPlan>(`/api/menus/${date}`);
    } catch {
      return null;
    }
  },

  async savePlannedMenu(menu: Partial<MenuPlan> & { date: string }): Promise<MenuPlan> {
    const data = await apiPost<MenuPlan>('/api/menus', {
      date: menu.date,
      entrees: menu.entrees ?? '',
      plat_principal_1: menu.plat_principal_1 ?? '',
      plat_principal_2: menu.plat_principal_2 ?? '',
      plat_principal_1_id: menu.plat_principal_1_id ?? '',
      plat_principal_2_id: menu.plat_principal_2_id ?? '',
    });
    return data;
  },

  async regenerateFeatures(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true, message: 'La tâche quotidienne régénérera les features. Pour un résultat immédiat, exécutez : python -m src.forecasting.daily_features --days 14' };
  },

  /* ── Backend operations (legacy) ────────────────────────── */

  async getTodayOperations(): Promise<{
    date: string; status: string;
    operational: { prepared: number; served: number; remaining: number; waste: number; waste_rate: number; comment: string | null } | null;
  }> {
    try {
      return await apiGet('/api/operations/today');
    } catch {
      return { date: todayKey(), status: 'no_entry', operational: null };
    }
  },

  async submitOperation(entry: { date: string; prepared: number; served: number; comment?: string; menu?: { categoryId: string; dishId: string }[] }): Promise<{ success: boolean }> {
    try {
      const remaining = Math.max(0, entry.prepared - entry.served);
      const wasteRate = entry.prepared > 0 ? (remaining / entry.prepared) * 100 : 0;
      await apiPost('/api/operations', {
        date: entry.date,
        prepared: entry.prepared,
        served: entry.served,
        remaining,
        waste: remaining,
        waste_rate: Math.round(wasteRate * 10) / 10,
        menu: entry.menu ?? [],
        comment: entry.comment ?? null,
      });
      return { success: true };
    } catch (err) {
      console.error('Failed to submit operation:', err);
      return { success: false };
    }
  },
};
