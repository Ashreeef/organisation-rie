// Core domain types for the RIE Intelligence platform.
// These types model the data that would eventually come from a Python/ML backend.

export type TrendDirection = 'up' | 'down' | 'flat';

export interface Trend {
  direction: TrendDirection;
  value: string;
  label: string;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ForecastResult {
  date: string;
  predictedMeals: number;
  confidenceLower: number;
  confidenceUpper: number;
  confidenceLevel: ConfidenceLevel;
  recommendedMeals: number;
  expectedPresence: number;
  attendanceRatio: number;
  recommendationNote: string;
}

export interface PlanningInputs {
  expectedPresence: number;
  selectedMenuId: string;
}

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
  forecast: number;
  actual: number | null;
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

export interface MenuItem {
  id: string;
  name: string;
  category: 'traditionnel' | 'international' | 'leger' | 'special';
  attractiveness: number;
  predictedWaste: number;
  costPerMeal: number;
  score: number;
  description: string;
  ingredients: string[];
  isRecommended?: boolean;
}

export interface ProcurementItem {
  id: string;
  ingredient: string;
  quantityRequired: number;
  unit: string;
  currentStock: number;
  quantityToOrder: number;
  supplier: string;
  estimatedCost: number;
  status: 'en-stock' | 'a-commander' | 'commande' | 'livre';
}

export interface ProcurementSummary {
  totalItems: number;
  totalCost: number;
  itemsToOrder: number;
}

export interface ForecastHistoryEntry {
  id: string;
  date: string;
  presence: number;
  forecast: number;
  actual: number;
  ecart: number;
  errorPct: number;
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

export interface FinancialKPI {
  estimatedSavings: number;
  wasteCost: number;
  avoidedWaste: number;
  foodCost: number;
  monthlyTrend: { month: string; savings: number; wasteCost: number }[];
}

export interface AttendancePoint {
  date: string;
  shortDate: string;
  presence: number;
  meals: number;
  ratio: number;
}

export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  frequency: string;
  format: 'PDF' | 'CSV' | 'XLSX';
}

export type ServiceStatus =
  | 'upcoming'
  | 'in_progress'
  | 'awaiting_closure'
  | 'confirmation_required'
  | 'closed';

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

export interface DishCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Dish {
  id: string;
  name: string;
  categoryId: string;
  description?: string;
  portionStandard?: string;
  estimatedCost?: number;
  historicalPopularity?: number;
  wasteRate?: number;
  active: boolean;
  isNew?: boolean;
}

export interface MenuElement {
  categoryId: string;
  dishId: string;
}

export interface DailyMenu {
  date: string;
  items: MenuElement[];
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

export interface WasteEntry {
  date: string;
  prepared: number;
  served: number;
  remaining: number;
  wasted: number;
  wasteRate: number;
  menu: string;
  comment?: string;
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
