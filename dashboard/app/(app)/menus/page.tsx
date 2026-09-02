'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { MenuPlan } from '@/lib/types';
import { getDishesByCategory, DISH_CATEGORIES, MENU_STATS } from '@/lib/menu-catalog';
import { Info, Salad, ChefHat, Utensils } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ordre réel de la semaine locale BNP : Dimanche → Jeudi
const WEEKDAYS: { dow: number; label: string }[] = [
  { dow: 0, label: 'Dimanche' },
  { dow: 1, label: 'Lundi' },
  { dow: 2, label: 'Mardi' },
  { dow: 3, label: 'Mercredi' },
  { dow: 4, label: 'Jeudi' },
];

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isWorkday(dow: number): boolean {
  return [0, 1, 2, 3, 4].includes(dow);
}

function localWorkWeek(): Date[] {
  const start = new Date();
  while (start.getDay() !== 0) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(0, 0, 0, 0);
  const out: Date[] = [];
  const cursor = new Date(start);
  while (out.length < 5) {
    if (isWorkday(cursor.getDay())) {
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export default function MenusPage() {
  const [plans, setPlans] = React.useState<MenuPlan[] | null>(null);

  React.useEffect(() => {
    const days = localWorkWeek();
    const first = days[0];
    const last = days[days.length - 1];
    api.getPlannedMenus(isoDate(first), isoDate(last)).then(setPlans);
  }, []);

  if (!plans) return <Skeleton className="h-96 w-full rounded-lg" />;

  const days = localWorkWeek();
  const planMap = new Map(plans.map((m) => [m.date, m]));

  const weekRows = days.map((d) => {
    const plan = planMap.get(isoDate(d));
    return {
      dow: d.getDay(),
      dateLabel: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      entrees: plan?.entrees || '',
      plat1: plan?.plat_principal_1 || '',
      plat2: plan?.plat_principal_2 || '',
      planned: !!plan,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Weekly menu table (real planned menus from the planner) */}
      <Card className="p-6">
        <SectionHeader
          title="Menus de la semaine"
          description="Planification (Dimanche → Jeudi) enregistrée via le planificateur"
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Jour</th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Entrées</th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Plat principal</th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Accompagnement / Plat 2</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((row) => (
                <tr
                  key={row.dow}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center rounded-lg bg-primary/10 px-2.5 py-1.5">
                        <span className="text-xs font-bold uppercase tracking-wide text-primary">
                          {(WEEKDAYS.find((w) => w.dow === row.dow)?.label ?? '').slice(0, 3)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {WEEKDAYS.find((w) => w.dow === row.dow)?.label}
                        </p>
                        <p className="text-xs text-muted-foreground">{row.dateLabel}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">{row.entrees || '—'}</td>
                  <td className="py-3 pr-4 text-foreground">{row.plat1 || '—'}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{row.plat2 || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {weekRows.every((r) => !r.planned) && (
            <p className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Aucun menu enregistré pour cette semaine. Utilisez le
              planificateur pour renseigner les menus (Dimanche → Jeudi).
            </p>
          )}
        </div>
      </Card>

      {/* Reference catalog: canonical dishes with ratio bands */}
      <Card className="p-6">
        <SectionHeader
          title="Catalogue canonique des plats"
          description={`${MENU_STATS.totalDishes} plats · ${MENU_STATS.highRatioDishes} à fort ratio · source partagée avec le pipeline (menu-catalog.json)`}
        />
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          {DISH_CATEGORIES.map((cat) => {
            const dishes = getDishesByCategory()[cat.id];
            return (
              <div key={cat.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <div
                  className="flex items-center gap-2 border-b border-border px-4 py-3"
                  style={{ backgroundColor: `${cat.color}0f` }}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                  <p className="text-sm font-semibold text-foreground">{cat.label}</p>
                  <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {dishes.length} plats
                  </span>
                </div>
                <ul className="divide-y divide-border/60">
                  {dishes.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex-1 text-sm text-foreground">{d.name}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {(d.typical_ratio * 100).toFixed(0).replace('.', ',')}%
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          'shrink-0 px-2 py-0.5 text-[10px] font-semibold',
                          ratioBadgeClass(d.ratio_effect),
                        )}
                      >
                        {d.ratio_effect}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-start gap-4 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Salad className="h-3.5 w-3.5 shrink-0" />
            <span>Entrées</span>
          </div>
          <div className="flex items-center gap-2">
            <ChefHat className="h-3.5 w-3.5 shrink-0" />
            <span>Plat principal</span>
          </div>
          <div className="flex items-center gap-2">
            <Utensils className="h-3.5 w-3.5 shrink-0" />
            <span>Accompagnement</span>
          </div>
          <div className="flex items-center gap-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <p>
              Ce catalogue (en lecture seule) est la source de vérité unique partagée avec le
              pipeline de features (<code>build_menu_features</code>) et le planificateur de
              menus. Le pourcentage indique le ratio de participation attendu, et le badge sa bande.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function ratioBadgeClass(effect: string) {
  if (effect === 'très élevé' || effect === 'élevé') {
    return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  }
  if (effect === 'faible') {
    return 'bg-sky-100 text-sky-700 border-sky-200';
  }
  return 'bg-amber-100 text-amber-700 border-amber-200';
}
