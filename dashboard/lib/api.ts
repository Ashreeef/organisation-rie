'use client';

/**
 * API layer — single entry point for all data.
 *
 * Operational data (today/tomorrow/bilan) → service-store (localStorage)
 * Forecast data → FastAPI backend, with mock fallback
 * Charts/history → CSV files (train.csv, submission.csv)
 * Other domains → mock-data.ts
 */

import {
  operationalAlerts,
  wasteDays,
  wasteSummary,
  menuItems,
  weeklyMenuPlan,
  procurementItems,
  procurementSummary,
  modelMetrics,
  modelFamilies,
  dataSources,
  financialKPIs,
  reportTemplates,
} from '@/lib/mock-data';
import type {
  ForecastResult,
  PlanningInputs,
  KPI,
  ForecastVsActualPoint,
  OperationalAlert,
  WasteDay,
  WasteSummary,
  MenuItem,
  ProcurementItem,
  ProcurementSummary,
  ForecastHistoryEntry,
  ModelMetrics,
  ModelFamily,
  DataSource,
  FinancialKPI,
  AttendancePoint,
  ReportTemplate,
  WasteEntry,
  Dish,
  DishCategory,
  MenuElement,
} from '@/lib/types';
import {
  initStore,
  todayKey,
  getStatusLabel,
  setActualMeals,
  setPlannedMeals,
  setTodayMenu,
  submitBilan,
  confirmBilan,
  advanceStatus,
  type ServiceStore,
  type ServiceStatus,
  type TodayState,
} from '@/lib/service-store';

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
/*  Store access (init on first call)                                          */
/* -------------------------------------------------------------------------- */

let _store: ServiceStore | null = null;

function getStore(): ServiceStore {
  if (!_store) _store = initStore();
  return _store;
}

function updateStore(updater: (s: ServiceStore) => ServiceStore): ServiceStore {
  _store = updater(getStore());
  return _store;
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

  /* ── Store init ─────────────────────────────────────────── */

  init(): ServiceStore {
    return getStore();
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

  /* ── Today operations (via service-store) ───────────────── */

  getTodayState(): TodayState {
    return getStore().today;
  },

  getStatus(): ServiceStatus {
    return getStore().today.status;
  },

  getStatusLabel(): string {
    return getStatusLabel(getStore().today.status);
  },

  async startService(): Promise<TodayState> {
    updateStore((s) => advanceStatus(s, 'service'));
    return getStore().today;
  },

  async endService(): Promise<TodayState> {
    updateStore((s) => advanceStatus(s, 'bilan_a_saisir'));
    return getStore().today;
  },

  async submitBilanToday(data: { prepared: number; served: number; comment?: string }): Promise<TodayState> {
    const remaining = Math.max(0, data.prepared - data.served);
    const wasteRate = data.prepared > 0 ? (remaining / data.prepared) * 100 : 0;
    updateStore((s) =>
      submitBilan(s, {
        date: todayKey(),
        prepared: data.prepared,
        served: data.served,
        remaining,
        wasteRate: Math.round(wasteRate * 10) / 10,
        comment: data.comment,
        menu: [],
      })
    );
    return getStore().today;
  },

  async confirmBilanToday(): Promise<TodayState> {
    updateStore((s) => confirmBilan(s));
    return getStore().today;
  },

  async editBilanToday(): Promise<TodayState> {
    updateStore((s) => advanceStatus(s, 'bilan_a_saisir'));
    return getStore().today;
  },

  setActualMealsServed(count: number): void {
    updateStore((s) => setActualMeals(s, count));
  },

  /* ── Tomorrow preparation (via service-store) ───────────── */

  async getTomorrowState() {
    return getStore().tomorrow;
  },

  async updateTomorrowInputs(patch: { presence?: number; menuId?: string }): Promise<PlanningInputs> {
    const store = getStore();
    if (store.tomorrow.locked) {
      return { expectedPresence: store.tomorrow.presenceInput, selectedMenuId: store.tomorrow.menu?.id ?? '' };
    }
    if (patch.presence !== undefined) {
      updateStore((s) => {
        const updated = { ...s, tomorrow: { ...s.tomorrow, presenceInput: patch.presence! } };
        localStorage.setItem('rie-service-store', JSON.stringify(updated));
        return updated;
      });
    }
    if (patch.menuId) {
      const menus = menuItems;
      const selected = menus.find((m) => m.id === patch.menuId) ?? null;
      updateStore((s) => {
        const updated = { ...s, tomorrow: { ...s.tomorrow, menu: selected } };
        localStorage.setItem('rie-service-store', JSON.stringify(updated));
        return updated;
      });
    }
    return { expectedPresence: getStore().tomorrow.presenceInput, selectedMenuId: getStore().tomorrow.menu?.id ?? '' };
  },

  async getPlanningInputs(): Promise<PlanningInputs> {
    const store = getStore();
    return {
      expectedPresence: store.tomorrow.presenceInput || 487,
      selectedMenuId: store.tomorrow.menu?.id ?? menuItems.find((m) => m.isRecommended)?.id ?? '',
    };
  },

  async updatePlanningInputs(values: Partial<PlanningInputs>): Promise<PlanningInputs> {
    const store = getStore();
    if (values.expectedPresence !== undefined) {
      updateStore((s) => {
        const updated = { ...s, tomorrow: { ...s.tomorrow, presenceInput: values.expectedPresence! } };
        localStorage.setItem('rie-service-store', JSON.stringify(updated));
        return updated;
      });
    }
    if (values.selectedMenuId) {
      const selected = menuItems.find((m) => m.id === values.selectedMenuId) ?? null;
      updateStore((s) => {
        const updated = { ...s, tomorrow: { ...s.tomorrow, menu: selected } };
        localStorage.setItem('rie-service-store', JSON.stringify(updated));
        return updated;
      });
    }
    return { expectedPresence: getStore().tomorrow.presenceInput, selectedMenuId: getStore().tomorrow.menu?.id ?? '' };
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

  /* ── Alerts ─────────────────────────────────────────────── */

  getAlerts(): Promise<OperationalAlert[]> { return delay(operationalAlerts); },

  /* ── Waste ─────────────────────────────────────────────── */

  getWasteDays(): Promise<WasteDay[]> { return delay(wasteDays); },
  getWasteSummary(): Promise<WasteSummary> { return delay(wasteSummary); },
  submitWasteEntry(entry: WasteEntry): Promise<{ success: boolean }> {
    console.log('[mock] Waste entry submitted:', entry);
    return delay({ success: true });
  },

  /* ── Menus ──────────────────────────────────────────────── */

  getMenus(): Promise<MenuItem[]> { return delay(menuItems); },
  getWeeklyMenuPlan(): Promise<{ day: string; menuId: string; menuName: string }[]> { return delay(weeklyMenuPlan); },

  /* ── Procurement ────────────────────────────────────────── */

  getProcurementItems(): Promise<ProcurementItem[]> { return delay(procurementItems); },
  getProcurementSummary(): Promise<ProcurementSummary> { return delay(procurementSummary); },
  generateOrder(): Promise<{ orderId: string; totalCost: number }> {
    return delay({ orderId: `CMD-${Date.now()}`, totalCost: procurementSummary.totalCost });
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
    } catch { return modelMetrics; }
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
    } catch { return modelFamilies; }
  },

  /* ── Data sources ───────────────────────────────────────── */

  getDataSources(): Promise<DataSource[]> { return delay(dataSources); },

  /* ── Financial ──────────────────────────────────────────── */

  getFinancialKPIs(): Promise<FinancialKPI> { return delay(financialKPIs); },

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

  /* ── Reports ────────────────────────────────────────────── */

  getReportTemplates(): Promise<ReportTemplate[]> { return delay(reportTemplates); },
  generateReport(reportId: string): Promise<{ url: string }> {
    console.log('[mock] Report generated:', reportId);
    return delay({ url: `#mock-report-${reportId}` });
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

  async submitOperation(entry: { date: string; prepared: number; served: number; comment?: string; menu?: MenuElement[] }): Promise<{ success: boolean }> {
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

  /* ── Dishes & categories ────────────────────────────────── */

  getDishes(): Promise<Dish[]> {
    const defaultDishes: Dish[] = [
      { id: 'dish-salade', name: 'Salade / Soupe', categoryId: 'entree', active: true },
      { id: 'dish-escalope', name: 'Escalope grillée', categoryId: 'plat-principal', active: true },
      { id: 'dish-escalope-panne', name: 'Escalope pannée sauce piquante', categoryId: 'plat-principal', active: true },
      { id: 'dish-puree', name: 'Pomme purée', categoryId: 'accompagnement', active: true },
      { id: 'dish-spaghetti', name: 'Spaghetti bolognaise', categoryId: 'plat-principal', active: true, historicalPopularity: 81, wasteRate: 7.8 },
      { id: 'dish-poulet', name: 'Poulet rôti', categoryId: 'plat-principal', active: true, historicalPopularity: 92, wasteRate: 4.2 },
      { id: 'dish-rechta', name: 'Rechta', categoryId: 'accompagnement', active: true, historicalPopularity: 90, wasteRate: 4.2 },
    ];
    return delay(defaultDishes);
  },

  getDishCategories(): Promise<DishCategory[]> {
    const defaultCategories: DishCategory[] = [
      { id: 'entree', name: 'Entrée' },
      { id: 'plat-principal', name: 'Plat principal' },
      { id: 'accompagnement', name: 'Accompagnement' },
      { id: 'dessert', name: 'Dessert' },
      { id: 'soupe', name: 'Soupe' },
      { id: 'salade', name: 'Salade' },
      { id: 'boisson', name: 'Boisson' },
      { id: 'autre', name: 'Autre' },
    ];
    return delay(defaultCategories);
  },

  addDish(dish: Omit<Dish, 'id' | 'active' | 'isNew'>): Promise<Dish> {
    return delay({ ...dish, id: `dish-${Date.now()}`, active: true, isNew: true });
  },

  addDishCategory(name: string): Promise<DishCategory> {
    return delay({ id: `category-${Date.now()}`, name: name.trim() });
  },

  getDailyMenu(): Promise<MenuElement[]> {
    return delay([
      { categoryId: 'entree', dishId: 'dish-salade' },
      { categoryId: 'plat-principal', dishId: 'dish-escalope' },
      { categoryId: 'accompagnement', dishId: 'dish-puree' },
    ]);
  },

  saveDailyMenu(items: MenuElement[]): Promise<MenuElement[]> {
    return delay(items);
  },
};
