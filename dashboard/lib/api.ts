// Mock API service layer.
// These functions simulate async calls to a Python/ML backend.
// To connect a real backend later, replace the bodies of these functions
// with fetch() calls to your API endpoints (e.g. Domino Data Lab).

import {
  tomorrowForecast,
  dashboardKPIs,
  forecastVsActual,
  operationalAlerts,
  wasteDays,
  wasteSummary,
  menuItems,
  weeklyMenuPlan,
  procurementItems,
  procurementSummary,
  forecastHistory,
  modelMetrics,
  modelFamilies,
  dataSources,
  financialKPIs,
  attendanceData,
  reportTemplates,
} from '@/lib/mock-data';
import type {
  ForecastResult,
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
  DailyCycle,
  Dish,
  DishCategory,
  MenuElement,
  ServiceStatus,
} from '@/lib/types';
import {
  getDailyCycle,
  updateServiceStatus,
  saveServiceResults,
  confirmService,
  getDishes,
  getDishCategories,
  addDish,
  addDishCategory,
  getDailyMenu,
  saveDailyMenu,
} from '@/lib/operational-store';

function delay<T>(data: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export const api = {
  // ── Forecast ────────────────────────────────────────
  getTomorrowForecast(): Promise<ForecastResult> {
    // GET /api/forecast/tomorrow
    return delay(tomorrowForecast);
  },

  getDashboardKPIs(): Promise<KPI[]> {
    // GET /api/kpis/dashboard
    return delay(dashboardKPIs);
  },

  getForecastVsActual(days: 7 | 14 | 30 = 14): Promise<ForecastVsActualPoint[]> {
    // GET /api/forecast/accuracy?days=N
    return delay(forecastVsActual.slice(-days));
  },

  // ── Alerts ───────────────────────────────────────────
  getAlerts(): Promise<OperationalAlert[]> {
    // GET /api/alerts
    return delay(operationalAlerts);
  },

  // ── Waste ───────────────────────────────────────────
  getWasteDays(): Promise<WasteDay[]> {
    // GET /api/waste/daily
    return delay(wasteDays);
  },

  getWasteSummary(): Promise<WasteSummary> {
    // GET /api/waste/summary
    return delay(wasteSummary);
  },

  submitWasteEntry(entry: WasteEntry): Promise<{ success: boolean }> {
    // POST /api/waste/entry
    console.log('[mock] Waste entry submitted:', entry);
    return delay({ success: true });
  },

  // ── Menus ────────────────────────────────────────────
  getMenus(): Promise<MenuItem[]> {
    // GET /api/menus
    return delay(menuItems);
  },

  getWeeklyMenuPlan(): Promise<{ day: string; menuId: string; menuName: string }[]> {
    // GET /api/menus/weekly
    return delay(weeklyMenuPlan);
  },

  // ── Procurement ──────────────────────────────────────
  getProcurementItems(): Promise<ProcurementItem[]> {
    // GET /api/procurement/items
    return delay(procurementItems);
  },

  getProcurementSummary(): Promise<ProcurementSummary> {
    // GET /api/procurement/summary
    return delay(procurementSummary);
  },

  generateOrder(): Promise<{ orderId: string; totalCost: number }> {
    // POST /api/procurement/order
    return delay({ orderId: `CMD-${Date.now()}`, totalCost: procurementSummary.totalCost });
  },

  // ── History ──────────────────────────────────────────
  getForecastHistory(): Promise<ForecastHistoryEntry[]> {
    // GET /api/forecast/history
    return delay(forecastHistory);
  },

  // ── Model ────────────────────────────────────────────
  getModelMetrics(): Promise<ModelMetrics> {
    // GET /api/model/metrics
    return delay(modelMetrics);
  },

  getModelFamilies(): Promise<ModelFamily[]> {
    // GET /api/model/families
    return delay(modelFamilies);
  },

  // ── Data sources ─────────────────────────────────────
  getDataSources(): Promise<DataSource[]> {
    // GET /api/datasources
    return delay(dataSources);
  },

  // ── Financial ────────────────────────────────────────
  getFinancialKPIs(): Promise<FinancialKPI> {
    // GET /api/finance/kpis
    return delay(financialKPIs);
  },

  // ── Attendance ───────────────────────────────────────
  getAttendanceData(): Promise<AttendancePoint[]> {
    // GET /api/attendance
    return delay(attendanceData);
  },

  // ── Reports ───────────────────────────────────────────
  getReportTemplates(): Promise<ReportTemplate[]> {
    // GET /api/reports/templates
    return delay(reportTemplates);
  },

  generateReport(reportId: string): Promise<{ url: string }> {
    // POST /api/reports/generate
    console.log('[mock] Report generated:', reportId);
    return delay({ url: `#mock-report-${reportId}` });
  },

  // ── Daily operational cycle ─────────────────────────
  getDailyCycle(): Promise<DailyCycle> {
    return delay(getDailyCycle());
  },

  updateServiceStatus(status: ServiceStatus): Promise<DailyCycle> {
    return delay(updateServiceStatus(status));
  },

  saveServiceResults(values: {
    mealsPrepared: number;
    mealsServed: number;
    managerComment?: string;
    menu: MenuElement[];
  }): Promise<DailyCycle> {
    return delay(saveServiceResults(values));
  },

  confirmService(): Promise<DailyCycle> {
    return delay(confirmService());
  },

  // ── Dishes & categories ──────────────────────────────
  getDishes(): Promise<Dish[]> {
    return delay(getDishes());
  },

  getDishCategories(): Promise<DishCategory[]> {
    return delay(getDishCategories());
  },

  addDish(dish: Omit<Dish, 'id' | 'active' | 'isNew'>): Promise<Dish> {
    return delay(addDish(dish));
  },

  addDishCategory(name: string): Promise<DishCategory> {
    return delay(addDishCategory(name));
  },

  getDailyMenu(): Promise<MenuElement[]> {
    return delay(getDailyMenu());
  },

  saveDailyMenu(items: MenuElement[]): Promise<MenuElement[]> {
    return delay(saveDailyMenu(items));
  },
};
