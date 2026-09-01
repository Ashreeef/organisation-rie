'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { MenuItem } from '@/lib/types';
import { getDishesByCategory, DISH_CATEGORIES, MENU_STATS } from '@/lib/menu-catalog';
import { Star, ChefHat, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const wasteLabels: { threshold: number; label: string; color: string }[] = [
  { threshold: 5, label: 'Faible', color: 'text-success' },
  { threshold: 8, label: 'Moyen', color: 'text-warning' },
  { threshold: 100, label: 'Élevé', color: 'text-destructive' },
];

function getWasteLabel(rate: number) {
  return wasteLabels.find((w) => rate < w.threshold) ?? wasteLabels[wasteLabels.length - 1];
}

const popularityLabels: { threshold: number; label: string }[] = [
  { threshold: 90, label: 'Très apprécié' },
  { threshold: 80, label: 'Apprécié' },
  { threshold: 70, label: 'Moyen' },
  { threshold: 0, label: 'Peu apprécié' },
];

function getPopularity(rate: number) {
  return popularityLabels.find((p) => rate >= p.threshold) ?? popularityLabels[popularityLabels.length - 1];
}

const weeklyPlan = [
  { day: 'Dimanche', menuId: 'menu-1' },
  { day: 'Lundi', menuId: 'menu-2' },
  { day: 'Mardi', menuId: 'menu-3' },
  { day: 'Mercredi', menuId: 'menu-4' },
  { day: 'Jeudi', menuId: 'menu-1' },
];

export default function MenusPage() {
  const [menus, setMenus] = React.useState<MenuItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.getMenus().then((m) => {
      setMenus(m);
      setLoading(false);
    });
  }, []);

  if (loading) return <Skeleton className="h-96 w-full rounded-lg" />;

  const menuMap = new Map(menus.map((m) => [m.id, m]));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Weekly menu table */}
      <Card className="p-6">
        <SectionHeader
          title="Menus de la semaine"
          description="Planning des menus et leurs caractéristiques"
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Jour</th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Menu</th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Popularité</th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Gaspillage habituel</th>
              </tr>
            </thead>
            <tbody>
              {weeklyPlan.map((entry) => {
                const menu = menuMap.get(entry.menuId);
                if (!menu) return null;
                const waste = getWasteLabel(menu.predictedWaste);
                const pop = getPopularity(menu.attractiveness);
                return (
                  <tr
                    key={entry.day}
                    className="border-b border-border/50 transition-colors hover:bg-muted/30"
                  >
                    <td className="py-3 pr-4 font-medium text-foreground">{entry.day}</td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        {menu.isRecommended && (
                          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                        )}
                        <span className="font-medium text-foreground">{menu.name}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">{pop.label}</td>
                    <td className={cn('py-3 pr-4 font-medium', waste.color)}>
                      <span className="flex items-center gap-1.5">
                        <span className={cn('h-2 w-2 rounded-full', waste.color.replace('text-', 'bg-'))} />
                        {waste.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* All menus as cards */}
      <Card className="p-6">
        <SectionHeader
          title="Tous les menus"
          description={`${menus.length} menus disponibles`}
        />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {menus.map((menu) => {
            const waste = getWasteLabel(menu.predictedWaste);
            const pop = getPopularity(menu.attractiveness);
            return (
              <div
                key={menu.id}
                className={cn(
                  'rounded-lg border bg-card p-5 transition-shadow hover:shadow-md',
                  menu.isRecommended ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border'
                )}
              >
                {menu.isRecommended && (
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <Star className="h-3.5 w-3.5 fill-primary" />
                    Recommandé
                  </div>
                )}
                <p className="text-sm font-semibold text-foreground">{menu.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{menu.description}</p>
                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <ChefHat className="h-3.5 w-3.5" /> Popularité
                    </span>
                    <span className="font-medium text-foreground">{pop.label}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      Gaspillage
                    </span>
                    <span className={cn('flex items-center gap-1.5 font-medium', waste.color)}>
                      <span className={cn('h-2 w-2 rounded-full', waste.color.replace('text-', 'bg-'))} />
                      {waste.label}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
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
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <p>
            Ce catalogue (en lecture seule) est la source de vérité unique partagée avec le pipeline
            de features (<code>build_menu_features</code>) et le planificateur de menus. Le pourcentage
            indique le ratio de participation attendu, et le badge sa bande.
          </p>
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
