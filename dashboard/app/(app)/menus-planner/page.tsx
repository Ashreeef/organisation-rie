'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DishPicker, type DishPickerOption } from '@/components/menus/dish-picker';
import { api } from '@/lib/api';
import type { MenuPlan, ForecastResult, WeekForecastDay } from '@/lib/types';
import { formatNumber } from '@/lib/format';
import {
  DISHES,
  DISH_CATEGORIES,
  ACCOMPANIMENTS,
  ACCOMPANIMENT_CATEGORIES,
} from '@/lib/menu-catalog';
import { cn } from '@/lib/utils';
import {
  isoDate,
  isToday,
  OPERATIONAL_WEEKDAYS,
  startOfOperationalWeek,
  operationalWeekDays,
} from '@/lib/operational-calendar';
import { toast } from 'sonner';
import {
  CalendarDays,
  Check,
  Save,
  RefreshCw,
  Loader2,
  Info,
  Utensils,
  ChefHat,
  Salad,
  AlertTriangle,
  Clock,
  ChevronLeft,
  ChevronRight,
  Lock,
  TrendingUp,
} from 'lucide-react';

/**
 * Planificateur de menus hebdomadaire.
 *
 * Le gestionnaire renseigne les menus de la semaine (Dimanche → Jeudi) *à
 * l'avance* pour que le pipeline de features (daily_features.py) puisse
 * reconstruire les jours cibles avec les vrais menus — et non des menus vides.
 *
 * La page affiche UNE semaine à la fois (5 jours ouvrés, Dimanche → Jeudi),
 * avec navigation vers les semaines précédentes/suivantes. Par défaut, la
 * semaine courante est affichée. Les semaines passées (et les jours déjà
 * écoulés de la semaine courante) sont en lecture seule.
 */

// Entrées — valeurs canoniques issues des données historiques (menu_cleaning :
// salade / soupe / salé / bourak, et leurs combinaisons courantes)
const ENTREE_GROUPS = [
  { id: 'combos', label: 'Entrées courantes' },
  { id: 'soupes', label: 'Soupes & potages' },
  { id: 'sales', label: 'Salé & bourek' },
];

const ENTREE_OPTIONS: DishPickerOption[] = [
  { id: 'e-salade', name: 'Salade', categoryLabel: 'Entrées courantes' },
  { id: 'e-soupe', name: 'Soupe', categoryLabel: 'Entrées courantes' },
  { id: 'e-sale', name: 'Salé', categoryLabel: 'Entrées courantes' },
  { id: 'e-salade-soupe', name: 'Salade ou Soupe', categoryLabel: 'Entrées courantes' },
  { id: 'e-salade-sale', name: 'Salade et Salé', categoryLabel: 'Entrées courantes' },
  { id: 'e-all', name: 'Salade ou Soupe ou Salé', categoryLabel: 'Entrées courantes' },
  { id: 'e-soupe-bourak', name: 'Salade ou Soupe ou Bourak', categoryLabel: 'Entrées courantes' },

  { id: 'e-hrira', name: 'Hrira', categoryLabel: 'Soupes & potages' },
  { id: 'e-chorba', name: 'Chorba', categoryLabel: 'Soupes & potages' },
  { id: 'e-lentilles', name: 'Soupe de lentilles', categoryLabel: 'Soupes & potages' },
  { id: 'e-legumes', name: 'Soupe de légumes', categoryLabel: 'Soupes & potages' },
  { id: 'e-jari', name: 'Potage / Jari', categoryLabel: 'Soupes & potages' },

  { id: 'e-salés', name: 'Salés (pizza, feuilletés…)', categoryLabel: 'Salé & bourek' },
  { id: 'e-bourek', name: 'Bourek', categoryLabel: 'Salé & bourek' },
];

// Plats principaux — catalogue canonique
const DISH_OPTIONS: DishPickerOption[] = DISHES.map((d) => {
  const cat = DISH_CATEGORIES.find((c) => c.id === d.category);
  return {
    id: d.id,
    name: d.name,
    categoryLabel: cat?.label ?? d.category,
    categoryColor: cat?.color,
    ratioEffect: d.ratio_effect,
    typicalRatio: d.typical_ratio,
  };
});

// Accompagnements pour le plat 2 (optionnel)
const ACC_OPTIONS: DishPickerOption[] = ACCOMPANIMENTS.map((a) => {
  const cat = ACCOMPANIMENT_CATEGORIES.find((c) => c.id === a.category);
  return {
    id: a.id,
    name: a.name,
    categoryLabel: cat?.label ?? a.category,
  };
});

interface DayDraft {
  date: string;
  dow: number;
  entrees: string;
  plat_principal_1: string;
  plat_principal_1_id?: string;
  plat_principal_2: string;
  plat_principal_2_id?: string;
  saved: boolean;
  loading: boolean;
  isPast: boolean;
  isToday: boolean;
  readOnly: boolean;
  validationError?: boolean;
  // Prévision du modèle pour cette date (repas attendus + à préparer) — réelle
  // sortie du pipeline, disponible aussi pour les semaines futures sans menu.
  forecast: ForecastResult | null;
}

// Un jour n'est planifiable que si UN plat principal (plat_principal_1) est
// réellement renseigné ET résout à un id du catalogue (Phase 4 : plus de texte
// libre pour le plat principal — le libre non reconnu devient un candidat).
const CATALOG_DISH_IDS = new Set(DISH_OPTIONS.map((o) => o.id));

function isDayValid(day: Pick<DayDraft, 'plat_principal_1' | 'plat_principal_1_id'>): boolean {
  const v = day.plat_principal_1;
  const hasText =
    v !== null &&
    v !== undefined &&
    v.trim() !== '' &&
    v !== 'Choisir un plat...' &&
    v !== 'Choisir un plat…';
  return hasText && !!day.plat_principal_1_id && CATALOG_DISH_IDS.has(day.plat_principal_1_id);
}

const CONF_LABEL = { high: 'Élevée', medium: 'Modérée', low: 'Faible' } as const;
const CONF_BADGE = {
  high: 'bg-success/15 text-success',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-destructive/15 text-destructive',
} as const;

export default function MenusPlannerPage() {
  // Semaine affichée (démarre au dimanche). La semaine courante est définie dans
  // le premier effet (évite tout désaccord entre rendu serveur et client).
  const [weekStart, setWeekStart] = React.useState<Date | null>(null);
  const [days, setDays] = React.useState<DayDraft[] | null>(null);
  const [weekLabel, setWeekLabel] = React.useState('');
  const [savingAll, setSavingAll] = React.useState(false);
  const [lastRegen, setLastRegen] = React.useState('');
  const [marginPct, setMarginPct] = React.useState(4);

  React.useEffect(() => {
    api.getSettings().then((s) => setMarginPct(s.safetyMarginPct)).catch(() => {});
  }, []);

  const load = React.useCallback(async (week: Date) => {
    const now = new Date();
    const todayKey = isoDate(now);
    const currentWeekStart = startOfOperationalWeek(now);

    // Les 5 jours ouvrés (Dimanche → Jeudi) de la semaine affichée.
    const weekDays = operationalWeekDays(week, 5);
    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];

    const rangeLabel = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    setWeekLabel(`Semaine du ${rangeLabel(first)} au ${rangeLabel(last)}`);
    setWeekStart(week);

    let planned: MenuPlan[] = [];
    let weekFc: WeekForecastDay[] = [];
    try {
      [planned, weekFc] = await Promise.all([
        api.getPlannedMenus(isoDate(first), isoDate(last)),
        api.getWeekForecast(isoDate(week)),
      ]);
    } catch {
      planned = [];
      weekFc = [];
    }
    const map = new Map(planned.map((m) => [m.date, m]));
    const forecastByDate = new Map(weekFc.map((w) => [w.date, w.forecast]));

    // Une semaine entièrement antérieure à la semaine courante est en lecture
    // seule (consultation). Les jours déjà écoulés de la semaine courante le
    // sont aussi — "Journée passée".
    const weekReadOnly = isoDate(week) < isoDate(currentWeekStart);

    setDays(weekDays.map((d) => {
      const key = isoDate(d);
      const existing = map.get(key);
      const dayIsPast = key < todayKey;
      // Les menus enregistrés sans plat principal (anciens états invalides)
      // sont silencieusement rétrogradés en "non sauvegardé".
      const saved = existing ? isDayValid(existing) : false;
      return {
        date: key,
        dow: d.getDay(),
        entrees: existing?.entrees ?? '',
        plat_principal_1: existing?.plat_principal_1 ?? '',
        plat_principal_1_id: existing?.plat_principal_1_id || undefined,
        plat_principal_2: existing?.plat_principal_2 ?? '',
        plat_principal_2_id: existing?.plat_principal_2_id || undefined,
        saved,
        loading: false,
        isPast: dayIsPast,
        isToday: isToday(key),
        readOnly: weekReadOnly || dayIsPast,
        validationError: false,
        forecast: forecastByDate.get(key) ?? null,
      };
    }));
  }, []);

  React.useEffect(() => {
    load(startOfOperationalWeek(new Date()));
  }, [load]);

  const goPrevWeek = () => {
    if (weekStart) {
      const w = new Date(weekStart);
      w.setDate(w.getDate() - 7);
      load(w);
    }
  };

  const goNextWeek = () => {
    if (weekStart) {
      const w = new Date(weekStart);
      w.setDate(w.getDate() + 7);
      load(w);
    }
  };

  const updateDay = (idx: number, patch: Partial<DayDraft>) => {
    setDays((prev) => prev!.map((d, i) => (i === idx && !d.readOnly ? { ...d, ...patch, saved: false, validationError: false } : d)));
  };

  // Phase 4 : un texte tapé dans le picker qui ne matche aucun plat du
  // catalogue est proposé comme candidat (backend log avec fréquence).
  const proposeUnknownDish = async (text: string) => {
    if (!text.trim()) return;
    try {
      const log = await api.logUnknownDish(text.trim());
      if (log.known && log.dish_id) {
        toast.info(`« ${text.trim()} » correspond déjà au catalogue (${log.dish_id}).`);
      } else {
        toast.success(
          `« ${text.trim()} » enregistré comme candidat (${log.count} rencontre${log.count > 1 ? 's' : ''}) à examiner.`,
        );
      }
    } catch {
      toast.error("Échec de l'enregistrement du candidat.");
    }
  };

  const saveDay = async (idx: number) => {
    const day = days![idx];
    if (day.readOnly) return;
    if (!isDayValid(day)) {
      setDays((prev) => prev!.map((d, i) => (i === idx ? { ...d, validationError: true } : d)));
      const hasText = day.plat_principal_1.trim() !== '' && day.plat_principal_1 !== 'Choisir un plat...' && day.plat_principal_1 !== 'Choisir un plat…';
      const isUnknown = hasText && (!day.plat_principal_1_id || !CATALOG_DISH_IDS.has(day.plat_principal_1_id));
      toast.error(
        isUnknown
          ? `« ${day.plat_principal_1} » n'est pas dans le catalogue — choisissez un plat de la liste ou proposez-le pour examen.`
          : 'Le plat principal est requis pour enregistrer ce jour.',
      );
      return;
    }
    setDays((prev) => prev!.map((d, i) => (i === idx ? { ...d, loading: true } : d)));
    try {
      await api.savePlannedMenu({
        date: day.date,
        entrees: day.entrees,
        plat_principal_1: day.plat_principal_1,
        plat_principal_1_id: day.plat_principal_1_id,
        plat_principal_2: day.plat_principal_2,
        plat_principal_2_id: day.plat_principal_2_id,
      });
      setDays((prev) => prev!.map((d, i) => (i === idx ? { ...d, loading: false, saved: true } : d)));
      toast.success(`Menu du ${day.date} enregistré`);
      // Le menu déclenche la régénération des features côté backend → on recharge
      // immédiatement la prévision de la semaine pour ce jour.
      await refreshForecast();
    } catch {
      setDays((prev) => prev!.map((d, i) => (i === idx ? { ...d, loading: false } : d)));
      toast.error("Échec de l'enregistrement");
    }
  };

  const saveAll = async () => {
    if (!days) return;
    setSavingAll(true);
    try {
      let skipped = 0;
      for (const day of days) {
        if (day.readOnly) continue;
        if (!isDayValid(day)) { skipped += 1; continue; }
        await api.savePlannedMenu({
          date: day.date,
          entrees: day.entrees,
          plat_principal_1: day.plat_principal_1,
          plat_principal_1_id: day.plat_principal_1_id,
          plat_principal_2: day.plat_principal_2,
          plat_principal_2_id: day.plat_principal_2_id,
        });
      }
      setDays((prev) => prev!.map((d) => ({ ...d, saved: isDayValid(d) && !d.readOnly, validationError: false })));
      if (skipped > 0) {
        toast.warning(`${skipped} jour(s) sans plat valide (non reconnu ou vide) — non enregistrés.`);
      } else {
        toast.success('Tous les menus de la semaine sont enregistrés');
      }
      // Les enregistrements régénèrent les features côté backend → on recharge
      // les prévisions pour qu'elles reflètent immédiatement les nouveaux menus.
      await refreshForecast();
    } catch {
      toast.error("Erreur pendant l'enregistrement");
    } finally {
      setSavingAll(false);
    }
  };

  const handleRegenerate = async () => {
    if (!weekStart) return;
    setLastRegen('');
    const first = isoDate(startOfOperationalWeek(weekStart));
    const weekDays = operationalWeekDays(weekStart, 5);
    const last = isoDate(weekDays[weekDays.length - 1]);
    const res = await api.regenerateFeatures(first, last);
    if (res.ok) {
      const n = res.regenerated ?? 0;
      setLastRegen(
        res.failed && res.failed.length > 0
          ? `${n} date(s) régénérée(s), ${res.failed.length} en échec`
          : n > 0
            ? `${n} date(s) régénérée(s) avec succès`
            : 'Aucun menu planifié sur cette semaine à régénérer',
      );
      toast.success(n > 0 ? 'Prévisions régénérées' : 'Aucun menu à régénérer');
    } else {
      setLastRegen(res.message ?? 'Échec de la régénération');
      toast.error(res.message ?? 'Échec de la régénération');
    }
    await refreshForecast();
  };

  // Recharge uniquement les prévisions de la semaine affichée (après
  // enregistrement/régénération), sans toucher aux brouillons de menus.
  const refreshForecast = async () => {
    if (!weekStart) return;
    try {
      const weekFc = await api.getWeekForecast(isoDate(weekStart));
      const forecastByDate = new Map(weekFc.map((w) => [w.date, w.forecast]));
      setDays((prev) => prev!.map((d) => {
        const fc = forecastByDate.get(d.date) ?? null;
        return fc ? { ...d, forecast: fc } : d;
      }));
    } catch {
      // Prévisions conservées telles quelles — les menus restent modifiables.
    }
  };

  if (!days) {
    return <Skeleton className="h-96 w-full rounded-lg" />;
  }

  const weekIsReadOnly = days.every((d) => d.readOnly);
  const plannedCount = days.filter((d) => d.saved).length;
  const missedCount = days.filter((d) => d.isPast && !d.saved).length;

  const renderDayCard = (day: DayDraft, idx: number) => {
    const dowLabel = OPERATIONAL_WEEKDAYS.find((w) => w.dow === day.dow)?.label ?? '';
    const dLabel = new Date(`${day.date}T00:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });
    const isMissed = day.isPast && !day.saved;

    return (
      <Card
        key={day.date}
        className={cn(
          'overflow-hidden border-border shadow-sm transition-colors',
          day.readOnly && 'opacity-70',
          day.saved && !isMissed && 'border-success/30',
          isMissed && 'border-destructive/40',
        )}
      >
        <div
          className={cn(
            'flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 bg-muted/25 px-5 py-3.5',
            day.readOnly && 'bg-muted/40',
            day.saved && !isMissed && 'bg-success/[0.06]',
            isMissed && 'bg-destructive/[0.05]',
          )}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold',
                day.saved
                  ? 'bg-success/15 text-success'
                  : isMissed
                    ? 'bg-destructive/15 text-destructive'
                    : 'bg-primary/10 text-primary',
              )}
            >
              {dowLabel.slice(0, 3)}
            </div>
            <div>
              <p className="text-base font-semibold leading-tight text-foreground capitalize">{dLabel}</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2.5">
            {day.isPast && (
              <span className="flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Clock className="h-3 w-3" /> Journée passée
              </span>
            )}
            {day.isToday && !day.saved && (
              <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                <Clock className="h-3 w-3" /> Menu du jour manquant
              </span>
            )}
            {isMissed && (
              <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" /> Passé — menu non renseigné
              </span>
            )}
            {day.saved && !day.isPast && !day.isToday && (
              <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                <Check className="h-3 w-3" /> Menu renseigné
              </span>
            )}
            {day.isToday && day.saved && (
              <span className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                Menu du jour
              </span>
            )}
            {day.readOnly ? (
              <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <Lock className="h-3 w-3" /> Lecture seule
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveDay(idx)}
                disabled={day.loading}
              >
                {day.loading
                  ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  : <Save className="mr-1 h-3 w-3" />}
                {day.saved ? 'Mettre à jour' : 'Planifier'}
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-3">
          <div className="space-y-2 rounded-lg border border-border/60 bg-card p-3 transition-colors focus-within:border-primary/40">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                <Salad className="h-3.5 w-3.5" />
              </span>
              Entrées
            </Label>
            <DishPicker
              options={ENTREE_OPTIONS}
              groups={ENTREE_GROUPS}
              value={day.entrees}
              placeholder="Salade / Soupe…"
              disabled={day.readOnly}
              onTextChange={(t) => updateDay(idx, { entrees: t })}
              onSelect={(o) =>
                updateDay(idx, { entrees: o ? o.name : day.entrees })
              }
            />
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-card p-3 transition-colors focus-within:border-primary/40">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                <ChefHat className="h-3.5 w-3.5" />
              </span>
              Plat principal
            </Label>
            <DishPicker
              options={DISH_OPTIONS}
              groups={DISH_CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color }))}
              value={day.plat_principal_1}
              dishId={day.plat_principal_1_id}
              placeholder="Choisir un plat…"
              disabled={day.readOnly}
              onTextChange={(t) => updateDay(idx, { plat_principal_1: t })}
              onSelect={(o) =>
                updateDay(idx, {
                  plat_principal_1: o ? o.name : day.plat_principal_1,
                  plat_principal_1_id: o ? o.id : undefined,
                })
              }
              onProposeUnknown={proposeUnknownDish}
            />
            {day.validationError && (
              <p className="text-xs font-medium text-destructive">
                {day.plat_principal_1.trim() !== '' &&
                day.plat_principal_1 !== 'Choisir un plat...' &&
                day.plat_principal_1 !== 'Choisir un plat…' &&
                (!day.plat_principal_1_id || !CATALOG_DISH_IDS.has(day.plat_principal_1_id))
                  ? `« ${day.plat_principal_1} » n'est pas dans le catalogue — choisissez un plat de la liste ou proposez-le pour examen.`
                  : 'Le plat principal est requis pour enregistrer ce jour.'}
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-lg border border-border/60 bg-card p-3 transition-colors focus-within:border-primary/40">
            <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted">
                <Utensils className="h-3.5 w-3.5" />
              </span>
              Accompagnement / Plat 2
              <span className="font-normal text-muted-foreground/70">(optionnel)</span>
            </Label>
            <DishPicker
              options={ACC_OPTIONS}
              groups={ACCOMPANIMENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
              value={day.plat_principal_2}
              dishId={day.plat_principal_2_id}
              placeholder="Choisir un accompagnement…"
              disabled={day.readOnly}
              onTextChange={(t) => updateDay(idx, { plat_principal_2: t })}
              onSelect={(o) =>
                updateDay(idx, {
                  plat_principal_2: o ? o.name : day.plat_principal_2,
                  plat_principal_2_id: o ? o.id : undefined,
                })
              }
            />
          </div>
        </div>

        {day.forecast && day.forecast.forecastAvailable && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 bg-muted/15 px-5 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-muted-foreground">
                Prévision du modèle :
              </span>
              <span className="text-sm font-bold text-foreground">
                {formatNumber(day.forecast.employeesCount)} repas
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                À préparer (marge +{marginPct}%) :
              </span>
              <span className="text-sm font-bold text-primary">
                {formatNumber(day.forecast.recommendedMeals)} repas
              </span>
              <span className="text-xs text-muted-foreground">
                intervalle {formatNumber(day.forecast.confidenceLower)}–
                {formatNumber(day.forecast.confidenceUpper)}
              </span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-xs font-medium',
                  CONF_BADGE[day.forecast.confidenceLevel],
                )}
              >
                Fiabilité {CONF_LABEL[day.forecast.confidenceLevel]}
              </span>
            </div>
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 animate-fade-in">
      {/* ── En-tête + navigation hebdomadaire ─────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarDays className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Planification des menus</h1>
              <p className="text-sm text-muted-foreground">Planifiez les menus des jours de service</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Button variant="outline" size="sm" onClick={goPrevWeek} disabled={!weekStart}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Semaine précédente
            </Button>
            <span className="min-w-44 text-center text-sm font-medium text-foreground">{weekLabel}</span>
            <Button variant="outline" size="sm" onClick={goNextWeek} disabled={!weekStart}>
              Semaine suivante
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <span className="mx-1 h-6 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={weekIsReadOnly || plannedCount === 0}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Générer les prévisions
            </Button>
            <Button onClick={saveAll} disabled={savingAll || weekIsReadOnly} size="sm">
              {savingAll
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Save className="mr-2 h-4 w-4" />}
              Tout enregistrer
            </Button>
          </div>
        </div>
        {!weekIsReadOnly && (
          <p className="mt-3 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{plannedCount}/5</span> jours planifiés cette semaine
            {missedCount > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 font-medium text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {missedCount} journée(s) écoulée(s) sans menu
              </span>
            )}
          </p>
        )}
        {weekIsReadOnly && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Lock className="h-3 w-3" />
            Semaine passée — consultation seule, aucune modification possible.
          </p>
        )}
        {lastRegen && (
          <p className="mt-2 text-xs text-muted-foreground">{lastRegen}</p>
        )}
      </div>

      {/* ── Les 5 jours ouvrés (Dimanche → Jeudi) ─────────── */}
      <div className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          Jours de service
        </h2>
        {days.map((day) => renderDayCard(day, days.indexOf(day)))}
      </div>

      {/* ── Note ──────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Info className="h-4 w-4" />
        </span>
        <div className="space-y-1.5 text-xs leading-relaxed">
          <p className="font-medium text-foreground">Gestion du planning</p>
          <p>
            Vendredi et samedi sont des <strong>jours non opérationnels</strong> : ils ne comptent pas
            dans la semaine. Les jours déjà écoulés sont en lecture seule (« Journée passée ») et
            conservent leur menu. Naviguez vers les <strong>semaines futures</strong> pour y planifier
            les menus : dès qu&apos;un menu est enregistré, la <strong>prévision du modèle</strong> devient
            disponible pour ce jour (menu → features → modèle). Sans menu planifié, aucune prévision
            n&apos;est générée.
          </p>
        </div>
      </div>
    </div>
  );
}
