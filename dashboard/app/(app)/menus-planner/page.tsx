'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DishPicker, type DishPickerOption } from '@/components/menus/dish-picker';
import { api } from '@/lib/api';
import type { MenuPlan } from '@/lib/types';
import {
  DISHES,
  DISH_CATEGORIES,
  ACCOMPANIMENTS,
  ACCOMPANIMENT_CATEGORIES,
} from '@/lib/menu-catalog';
import { cn } from '@/lib/utils';
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
} from 'lucide-react';

/**
 * Planificateur de menus hebdomadaire.
 *
 * Le gestionnaire renseigne les menus de la semaine (Dimanche → Jeudi) *à
 * l'avance* pour que le pipeline de features (daily_features.py) puisse
 * reconstruire les jours cibles avec les vrais menus — et non des menus vides.
 *
 * Chaque jour possède 3 champs : entrées, plat principal 1, plat principal 2.
 * Les plats principaux sont choisis dans le catalogue canonique
 * (menu-catalog.json -> menu-catalog.ts) avec un badge de ratio attendu ;
 * l'identifiant canonique est envoyé à l'API pour un mapping exact. Les
 * entrées sont proposées sous forme de liste (valeurs issues des données
 * historiques) tout en restant libres en texte. Enregistrer écrit dans
 * data/processed/planned_menus.csv via l'API.
 */

// Ordre réel de la semaine locale BNP : Dimanche → Jeudi
const WEEKDAYS: { dow: number; label: string }[] = [
  { dow: 0, label: 'Dimanche' },
  { dow: 1, label: 'Lundi' },
  { dow: 2, label: 'Mardi' },
  { dow: 3, label: 'Mercredi' },
  { dow: 4, label: 'Jeudi' },
];

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

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Renvoie les 5 jours ouvrés de la semaine locale (Dimanche → Jeudi). */
function isWorkday(dow: number): boolean {
  return [0, 1, 2, 3, 4].includes(dow); // DOW JS: 0=Dimanche, ..., 4=Jeudi
}

function startOfLocalWorkWeek(from: Date): Date {
  const start = new Date(from);
  while (start.getDay() !== 0) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

function nextWorkDays(from: Date, n = 5): Date[] {
  const out: Date[] = [];
  const cursor = startOfLocalWorkWeek(from);
  while (out.length < n) {
    const dow = cursor.getDay();
    if (isWorkday(dow)) {
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

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
}

export default function MenusPlannerPage() {
  const [days, setDays] = React.useState<DayDraft[] | null>(null);
  const [weekStartLabel, setWeekStartLabel] = React.useState('');
  const [savingAll, setSavingAll] = React.useState(false);
  const [lastRegen, setLastRegen] = React.useState('');

  const load = React.useCallback(async () => {
    const start = new Date();
    const alignedStart = startOfLocalWorkWeek(start);
    const alignedDays: Date[] = [];
    let cursor = new Date(alignedStart);

    for (let i = 0; i < 5; i += 1) {
      alignedDays.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
      while (!isWorkday(cursor.getDay())) {
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    const first = alignedDays[0];
    const last = alignedDays[alignedDays.length - 1];
    const monthFmt = (d: Date) =>
      `${d.toLocaleDateString('fr-FR', { day: 'numeric' })} ${d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
    setWeekStartLabel(`${monthFmt(first)} – ${monthFmt(last)}`);

    let planned: MenuPlan[] = [];
    try {
      planned = await api.getPlannedMenus(isoDate(first), isoDate(last));
    } catch {
      planned = [];
    }
    const map = new Map(planned.map((m) => [m.date, m]));

    setDays(alignedDays.map((d) => {
      const key = isoDate(d);
      const existing = map.get(key);
      return {
        date: key,
        dow: d.getDay(),
        entrees: existing?.entrees ?? '',
        plat_principal_1: existing?.plat_principal_1 ?? '',
        plat_principal_1_id: existing?.plat_principal_1_id || undefined,
        plat_principal_2: existing?.plat_principal_2 ?? '',
        plat_principal_2_id: existing?.plat_principal_2_id || undefined,
        saved: !!existing,
        loading: false,
      };
    }));
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const updateDay = (idx: number, patch: Partial<DayDraft>) => {
    setDays((prev) => prev!.map((d, i) => (i === idx ? { ...d, ...patch, saved: false } : d)));
  };

  const saveDay = async (idx: number) => {
    const day = days![idx];
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
    } catch {
      setDays((prev) => prev!.map((d, i) => (i === idx ? { ...d, loading: false } : d)));
      toast.error("Échec de l'enregistrement");
    }
  };

  const saveAll = async () => {
    if (!days) return;
    setSavingAll(true);
    try {
      for (const day of days) {
        await api.savePlannedMenu({
          date: day.date,
          entrees: day.entrees,
          plat_principal_1: day.plat_principal_1,
          plat_principal_1_id: day.plat_principal_1_id,
          plat_principal_2: day.plat_principal_2,
          plat_principal_2_id: day.plat_principal_2_id,
        });
      }
      setDays((prev) => prev!.map((d) => ({ ...d, saved: true })));
      toast.success('Tous les menus de la semaine sont enregistrés');
    } catch {
      toast.error("Erreur pendant l'enregistrement");
    } finally {
      setSavingAll(false);
    }
  };

  const handleRegenerate = async () => {
    setLastRegen('');
    const res = await api.regenerateFeatures();
    if (res.ok) {
      setLastRegen(res.message ?? 'Tâche déclenchée');
      toast.success('Features à régénérer — vérifiez la console/backend');
    }
  };

  if (!days) {
    return <Skeleton className="h-96 w-full rounded-lg" />;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-fade-in">
      {/* ── En-tête ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <CalendarDays className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Planification hebdomadaire</h1>
            <p className="text-sm text-muted-foreground">
              Semaine de travail (Dimanche → Jeudi) · {weekStartLabel}
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            { step: '1', title: 'Menu', text: 'Choisir les repas de la semaine' },
            { step: '2', title: 'Vérif', text: 'Contrôler chaque jour' },
            { step: '3', title: 'Sauvegarde', text: 'Enregistrer la semaine' },
            { step: '4', title: 'Prévision', text: 'Préparer les 7 jours' },
          ].map((item) => (
            <div key={item.step} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary">
                  {item.step}
                </span>
                <span className="text-sm font-semibold text-foreground">{item.title}</span>
              </div>
              <p className="text-xs text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Actions ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={saveAll} disabled={savingAll} size="lg">
          {savingAll
            ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            : <Save className="mr-2 h-4 w-4" />}
          Enregistrer la semaine
        </Button>
        <Button variant="outline" size="lg" onClick={handleRegenerate}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Générer les prévisions
        </Button>
        {lastRegen && (
          <span className="text-xs text-muted-foreground">{lastRegen}</span>
        )}
      </div>

      {/* ── Les 5 jours ouvrés (Dimanche → Jeudi) ────────── */}
      <div className="space-y-4">
        {days.map((day, idx) => {
          const dowLabel = WEEKDAYS.find((w) => w.dow === day.dow)?.label ?? '';
          const dateLabel = new Date(day.date).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'short',
          });
          return (
            <Card
              key={day.date}
              className={cn(
                'border-border p-5 transition-colors',
                day.saved && 'border-success/30 bg-success/[0.03]',
              )}
            >
              {/* En-tête du jour */}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-lg bg-primary/10 px-3 py-2">
                    <span className="text-sm font-bold uppercase tracking-wide text-primary">
                      {dowLabel.slice(0, 3)}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold leading-tight text-foreground">
                      {dowLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">{dateLabel}</p>
                  </div>
                </div>

                {day.saved && (
                  <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                    <Check className="h-3 w-3" /> Enregistré
                  </span>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={() => saveDay(idx)}
                  disabled={day.loading}
                >
                  {day.loading
                    ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    : <Save className="mr-1 h-3 w-3" />}
                  {day.saved ? 'Mettre à jour' : 'Enregistrer'}
                </Button>
              </div>

              {/* Champs du jour — 3 colonnes sur écran large */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Salad className="h-3.5 w-3.5" /> Entrées
                  </Label>
                  <DishPicker
                    options={ENTREE_OPTIONS}
                    groups={ENTREE_GROUPS}
                    value={day.entrees}
                    placeholder="Salade / Soupe…"
                    onTextChange={(t) => updateDay(idx, { entrees: t })}
                    onSelect={(o) =>
                      updateDay(idx, { entrees: o ? o.name : day.entrees })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ChefHat className="h-3.5 w-3.5" /> Plat principal
                  </Label>
                  <DishPicker
                    options={DISH_OPTIONS}
                    groups={DISH_CATEGORIES.map((c) => ({ id: c.id, label: c.label, color: c.color }))}
                    value={day.plat_principal_1}
                    dishId={day.plat_principal_1_id}
                    placeholder="Choisir un plat…"
                    onTextChange={(t) => updateDay(idx, { plat_principal_1: t })}
                    onSelect={(o) =>
                      updateDay(idx, {
                        plat_principal_1: o ? o.name : day.plat_principal_1,
                        plat_principal_1_id: o ? o.id : undefined,
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Utensils className="h-3.5 w-3.5" /> Accompagnement / Plat 2
                    <span className="font-normal text-muted-foreground/70">(optionnel)</span>
                  </Label>
                  <DishPicker
                    options={ACC_OPTIONS}
                    groups={ACCOMPANIMENT_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))}
                    value={day.plat_principal_2}
                    dishId={day.plat_principal_2_id}
                    placeholder="Choisir un accompagnement…"
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
            </Card>
          );
        })}
      </div>

      {/* ── Note pédagogique ────────────────────────────────── */}
      <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Les plats principaux proviennent du catalogue canonique unifié (
          <code>menu-catalog.json</code>) partagé avec le pipeline{' '}
          <code>build_menu_features</code>. Chaque plat affiche la bande de ratio
          attendue. Vous pouvez aussi saisir un texte libre — il est rapproché du
          catalogue à l&apos;enregistrement, et l&apos;identifiant canonique est conservé pour
          un mapping exact à l&apos;inférence.
        </p>
      </div>
    </div>
  );
}
