import type {
  ForecastResult,
  ForecastVsActualPoint,
  KPI,
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
} from '@/lib/types';

// ── Helpers ──────────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

// ── Tomorrow's forecast ──────────────────────────────────
export const tomorrowForecast: ForecastResult = {
  date: daysAgo(-1),
  officePresent: 312,
  predictedRatio: 0.665,
  employeesCount: 487,
  blendScores: { lgb: 0.018, xgb: 0.089, catboost: 0.893 },
  recommendedMeals: 340,
  confidenceLower: 295,
  confidenceUpper: 355,
  confidenceLevel: 'high',
  recommendationNote:
    'La fréquentation prévue est de 487 employés. Nous recommandons de préparer 340 repas afin de limiter le risque de pénurie.',
};

// ── Dashboard KPIs (simplified — 4 only) ────────────────
export const dashboardKPIs: KPI[] = [
  {
    id: 'expected-presence',
    label: 'Employés attendus',
    value: '487',
    unit: 'employés',
    trend: { direction: 'up', value: '+34', label: 'vs moyenne' },
    variant: 'default',
  },
  {
    id: 'recommended-meals',
    label: 'Repas recommandés',
    value: '340',
    unit: 'repas',
    trend: { direction: 'up', value: '+12', label: 'vs aujourd’hui' },
    variant: 'success',
  },
  {
    id: 'avg-waste',
    label: 'Gaspillage',
    value: '5,8',
    unit: '%',
    trend: { direction: 'down', value: '-1,8 pts', label: 'vs mois précéd.' },
    variant: 'success',
  },
  {
    id: 'estimated-savings',
    label: 'Économies ce mois',
    value: '+18 400',
    unit: 'DZD',
    trend: { direction: 'up', value: '+12%', label: 'vs mois précéd.' },
    variant: 'success',
  },
];

// ── Forecast vs Actual (30 working days) ────────────────
function generateForecastVsActual(): ForecastVsActualPoint[] {
  const points: ForecastVsActualPoint[] = [];
  let day = 30;
  let i = 0;
  while (day >= 1) {
    const d = new Date();
    d.setDate(d.getDate() - day);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) {
      day--;
      continue;
    }
    const iso = d.toISOString().slice(0, 10);
    const base = 300 + Math.sin(i * 0.4) * 30 + (i % 5) * 4;
    const forecast = Math.round(base + Math.cos(i * 0.3) * 12);
    const noise = (i % 7) - 3;
    const actual = day <= 1 ? null : Math.round(base + noise * 6 + (i % 3) * 3);
    points.push({
      date: iso,
      shortDate: shortDate(iso),
      forecast,
      actual,
    });
    day--;
    i++;
  }
  return points;
}
export const forecastVsActual: ForecastVsActualPoint[] =
  generateForecastVsActual();

// ── Alerts (human, actionable) ───────────────────────────
export const operationalAlerts: OperationalAlert[] = [
  {
    id: 'alert-1',
    severity: 'high',
    title: 'Présence exceptionnellement élevée demain',
    explanation:
      '487 employés sont attendus demain, soit environ 7% de plus que la moyenne.',
    recommendedAction:
      'Vérifier les quantités recommandées et les stocks de secours.',
  },
  {
    id: 'alert-2',
    severity: 'medium',
    title: 'Menu à risque de gaspillage',
    explanation:
      'Le plat « Couscous viande » présente habituellement un gaspillage supérieur à la moyenne (5,1%).',
    recommendedAction:
      'Voir les alternatives comme « Poulet rôti + Rechta » (gaspillage 4,2%).',
  },
  {
    id: 'alert-3',
    severity: 'low',
    title: 'Séminaire interne prévu',
    explanation:
      'Un séminaire interne est prévu demain (environ 45 participants supplémentaires).',
    recommendedAction:
      'Confirmer le nombre exact de participants avec le planning RH.',
  },
];

// ── Waste ───────────────────────────────────────────────
function generateWasteDays(): WasteDay[] {
  const days: WasteDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const prepared = 310 + Math.round(Math.sin(i * 0.5) * 25) + (i % 3) * 5;
    const wasteRate = 0.045 + (i % 4) * 0.008;
    const wasted = Math.round(prepared * wasteRate);
    const served = prepared - wasted;
    days.push({
      date: iso,
      shortDate: shortDate(iso),
      prepared,
      served,
      wasted,
      wasteRate: Math.round(wasteRate * 1000) / 10,
      menu: ['Poulet rôti + Rechta', 'Couscous viande', 'Spaghetti bolognaise', 'Tajine poulet'][
        i % 4
      ],
    });
  }
  return days;
}
export const wasteDays: WasteDay[] = generateWasteDays();

export const wasteSummary: WasteSummary = {
  prepared: 330,
  served: 312,
  wasted: 18,
  wasteRate: 5.45,
  trend: { direction: 'down', value: '-1,8 pts', label: 'vs mois précédent' },
};

// ── Menus ───────────────────────────────────────────────
export const menuItems: MenuItem[] = [
  {
    id: 'menu-1',
    name: 'Poulet rôti + Rechta',
    category: 'traditionnel',
    attractiveness: 92,
    predictedWaste: 4.2,
    costPerMeal: 185,
    score: 94,
    description: 'Poulet rôti fermier, rechta maison, sauce aux légumes.',
    ingredients: ['Poulet', 'Rechta', 'Légumes', 'Sauce'],
    isRecommended: true,
  },
  {
    id: 'menu-2',
    name: 'Couscous viande',
    category: 'traditionnel',
    attractiveness: 88,
    predictedWaste: 5.1,
    costPerMeal: 210,
    score: 89,
    description: 'Couscous traditionnel, viande d’agneau, légumes de saison.',
    ingredients: ['Semoule', 'Agneau', 'Légumes', 'Épices'],
  },
  {
    id: 'menu-3',
    name: 'Spaghetti bolognaise',
    category: 'international',
    attractiveness: 81,
    predictedWaste: 7.8,
    costPerMeal: 165,
    score: 78,
    description: 'Pâtes fraîches, sauce bolognaise, parmesan.',
    ingredients: ['Pâtes', 'Viande hachée', 'Tomate', 'Parmesan'],
  },
  {
    id: 'menu-4',
    name: 'Tajine poulet',
    category: 'traditionnel',
    attractiveness: 85,
    predictedWaste: 5.5,
    costPerMeal: 175,
    score: 86,
    description: 'Tajine de poulet aux olives et citron confit.',
    ingredients: ['Poulet', 'Olives', 'Citron', 'Épices'],
  },
  {
    id: 'menu-5',
    name: 'Salade composée + poisson',
    category: 'leger',
    attractiveness: 72,
    predictedWaste: 9.2,
    costPerMeal: 145,
    score: 71,
    description: 'Salade fraîche, filet de poisson grillé, vinaigrette légère.',
    ingredients: ['Légumes verts', 'Poisson', 'Huile d’olive'],
  },
  {
    id: 'menu-6',
    name: 'Chorba + bourek (Ramadan)',
    category: 'special',
    attractiveness: 95,
    predictedWaste: 3.8,
    costPerMeal: 195,
    score: 96,
    description: 'Chorba traditionnelle, bourek, dattes — menu du Ramadan.',
    ingredients: ['Chorba', 'Bourek', 'Dattes', 'Lait'],
  },
];

// ── Weekly menu plan ────────────────────────────────────
export const weeklyMenuPlan: { day: string; menuId: string; menuName: string }[] = [
  { day: 'Lundi', menuId: 'menu-1', menuName: 'Poulet rôti + Rechta' },
  { day: 'Mardi', menuId: 'menu-2', menuName: 'Couscous viande' },
  { day: 'Mercredi', menuId: 'menu-3', menuName: 'Spaghetti bolognaise' },
  { day: 'Jeudi', menuId: 'menu-4', menuName: 'Tajine poulet' },
  { day: 'Vendredi', menuId: 'menu-1', menuName: 'Poulet rôti + Rechta' },
];

// ── Procurement ─────────────────────────────────────────
export const procurementItems: ProcurementItem[] = [
  {
    id: 'proc-1',
    ingredient: 'Poulet',
    quantityRequired: 68,
    unit: 'kg',
    currentStock: 12,
    quantityToOrder: 56,
    supplier: 'Poulet du Sud',
    estimatedCost: 56000,
    status: 'a-commander',
  },
  {
    id: 'proc-2',
    ingredient: 'Rechta',
    quantityRequired: 34,
    unit: 'kg',
    currentStock: 8,
    quantityToOrder: 26,
    supplier: 'Pâtes El Djazaïr',
    estimatedCost: 13000,
    status: 'a-commander',
  },
  {
    id: 'proc-3',
    ingredient: 'Légumes variés',
    quantityRequired: 42,
    unit: 'kg',
    currentStock: 15,
    quantityToOrder: 27,
    supplier: 'Primeurs Mitidja',
    estimatedCost: 10800,
    status: 'a-commander',
  },
  {
    id: 'proc-4',
    ingredient: "Huile d'olive",
    quantityRequired: 6,
    unit: 'L',
    currentStock: 4,
    quantityToOrder: 2,
    supplier: 'Huilerie Kabyle',
    estimatedCost: 2400,
    status: 'en-stock',
  },
  {
    id: 'proc-5',
    ingredient: 'Épices & assaisonnements',
    quantityRequired: 2,
    unit: 'kg',
    currentStock: 1.5,
    quantityToOrder: 0.5,
    supplier: 'Épices SA',
    estimatedCost: 1800,
    status: 'en-stock',
  },
  {
    id: 'proc-6',
    ingredient: 'Pain',
    quantityRequired: 340,
    unit: 'pains',
    currentStock: 0,
    quantityToOrder: 340,
    supplier: 'Boulangerie Centrale',
    estimatedCost: 8500,
    status: 'a-commander',
  },
  {
    id: 'proc-7',
    ingredient: 'Eau minérale',
    quantityRequired: 200,
    unit: 'bouteilles',
    currentStock: 80,
    quantityToOrder: 120,
    supplier: 'Source Dahra',
    estimatedCost: 6000,
    status: 'commande',
  },
];

export const procurementSummary: ProcurementSummary = {
  totalItems: procurementItems.length,
  totalCost: procurementItems.reduce((s, i) => s + i.estimatedCost, 0),
  itemsToOrder: procurementItems.filter((i) => i.status === 'a-commander').length,
};

// ── Forecast history ────────────────────────────────────
function generateHistory(): ForecastHistoryEntry[] {
  const entries: ForecastHistoryEntry[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const officePresent = 300 + Math.round(Math.sin(i * 0.3) * 40) + (i % 4) * 8;
    const employeesCount = 300 + Math.round(Math.cos(i * 0.25) * 25) + (i % 3) * 6;
    const forecast = employeesCount;
    const actual = i <= 1 ? 0 : forecast + ((i % 5) - 2) * 8;
    const ecart = actual - forecast;
    const errorPct = actual === 0 ? 0 : Math.round((Math.abs(ecart) / forecast) * 1000) / 10;
    const status = errorPct < 5 ? 'bon' : errorPct < 10 ? 'acceptable' : 'mauvais';
    entries.push({
      id: `hist-${iso}`,
      date: iso,
      officePresent,
      employeesCount,
      forecast,
      actual: actual === 0 ? 0 : actual,
      ecart,
      errorPct,
      status,
    });
  }
  return entries;
}
export const forecastHistory: ForecastHistoryEntry[] = generateHistory();

// ── Model metrics (for AI team only) ────────────────────
export const modelMetrics: ModelMetrics = {
  version: 'v2.4.1',
  lastTrainingDate: '2026-08-10 03:00',
  lastPredictionDate: '2026-08-17 06:15',
  evaluationMetric: 'AsymmetricCost',
  predictionError: '18,3 repas',
  dataFreshness: '12 min',
  driftIndicator: 'stable',
  featureAvailability: 96,
  accuracy: 94.2,
  mae: 18.3,
  rmse: 24.7,
  asymmetricCost: 18.98,
  catboostCount: 3,
  lgbCount: 15,
  xgbCount: 15,
  calibrationLambda: 0.726,
};

export const modelFamilies: ModelFamily[] = [
  {
    name: 'LightGBM',
    modelCount: 15,
    contribution: 2,
    description: 'Gradient boosting — seed × alpha variants.',
  },
  {
    name: 'XGBoost',
    modelCount: 15,
    contribution: 9,
    description: 'Regularized boosting — seed × alpha variants.',
  },
  {
    name: 'CatBoost',
    modelCount: 3,
    contribution: 89,
    description: 'Ordered boosting — dominant blend weight.',
  },
];

// ── Data sources ────────────────────────────────────────
export const dataSources: DataSource[] = [
  {
    id: 'ds-1',
    name: "Contrôle d'accès",
    status: 'synced',
    lastSync: 'il y a 8 min',
    records: 124850,
    freshness: 'fresh',
    availability: 99.8,
    description: "Badges d'accès bâtiment — présence des employés en temps réel.",
  },
  {
    id: 'ds-2',
    name: 'POS Cantine',
    status: 'synced',
    lastSync: 'il y a 12 min',
    records: 87320,
    freshness: 'fresh',
    availability: 99.5,
    description: 'Point de vente cantine — repas servis et encaissements.',
  },
  {
    id: 'ds-3',
    name: 'RH / Planning',
    status: 'synced',
    lastSync: 'il y a 25 min',
    records: 5240,
    freshness: 'fresh',
    availability: 100,
    description: 'Planning des effectifs, congés, télétravail, événements internes.',
  },
  {
    id: 'ds-4',
    name: 'Calendrier interne',
    status: 'synced',
    lastSync: 'il y a 1 h',
    records: 312,
    freshness: 'fresh',
    availability: 100,
    description: 'Jours fériés, Ramadan, événements spéciaux, ponts.',
  },
  {
    id: 'ds-5',
    name: 'Fournisseurs / ERP',
    status: 'synced',
    lastSync: 'il y a 45 min',
    records: 18900,
    freshness: 'fresh',
    availability: 98.2,
    description: "Stocks, prix d'achat, délais de livraison, catalogues fournisseurs.",
  },
  {
    id: 'ds-6',
    name: 'Weather API',
    status: 'delayed',
    lastSync: 'il y a 1 h',
    records: 4380,
    freshness: 'stale-warning',
    availability: 95.0,
    description: 'Prévisions météo 5 jours — impact sur la fréquentation.',
  },
  {
    id: 'ds-7',
    name: 'Satisfaction / Retours',
    status: 'synced',
    lastSync: 'il y a 2 h',
    records: 3120,
    freshness: 'stale',
    availability: 92.5,
    description: 'Enquêtes de satisfaction, retours menus, notes des employés.',
  },
];

// ── Financial ───────────────────────────────────────────
export const financialKPIs: FinancialKPI = {
  estimatedSavings: 42500,
  wasteCost: 18700,
  avoidedWaste: 12300,
  foodCost: 215000,
  monthlyTrend: [
    { month: 'Mar', savings: 28000, wasteCost: 24000 },
    { month: 'Avr', savings: 32000, wasteCost: 22000 },
    { month: 'Mai', savings: 35000, wasteCost: 21000 },
    { month: 'Juin', savings: 38000, wasteCost: 20000 },
    { month: 'Juil', savings: 41000, wasteCost: 19000 },
    { month: 'Août', savings: 42500, wasteCost: 18700 },
  ],
};

// ── Attendance ──────────────────────────────────────────
function generateAttendance(): AttendancePoint[] {
  const points: AttendancePoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    const officePresent = 300 + Math.round(Math.sin(i * 0.35) * 35) + (i % 4) * 6;
    const employeesCount = Math.round(officePresent * (0.62 + (i % 3) * 0.02));
    points.push({
      date: iso,
      shortDate: shortDate(iso),
      officePresent,
      employeesCount,
      meals: employeesCount,
      ratio: Math.round((employeesCount / officePresent) * 1000) / 10,
    });
  }
  return points;
}
export const attendanceData: AttendancePoint[] = generateAttendance();

// ── Reports ─────────────────────────────────────────────
export const reportTemplates: ReportTemplate[] = [
  {
    id: 'rpt-1',
    name: 'Rapport de prévision journalier',
    description: 'Prévision, recommandation opérationnelle et alertes du jour.',
    frequency: 'Quotidien',
    format: 'PDF',
  },
  {
    id: 'rpt-2',
    name: 'Rapport hebdomadaire RIE',
    description: 'Synthèse des prévisions, fréquentation et gaspillage de la semaine.',
    frequency: 'Hebdomadaire',
    format: 'PDF',
  },
  {
    id: 'rpt-3',
    name: 'Rapport de performance mensuel',
    description: 'Précision du modèle, KPIs opérationnels et financiers du mois.',
    frequency: 'Mensuel',
    format: 'PDF',
  },
  {
    id: 'rpt-4',
    name: 'Rapport de gaspillage',
    description: 'Détail des repas préparés, servis, gaspillés et taux par menu.',
    frequency: 'Mensuel',
    format: 'CSV',
  },
  {
    id: 'rpt-5',
    name: "Rapport d'impact financier",
    description: 'Économies réalisées, coût du gaspillage et évitement.',
    frequency: 'Mensuel',
    format: 'XLSX',
  },
];
