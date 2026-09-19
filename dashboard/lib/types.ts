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
  // True when the forecast shown may not reflect the menu currently planned
  // (features not yet regenerated for the date). UI must show "à actualiser".
  forecastStale?: boolean;
  // Fingerprint of the menu used to compute this forecast.
  menuFingerprint?: string;
  // Calendrier : drapeaux Ramadan / jour férié (fournis par le backend) — la
  // page /forecasts les affiche et ajuste la fiabilité affichée.
  isHoliday?: boolean;
  isRamadan?: boolean;
  holidayName?: string | null;
  // Un menu est-il planifié pour cette date ? Quand faux, aucune prévision
  // n'est disponible (le menu est le préalable obligatoire du calcul).
  menuPlanned?: boolean;
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
  forecastStale: false,
  menuFingerprint: '',
});

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
  // Employés prévus = prédiction de présence (persistée à la planification).
  // Jamais recopiée depuis la prévision de repas.
  officePresent: number;
  employeesCount: number;
  // Vrai si une prédiction de présence a réellement été persistée pour ce jour
  // (sinon l'UI affiche "Non disponible" au lieu d'un 0 inventé).
  hasAttendance: boolean;
  // Prévision de repas attendue (sortie du modèle).
  forecast: number;
  // Repas effectivement préparés par la cuisine (bilan).
  prepared: number;
  // Repas réellement servis/consommés (bilan).
  actual: number;
  ecart: number | null;
  errorPct: number | null;
  hasForecast: boolean;
  status: 'bon' | 'acceptable' | 'mauvais';
  // Contexte "données réelles" (utilisé uniquement pour l'export CSV) :
  // menu planifié et météo du jour, vides si indisponibles.
  menu?: string;
  weather?: string;
}

export interface DailyContext {
  date: string;
  menu: string;
  weather: string;
}

export interface HolidayInfo {
  date: string; // YYYY-MM-DD
  name: string; // ex. "Eid al-Adha", "Independence Day"
}

export interface AppSettings {
  siteName: string;
  safetyMarginPct: number;
  serviceStart: string;
  serviceEnd: string;
  bilanDeadline: string;
}

export interface ModelMetrics {
  version: string;
  lastTrainingDate: string;
  evaluationMetric: string;
  predictionError: string;
  dataFreshness: string;
  accuracy: number;
  mae: number;
  rmse: number;
  asymmetricCost: number;
  catboostCount: number;
  lgbCount: number;
  xgbCount: number;
  calibrationLambda: number;
  featureCount: number;
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
  // Vrai quand la présence du jour a été confirmée/corrigée manuellement par
  // le gestionnaire (override) : la prévision est alors basée sur cette valeur
  // (persistée côté backend), pas sur la prédiction du modèle.
  presenceOverridden: boolean;
  bilan: BilanRecord | null;
  // True quand le bilan du jour est clos (statut 'cloturee'). Source unique :
  // backend (calculé depuis le statut). L'UI ne dérive jamais ceci d'un CSS.
  bilanClosed: boolean;
  // Prochaine journée de service (dimanche -> jeudi ; vendredi/samedi exclus).
  // Fournie par le backend (calendrier opérationnel canonique). L'UI ne fait
  // PAS de "date + 1 jour" pour la calculer.
  nextOperationalDay: string;
  // Horloge du service (source unique : backend, depuis /settings) :
  // "before" | "during" | "after" | "late". L'UI ne calcule jamais ces
  // valeurs elle-même — elle les reçoit telles quelles de /api/operations/today.
  servicePhase: ServicePhase;
  serviceStart: string; // "HH:MM"
  serviceEnd: string; // "HH:MM"
  bilanDeadline: string; // "HH:MM"
}

export type ServicePhase = 'before' | 'during' | 'after' | 'late';

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

// Jour de prévision hebdomadaire (page /forecasts) — agrégat d'une prévision
// modèle + le menu canonique planifié (id → catalogue) + drapeaux calendrier.
export interface WeekForecastDay {
  date: string; // YYYY-MM-DD
  dow: number; // getDay() JS : Dimanche=0 … Jeudi=4
  isToday: boolean;
  isTomorrow: boolean;
  isPast: boolean;
  // Prévision brute du modèle (real FastAPI data). Si aucun menu n'est planifié
  // pour la date, forecastAvailable=false et les comptes valent 0.
  forecast: ForecastResult;
  officePresent: number;
  employeesCount: number;
  recommendedMeals: number;
  confidenceLower: number;
  confidenceUpper: number;
  predictedRatio: number;
  isHoliday: boolean;
  isRamadan: boolean;
  holidayName?: string | null;
  // Menu planifié (texte) et attributs canoniques du plat principal.
  menu?: string;
  menuCategory?: string;
  menuRatioEffect?: string;
}
