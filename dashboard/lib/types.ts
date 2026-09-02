// Core domain types for the RIE Intelligence platform.
// Reflects the two-stage cascade ML pipeline:
//   Stage 1 (sub-model): office_present 7 days ahead
//   Stage 2 (main model): employees_count using predicted office_present

export type TrendDirection = 'up' | 'down' | 'flat';

export interface Trend {
  direction: TrendDirection;
  value: string;
  label: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ForecastResult {
  date: string;
  // Whether a valid forecast exists for this date (a menu must be planned).
  forecastAvailable: boolean;
  // Human-readable reason when forecastAvailable is false.
  unavailableReason?: string | null;
  // Stage 1: sub-model prediction
  officePresent: number;
  // Stage 2: main model prediction (pre-calibration ratio)
  predictedRatio: number;
  // Stage 2: calibrated employee count
  employeesCount: number;
  // Blend component scores
  blendScores: { lgb: number; xgb: number; catboost: number };
  // Operational recommendation
  recommendedMeals: number;
  confidenceLower: number;
  confidenceUpper: number;
  confidenceLevel: ConfidenceLevel;
  recommendationNote: string;
}

// A forecast that could not be produced (e.g. no planned menu for the date).
export const noForecast = (date: string, reason?: string | null): ForecastResult => ({
  date,
  forecastAvailable: false,
  unavailableReason: reason ?? null,
  officePresent: 0,
  predictedRatio: 0,
  employeesCount: 0,
  blendScores: { lgb: 0, xgb: 0, catboost: 0 },
  recommendedMeals: 0,
  confidenceLower: 0,
  confidenceUpper: 0,
  confidenceLevel: 'low',
  recommendationNote: '',
});

export interface KPI {
  id: string;
  label: string;
  value: string;
  unit?: string;
  trend?: Trend;
  icon?: string;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}

export interface ForecastVsActualPoint {
  date: string;
  shortDate: string;
  forecast: number | null;
  actual: number | null;
  prepared: number | null;
}

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export interface OperationalAlert {
  id: string;
  severity: AlertSeverity;
  title: string;
  explanation: string;
  recommendedAction: string;
}

export interface WasteDay {
  date: string;
  shortDate: string;
  prepared: number;
  served: number;
  wasted: number;
  wasteRate: number;
  menu: string;
}

export interface WasteSummary {
  prepared: number;
  served: number;
  wasted: number;
  wasteRate: number;
  trend: Trend;
}

export interface ForecastHistoryEntry {
  id: string;
  date: string;
  officePresent: number;
  employeesCount: number;
  forecast: number;
  actual: number;
  ecart: number | null;
  errorPct: number | null;
  hasForecast: boolean;
  status: 'bon' | 'acceptable' | 'mauvais';
}

export interface ModelMetrics {
  version: string;
  lastTrainingDate: string;
  lastPredictionDate: string;
  evaluationMetric: string;
  predictionError: string;
  dataFreshness: string;
  driftIndicator: 'stable' | 'modere' | 'eleve';
  featureAvailability: number;
  accuracy: number;
  mae: number;
  rmse: number;
  asymmetricCost: number;
  catboostCount: number;
  lgbCount: number;
  xgbCount: number;
  calibrationLambda: number;
}

export interface ModelFamily {
  name: string;
  modelCount: number;
  contribution: number;
  description: string;
}

export interface DataSource {
  id: string;
  name: string;
  status: 'synced' | 'syncing' | 'delayed' | 'error';
  lastSync: string;
  records: number;
  freshness: 'fresh' | 'stale' | 'stale-warning';
  availability: number;
  description: string;
}

export interface AttendancePoint {
  date: string;
  shortDate: string;
  officePresent: number;
  employeesCount: number;
  meals: number;
  ratio: number;
}

export type ServiceStatus =
  | 'preparation'
  | 'service'
  | 'bilan_a_saisir'
  | 'bilan_a_confirmer'
  | 'cloturee';

export interface MenuElement {
  categoryId: string;
  dishId: string;
}

export interface BilanRecord {
  date: string;
  prepared: number;
  served: number;
  remaining: number;
  wasteRate: number;
  comment?: string;
  menu: MenuElement[];
  confirmedAt?: string;
}

export interface TodayState {
  date: string; // YYYY-MM-DD
  status: ServiceStatus;
  forecast: ForecastResult | null;
  plannedMeals: number;
  actualMealsServed: number;
  overrideReason: string | null;
  bilan: BilanRecord | null;
}

export interface OperationalEntry {
  id: string;
  date: string;
  presence: number;
  forecast: number;
  actual: number;
  menu: string;
  status: string;
  bilan?: BilanRecord | null;
}

export interface MenuPlan {
  date: string;
  entrees: string;
  plat_principal_1: string;
  plat_principal_2: string;
  plat_principal_1_id?: string;
  plat_principal_2_id?: string;
}

export interface ServiceDay {
  date: string;
  status: ServiceStatus;
  employeesExpected: number;
  employeesPresent?: number;
  mealsPrepared?: number;
  mealsServed?: number;
  mealsRemaining?: number;
  waste?: number;
  managerComment?: string;
  menu: MenuElement[];
  confirmedAt?: string;
  confirmedBy?: string;
}

export interface DailyCycle {
  service: ServiceDay;
  tomorrowUnlocked: boolean;
}

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  description?: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}
