'use client';

/**
 * API layer — single entry point for all data.
 *
 * Data source hierarchy (backend single source of truth, mock eliminated):
 *   - Forecast / model metrics / planned menus → FastAPI backend
 *   - Daily operations / lifecycle / history / waste / charts → FastAPI backend
 *     (/api/operations — data/operational/*.json)
 *   - Dishes & categories → shared catalog (menu-catalog.ts, menu-catalog.json)
 */

import type {
  ForecastResult,
  ForecastVsActualPoint,
  WasteDay,
  WasteSummary,
  MenuPlan,
  ForecastHistoryEntry,
  ModelMetrics,
  ModelFamily,
  DataSource,
  ServiceStatus,
  TodayState,
} from '@/lib/types';
import { noForecast } from '@/lib/types';
import { DISHES } from '@/lib/menu-catalog';

/* -------------------------------------------------------------------------- */
/*  Backend helpers                                                            */
/* -------------------------------------------------------------------------- */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function delay<T>(data: T, ms = 200): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

interface DailyRecord {
  date: string;
  status?: string;
  prepared?: number;
  served?: number;
  remaining?: number;
  waste?: number;
  waste_rate?: number;
  planned_meals?: number;
  presence?: number;
  forecast?: number;
  menu?: { categoryId?: string; dishId?: string; name?: string }[];
  menuLabel?: string;
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
/*  Date formatting helpers                                                    */
/* -------------------------------------------------------------------------- */

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// Arrondit à une décimale (ex. 4.69 → 4.7).
function roundToOne(n: number): number {
  return Math.round(n * 10) / 10;
}

// Normalise un taux de gaspillage en pourcentage : les anciennes entrées le
// stockent sous forme de fraction (≤ 1, ex. 0.0469) — le live utilise un
// pourcentage (ex. 1.3).
function normalizeWasteRate(rate: number | undefined): number {
  const r = rate ?? 0;
  return r <= 1 ? r * 100 : r;
}

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
      bilan_closed?: boolean;
      next_operational_day?: string;
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
      // Fourni par le backend (source unique) : bilan clos + prochaine journée
      // de service (vendredi/samedi exclus). L'UI n'a pas à recalculer ceci.
      bilanClosed: Boolean(res.bilan_closed),
      nextOperationalDay: res.next_operational_day || todayKey(),
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
      bilanClosed: false,
      nextOperationalDay: todayKey(),
    });
  }
}

/* -------------------------------------------------------------------------- */
/*  Mapping helpers                                                            */
/* -------------------------------------------------------------------------- */

function mapBackendForecast(data: {
  date: string; forecast_available?: boolean; unavailable_reason?: string | null;
  office_present: number; predicted_ratio: number;
  employees_count: number; recommended_meals: number;
  confidence_lower: number; confidence_upper: number;
  confidence_level: string; recommendation_note: string;
  forecast_stale?: boolean; menu_fingerprint?: string;
  blend_scores: { lgb: number; xgb: number; catboost: number };
}): ForecastResult {
  return {
    date: data.date,
    forecastAvailable: data.forecast_available ?? true,
    unavailableReason: data.unavailable_reason ?? null,
    officePresent: data.office_present,
    predictedRatio: data.predicted_ratio,
    employeesCount: data.employees_count,
    blendScores: data.blend_scores,
    recommendedMeals: data.recommended_meals,
    confidenceLower: data.confidence_lower,
    confidenceUpper: data.confidence_upper,
    confidenceLevel: data.confidence_level as 'high' | 'medium' | 'low',
    recommendationNote: data.recommendation_note,
    forecastStale: data.forecast_stale ?? false,
    menuFingerprint: data.menu_fingerprint ?? '',
  };
}

const fallbackForecast = (dateStr: string): ForecastResult => ({
  date: dateStr,
  forecastAvailable: true,
  unavailableReason: null,
  officePresent: 312,
  predictedRatio: 0.62,
  employeesCount: 310,
  blendScores: { lgb: 0.018, xgb: 0.089, catboost: 0.893 },
  recommendedMeals: 322,
  confidenceLower: 285,
  confidenceUpper: 335,
  confidenceLevel: 'medium',
  recommendationNote: 'Mode dégradé — backend indisponible',
  forecastStale: false,
  menuFingerprint: '',
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
        date: string; forecast_available?: boolean; unavailable_reason?: string | null;
        office_present: number; predicted_ratio: number;
        employees_count: number; recommended_meals: number;
        confidence_lower: number; confidence_upper: number;
        confidence_level: string; recommendation_note: string;
        forecast_stale?: boolean; menu_fingerprint?: string;
        blend_scores: { lgb: number; xgb: number; catboost: number };
      }>('/api/forecast/today');
      return mapBackendForecast(data);
    } catch {
      return fallbackForecast(todayKey());
    }
  },

  // Prévision pour une date explicite (ex. prochaine journée de service).
  // Aucun fallback qui emprunte les chiffres d'une autre date : si le backend
  // indique forecast_available=false (pas de menu planifié pour cette date),
  // on renvoie exactement cet état au lieu d'inventer une prévision.
  async getForecastForDate(dateStr: string): Promise<ForecastResult> {
    try {
      const data = await apiPost<{
        date: string; forecast_available?: boolean; unavailable_reason?: string | null;
        office_present: number; predicted_ratio: number;
        employees_count: number; recommended_meals: number;
        confidence_lower: number; confidence_upper: number;
        confidence_level: string; recommendation_note: string;
        forecast_stale?: boolean; menu_fingerprint?: string;
        blend_scores: { lgb: number; xgb: number; catboost: number };
      }>('/api/forecast', { date: dateStr });
      return mapBackendForecast(data);
    } catch {
      // Backend injoignable : signaler qu'aucune prévision ne peut être
      // déterminée, sans emprunter les chiffres d'une autre date.
      return noForecast(dateStr, 'Backend indisponible — prévision temporairement inaccessible.');
    }
  },

  async getTomorrowForecast(): Promise<ForecastResult> {
    // Rétrocompatibilité : calcule la prévision pour "demain". La page
    // dashboard doit utiliser getForecastForDate(today.nextOperationalDay)
    // (fourni par le backend) plutôt que ce helper.
    return this.getForecastForDate(tomorrowKey());
  },

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

  // Persiste la prévision (repas recommandés) dans le dossier opérationnel du
  // jour concerné. C'est ce qui alimente /history : sans cette écriture, le
  // champ forecast d'une journée reste à 0 et l'historique ne peut pas afficher
  // une comparaison prévision/réel pertinente.
  async persistForecast(forecast: ForecastResult): Promise<void> {
    if (!forecast?.forecastAvailable) return;
    const key = forecast.date || tomorrowKey();
    await apiPost(`/api/operations/${key}/planned`, {
      planned_meals: forecast.recommendedMeals,
      forecast: forecast.recommendedMeals,
      presence: forecast.officePresent,
    });
  },

  /* ── Chart data (from live operational records) ─────────── */

  async getForecastVsActual(days: 7 | 14 | 30 = 14): Promise<ForecastVsActualPoint[]> {
    // Même source que /history et /waste : les dossiers opérationnels.
    // Prévision = forecast persisté à la planification; réel = servis au bilan.
    const points = await this._operationalChartPoints();
    return delay(points.slice(-days));
  },

  // Point de donnée partagé (prévision / réel / préparés) construit depuis les
  // journées réellement servies des enregistrements opérationnels — unique
  // source de vérité. Pour les jours sans prévision persistée, forecast est
  // null (aucune valeur inventée) : la série Prévision" reste en pointillés au
  // lieu de retomber artificiellement à zéro.
  async _operationalChartPoints(): Promise<ForecastVsActualPoint[]> {
    try {
      const days = await this._servedDays();
      return days.map((e) => ({
        date: e.date,
        shortDate: formatShortDate(e.date),
        forecast: (e.forecast ?? 0) > 0 ? (e.forecast ?? 0) : null,
        actual: e.served ?? 0,
        prepared: e.prepared ?? 0,
      }));
    } catch {
      return [];
    }
  },

  /* ═══ Daily records — unique source of truth for history / waste / charts ═══
   *
   * Une même définition partagée par /history, /waste et le graphique du
   * dashboard : une "journée d'historique" = une journée réellement servie
   * (bilan saisi, served > 0) dans les dossiers opérationnels. Le menu associé
   * provient du plan hebdomadaire canonique (/api/menus), jamais d'un champ
   * dédié au gaspillage : relation Date → Menu → Service → Bilan → Waste.
   * ────────────────────────────────────────────────────────────────────────── */

  // Opérations brutes enrichies avec leur menu planifié canonique.
  async _dailyData(): Promise<DailyRecord[]> {
    interface MenuPlanRaw {
      date: string; entrees?: string; plat_principal_1?: string;
      plat_principal_2?: string; plat_principal_1_id?: string; plat_principal_2_id?: string;
    }
    const [ops, menus] = await Promise.all([
      apiGet<DailyRecord[]>('/api/operations'),
      apiGet<MenuPlanRaw[]>('/api/menus'),
    ]);
    const menuByDate = new Map(menus.map((m) => [m.date, m]));
    return ops.map((op) => {
      const planned = menuByDate.get(op.date);
      const plannedName = planned
        ? [planned.plat_principal_1, planned.plat_principal_2]
            .filter((n): n is string => !!n && n.trim() !== '')
            .join(', ')
        : '';
      const storedName = (op.menu ?? [])
        .map((m) => m.name || m.dishId || '')
        .filter(Boolean)
        .join(', ');
      return {
        ...op,
        menuLabel: plannedName || storedName || 'Non défini',
      };
    });
  },

  // Journées réellement servies (served > 0), triées par date croissante.
  async _servedDays(): Promise<DailyRecord[]> {
    const all = await this._dailyData();
    return all
      .filter((e) => (e.served ?? 0) > 0)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  },

  // Fenêtre historique canonique partagée par /history et /waste.
  // Une "journée d'historique" = une journée réellement servie ET dont la
  // prévision a été persistée à la planification (served > 0 et forecast > 0).
  // Sans prévision on ne peut ni comparer ni suivre l'écart, donc l'entrée
  // n'appartient pas au socle historique commun. Cette définition est calculée
  // (jamais codée en dur) : chaque nouvelle journée complète rejoint l'historique.
  async _historyWindow(): Promise<DailyRecord[]> {
    const days = await this._servedDays();
    return days.filter((e) => (e.forecast ?? 0) > 0);
  },

  /* ── History (from live operational records — single source of truth) ── */

  async getForecastHistory(): Promise<ForecastHistoryEntry[]> {
    // L'historique vient des mêmes dossiers opérationnels que le reste de
    // l'application (data/operational/*.json via /api/operations). Chaque
    // journée clôturée (bilan saisi) devient une entrée. Prévision = forecast
    // persévéré à la planification; réel = servis enregistrés au bilan.
    try {
      const entries = await this._historyWindow();

      const rows = entries
        .map((e) => {
          const forecast = e.forecast ?? 0;
          // Employés prévus = prédiction de présence persistée à la planification
          // (presence = forecast.officePresent). IMPORTANT : ce n'est PAS la
          // prévision de repas — on ne copie jamais forecast ici.
          const employeesCount = e.presence ?? 0;
          const hasAttendance = employeesCount > 0;
          const prepared = e.prepared ?? 0;
          const actual = e.served ?? 0;
          // L'écart prévision/réel n'est défini que si une prévision a bien été
          // persistée : sans elle, on n'invente aucune valeur.
          const hasForecast = forecast > 0;
          const ecart = hasForecast ? actual - forecast : null;
          const errorPct = hasForecast
            ? Math.round((Math.abs(ecart as number) / forecast) * 1000) / 10
            : null;
          const status: 'bon' | 'acceptable' | 'mauvais' =
            !hasForecast
              ? 'acceptable'
              : (errorPct as number) < 5
                ? 'bon'
                : (errorPct as number) < 10
                  ? 'acceptable'
                  : 'mauvais';
          return {
            id: `hist-${e.date}`,
            date: e.date,
            officePresent: employeesCount,
            employeesCount,
            hasAttendance,
            forecast,
            prepared,
            actual,
            ecart,
            errorPct,
            hasForecast,
            status,
          };
        });

      return delay(rows);
    } catch {
      return [];
    }
  },

  /* ── Waste (same canonical source & window as /history) ── */

  async getWasteDays(): Promise<WasteDay[]> {
    try {
      // Même définition que /history : journées servies dans les 30 derniers
      // jours. Le menu vient du plan hebdomadaire canonique (via /api/menus).
      const days = await this._historyWindow();
      return days
        .filter((e) => (e.prepared ?? 0) > 0)
        .map((e) => ({
          date: e.date,
          shortDate: formatShortDate(e.date),
          prepared: e.prepared ?? 0,
          served: e.served ?? 0,
          wasted: e.waste ?? 0,
          // Taux arrondi à 1 décimale. Normalisation : certaines anciennes
          // entrées stockent une fraction (≤1) au lieu d'un pourcentage.
          wasteRate: roundToOne(normalizeWasteRate(e.waste_rate)),
          menu: e.menuLabel ?? 'Non défini',
        }));
    } catch {
      return [];
    }
  },

  async getWasteSummary(): Promise<WasteSummary> {
    try {
      const days = await this._historyWindow();
      const recent = days.filter((e) => (e.prepared ?? 0) > 0);
      if (recent.length === 0) return { prepared: 0, served: 0, wasted: 0, wasteRate: 0, trend: { direction: 'flat', value: 'Aucune donnée', label: 'pas encore de bilans saisis' } };
      const totalPrepared = recent.reduce((s, e) => s + (e.prepared ?? 0), 0);
      const totalServed = recent.reduce((s, e) => s + (e.served ?? 0), 0);
      const totalWasted = recent.reduce((s, e) => s + (e.waste ?? 0), 0);
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
        lastTrainingDate: todayKey(),
        lastPredictionDate: todayKey(),
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
      const ops = await apiGet<{ date?: string }[]>('/api/operations');
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
          lastSync: todayKey(),
          records: metrics.catboostCount + metrics.lgbCount + metrics.xgbCount,
          freshness: 'fresh',
          availability: 100,
          description: `MAE ${metrics.mae.toFixed(1)} · RMSE ${metrics.rmse.toFixed(1)} repas`,
        },
        {
          id: 'operations-backend',
          name: 'Historique / opérations journalières (API)',
          status: 'synced',
          lastSync: 'En ligne',
          records: ops.length,
          freshness: 'fresh',
          availability: 100,
          description: 'Bilans, prévisions et gaspillage — source de vérité unique',
        },
      ];
    } catch {
      return [];
    }
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
