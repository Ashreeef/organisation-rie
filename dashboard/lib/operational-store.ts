import type {
  DailyCycle,
  Dish,
  DishCategory,
  MenuElement,
  ServiceDay,
  ServiceStatus,
} from '@/lib/types';

export const OPERATIONAL_DATE = '2024-01-01';
export const TOMORROW_DATE = '2024-01-02';

const cycleKey = `rie-cycle-${OPERATIONAL_DATE}`;
const dishesKey = 'rie-dishes-v1';
const categoriesKey = 'rie-dish-categories-v1';
const menuKey = `rie-menu-${OPERATIONAL_DATE}`;

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

const defaultDishes: Dish[] = [
  { id: 'dish-salade', name: 'Salade / Soupe', categoryId: 'entree', active: true },
  { id: 'dish-escalope', name: 'Escalope grillé', categoryId: 'plat-principal', active: true },
  { id: 'dish-escalope-panne', name: 'Escalope panné sauce piquante', categoryId: 'plat-principal', active: true },
  { id: 'dish-puree', name: 'Pomme purée', categoryId: 'accompagnement', active: true },
  { id: 'dish-spaghetti', name: 'Spaghetti bolognaise', categoryId: 'plat-principal', active: true, historicalPopularity: 81, wasteRate: 7.8 },
  { id: 'dish-poulet', name: 'Poulet rôti', categoryId: 'plat-principal', active: true, historicalPopularity: 92, wasteRate: 4.2 },
  { id: 'dish-rechta', name: 'Rechta', categoryId: 'accompagnement', active: true, historicalPopularity: 90, wasteRate: 4.2 },
];

const defaultMenu: MenuElement[] = [
  { categoryId: 'entree', dishId: 'dish-salade' },
  { categoryId: 'plat-principal', dishId: 'dish-escalope' },
  { categoryId: 'accompagnement', dishId: 'dish-puree' },
];

const defaultService: ServiceDay = {
  date: OPERATIONAL_DATE,
  status: 'awaiting_closure',
  employeesExpected: 487,
  mealsPrepared: 330,
  menu: defaultMenu,
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  const stored = window.localStorage.getItem(key);
  if (!stored) return fallback;
  try {
    return JSON.parse(stored) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(key, JSON.stringify(value));
}

export function getDailyCycle(): DailyCycle {
  const service = readJson<ServiceDay>(cycleKey, defaultService);
  return { service, tomorrowUnlocked: service.status === 'closed' };
}

export function updateServiceStatus(status: ServiceStatus): DailyCycle {
  const cycle = getDailyCycle();
  const service = { ...cycle.service, status };
  writeJson(cycleKey, service);
  return { service, tomorrowUnlocked: status === 'closed' };
}

export function saveServiceResults(values: {
  mealsPrepared: number;
  mealsServed: number;
  managerComment?: string;
  menu: MenuElement[];
}): DailyCycle {
  const cycle = getDailyCycle();
  const mealsRemaining = Math.max(0, values.mealsPrepared - values.mealsServed);
  const service: ServiceDay = {
    ...cycle.service,
    status: 'confirmation_required',
    mealsPrepared: values.mealsPrepared,
    mealsServed: values.mealsServed,
    mealsRemaining,
    waste: mealsRemaining,
    managerComment: values.managerComment,
    menu: values.menu,
  };
  writeJson(cycleKey, service);
  writeJson(menuKey, values.menu);
  return { service, tomorrowUnlocked: false };
}

export function confirmService(): DailyCycle {
  const cycle = getDailyCycle();
  const service: ServiceDay = {
    ...cycle.service,
    status: 'closed',
    confirmedAt: new Date().toISOString(),
    confirmedBy: 'Omar OTMANIOU',
  };
  writeJson(cycleKey, service);
  return { service, tomorrowUnlocked: true };
}

export function getDishCategories(): DishCategory[] {
  return readJson<DishCategory[]>(categoriesKey, defaultCategories);
}

export function getDishes(): Dish[] {
  return readJson<Dish[]>(dishesKey, defaultDishes);
}

export function addDish(dish: Omit<Dish, 'id' | 'active' | 'isNew'>): Dish {
  const created: Dish = {
    ...dish,
    id: `dish-${Date.now()}`,
    active: true,
    isNew: true,
  };
  writeJson(dishesKey, [...getDishes(), created]);
  return created;
}

export function addDishCategory(name: string): DishCategory {
  const category: DishCategory = { id: `category-${Date.now()}`, name: name.trim() };
  writeJson(categoriesKey, [...getDishCategories(), category]);
  return category;
}

export function getDailyMenu(): MenuElement[] {
  return readJson<MenuElement[]>(menuKey, defaultMenu);
}

export function saveDailyMenu(items: MenuElement[]): MenuElement[] {
  writeJson(menuKey, items);
  const cycle = getDailyCycle();
  writeJson(cycleKey, { ...cycle.service, menu: items });
  return items;
}
