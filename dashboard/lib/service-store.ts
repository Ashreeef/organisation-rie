'use client';

/**
 * Service Store — THE single source of truth for daily RIE operations.
 *
 * State machine:
 *   preparation → service → bilan_a_saisir → bilan_a_confirmer → cloturee
 *
 * Both the dashboard home page and the prepare page read from this store.
 * Tomorrow is locked until today is closed (cloturee).
 */

import type {
  ForecastResult,
  MenuItem,
  ProcurementItem,
  BilanRecord,
  OperationalEntry,
} from './types';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type ServiceStatus =
  | 'preparation'
  | 'service'
  | 'bilan_a_saisir'
  | 'bilan_a_confirmer'
  | 'cloturee';

export interface TodayState {
  date: string; // YYYY-MM-DD
  status: ServiceStatus;
  forecast: ForecastResult | null;
  menu: MenuItem | null;
  procurement: ProcurementItem[];
  plannedMeals: number;
  actualMealsServed: number;
  overrideReason: string | null;
  bilan: BilanRecord | null;
}

export interface TomorrowState {
  locked: boolean;
  forecast: ForecastResult | null;
  menu: MenuItem | null;
  procurement: ProcurementItem[];
  plannedMeals: number;
  presenceInput: number;
}

export interface ServiceStore {
  today: TodayState;
  tomorrow: TomorrowState;
  history: OperationalEntry[];
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const STORAGE_KEY = 'rie-service-store';

const defaultToday = (): TodayState => ({
  date: todayKey(),
  status: 'preparation',
  forecast: null,
  menu: null,
  procurement: [],
  plannedMeals: 0,
  actualMealsServed: 0,
  overrideReason: null,
  bilan: null,
});

const defaultTomorrow = (): TomorrowState => ({
  locked: true,
  forecast: null,
  menu: null,
  procurement: [],
  plannedMeals: 0,
  presenceInput: 0,
});

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function tomorrowKey(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function loadFromStorage(): ServiceStore | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ServiceStore;
  } catch {
    return null;
  }
}

function saveToStorage(store: ServiceStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function dateHasChanged(storedDate: string): boolean {
  return storedDate !== todayKey();
}

/**
 * When the date rolls over:
 *  - Yesterday's today becomes a history entry
 *  - Yesterday's tomorrow becomes today
 *  - New tomorrow is created (locked)
 */
function rollover(store: ServiceStore): ServiceStore {
  const today = store.today;
  const tomorrow = store.tomorrow;

  // Push yesterday's today into history if it had meaningful data
  const historyEntry: OperationalEntry = {
    id: `entry-${today.date}`,
    date: today.date,
    presence: today.forecast?.employeesCount ?? 0,
    forecast: today.plannedMeals,
    actual: today.actualMealsServed,
    menu: today.menu?.name ?? '',
    status: today.status === 'cloturee' ? 'cloturee' : 'inachevee',
    bilan: today.bilan,
  };

  // Yesterday's tomorrow becomes today
  const newToday: TodayState = {
    date: todayKey(),
    status: 'preparation',
    forecast: tomorrow.forecast,
    menu: tomorrow.menu,
    procurement: tomorrow.procurement,
    plannedMeals: tomorrow.plannedMeals,
    actualMealsServed: 0,
    overrideReason: null,
    bilan: null,
  };

  const newStore: ServiceStore = {
    today: newToday,
    tomorrow: defaultTomorrow(), // new tomorrow is locked
    history: [...store.history, historyEntry],
  };

  return newStore;
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Initialize store — call once on app load.
 * Handles date rollover automatically.
 */
export function initStore(): ServiceStore {
  let store = loadFromStorage();

  if (!store) {
    store = {
      today: defaultToday(),
      tomorrow: defaultTomorrow(),
      history: [],
    };
  } else if (dateHasChanged(store.today.date)) {
    store = rollover(store);
  }

  saveToStorage(store);
  return store;
}

export function getStatusLabel(status: ServiceStatus): string {
  const map: Record<ServiceStatus, string> = {
    preparation: 'En préparation',
    service: 'Service en cours',
    bilan_a_saisir: 'Bilan à saisir',
    bilan_a_confirmer: 'Bilan à confirmer',
    cloturee: 'Clôturée',
  };
  return map[status];
}

export function getStatusColor(status: ServiceStatus): string {
  const map: Record<ServiceStatus, string> = {
    preparation: 'bg-blue-100 text-blue-800',
    service: 'bg-amber-100 text-amber-800',
    bilan_a_saisir: 'bg-orange-100 text-orange-800',
    bilan_a_confirmer: 'bg-purple-100 text-purple-800',
    cloturee: 'bg-green-100 text-green-800',
  };
  return map[status];
}

/**
 * Transition to the next status in the workflow.
 * Returns the new store.
 */
export function advanceStatus(
  store: ServiceStore,
  newStatus: ServiceStatus
): ServiceStore {
  const updated = { ...store, today: { ...store.today, status: newStatus } };

  // When today is closed, unlock tomorrow
  if (newStatus === 'cloturee') {
    updated.tomorrow = { ...updated.tomorrow, locked: false };
  }

  saveToStorage(updated);
  return updated;
}

/**
 * Update today's actual meals served (during service).
 */
export function setActualMeals(
  store: ServiceStore,
  count: number
): ServiceStore {
  const updated = {
    ...store,
    today: { ...store.today, actualMealsServed: count },
  };
  saveToStorage(updated);
  return updated;
}

/**
 * Update today's planned meals (override by manager).
 */
export function setPlannedMeals(
  store: ServiceStore,
  count: number,
  reason?: string
): ServiceStore {
  const updated = {
    ...store,
    today: {
      ...store.today,
      plannedMeals: count,
      overrideReason: reason ?? store.today.overrideReason,
    },
  };
  saveToStorage(updated);
  return updated;
}

/**
 * Set today's selected menu.
 */
export function setTodayMenu(
  store: ServiceStore,
  menu: MenuItem
): ServiceStore {
  const updated = { ...store, today: { ...store.today, menu } };
  saveToStorage(updated);
  return updated;
}

/**
 * Submit bilan (actual consumption data).
 */
export function submitBilan(
  store: ServiceStore,
  bilan: BilanRecord
): ServiceStore {
  const updated = {
    ...store,
    today: { ...store.today, bilan, status: 'bilan_a_confirmer' as ServiceStatus },
  };
  saveToStorage(updated);
  return updated;
}

/**
 * Confirm bilan → close today.
 */
export function confirmBilan(store: ServiceStore): ServiceStore {
  return advanceStatus(store, 'cloturee');
}

/**
 * Update tomorrow's preparation inputs.
 */
export function updateTomorrow(
  store: ServiceStore,
  patch: Partial<Omit<TomorrowState, 'locked' | 'forecast' | 'procurement'>>
): ServiceStore {
  const updated = {
    ...store,
    tomorrow: { ...store.tomorrow, ...patch },
  };
  saveToStorage(updated);
  return updated;
}

/**
 * Set tomorrow's forecast + derived data (from backend).
 */
export function setTomorrowForecast(
  store: ServiceStore,
  forecast: ForecastResult,
  menu: MenuItem | null,
  procurement: ProcurementItem[],
  plannedMeals: number
): ServiceStore {
  const updated = {
    ...store,
    tomorrow: {
      ...store.tomorrow,
      forecast,
      menu,
      procurement,
      plannedMeals,
    },
  };
  saveToStorage(updated);
  return updated;
}

/**
 * Add a history entry manually (e.g. from backend sync).
 */
export function addHistoryEntry(
  store: ServiceStore,
  entry: OperationalEntry
): ServiceStore {
  const updated = {
    ...store,
    history: [...store.history, entry],
  };
  saveToStorage(updated);
  return updated;
}
