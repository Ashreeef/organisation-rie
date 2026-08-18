'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionHeader } from '@/components/shared/section-header';
import { KPIWidget } from '@/components/shared/kpi-widget';
import { ForecastChart } from '@/components/shared/forecast-chart';
import { api } from '@/lib/api';
import type {
  DailyCycle,
  Dish,
  DishCategory,
  MenuElement,
  KPI,
  ForecastVsActualPoint,
  ForecastResult,
} from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  Users,
  UtensilsCrossed,
  ChefHat,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  AlertCircle,
  Clock,
  Pencil,
  Save,
  ArrowRight,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  upcoming: { label: 'Service à venir', color: 'text-primary', bg: 'bg-primary/10' },
  in_progress: { label: 'Service en cours', color: 'text-warning', bg: 'bg-warning/10' },
  awaiting_closure: { label: 'Service terminé — bilan à saisir', color: 'text-warning', bg: 'bg-warning/10' },
  confirmation_required: { label: 'Confirmation requise', color: 'text-warning', bg: 'bg-warning/10' },
  closed: { label: 'Journée clôturée', color: 'text-success', bg: 'bg-success/10' },
};

export default function DashboardPage() {
  const [cycle, setCycle] = React.useState<DailyCycle | null>(null);
  const [dishes, setDishes] = React.useState<Dish[]>([]);
  const [categories, setCategories] = React.useState<DishCategory[]>([]);
  const [kpis, setKpis] = React.useState<KPI[]>([]);
  const [chartData, setChartData] = React.useState<ForecastVsActualPoint[]>([]);
  const [tomorrowForecast, setTomorrowForecast] = React.useState<ForecastResult | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Data entry form state
  const [mealsPrepared, setMealsPrepared] = React.useState('');
  const [mealsServed, setMealsServed] = React.useState('');
  const [managerComment, setManagerComment] = React.useState('');
  const [menuItems, setMenuItems] = React.useState<MenuElement[]>([]);
  const [showMenuEditor, setShowMenuEditor] = React.useState(false);

  const refresh = React.useCallback(() => {
    Promise.all([
      api.getDailyCycle(),
      api.getDishes(),
      api.getDishCategories(),
      api.getDashboardKPIs(),
      api.getForecastVsActual(14),
      api.getTomorrowForecast(),
    ]).then(([c, d, cat, k, chart, f]) => {
      setCycle(c);
      setDishes(d);
      setCategories(cat);
      setKpis(k);
      setChartData(chart);
      setTomorrowForecast(f);
      setMealsPrepared(c.service.mealsPrepared?.toString() ?? '');
      setMenuItems(c.service.menu ?? []);
      setLoading(false);
    });
  }, []);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading || !cycle) return <DashboardSkeleton />;

  const status = cycle.service.status;
  const config = statusConfig[status];
  const todayLabel = new Date(cycle.service.date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const preparedNum = Number(mealsPrepared) || 0;
  const servedNum = Number(mealsServed) || 0;
  const remainingCalc = Math.max(0, preparedNum - servedNum);
  const wasteRateCalc = preparedNum > 0 ? (remainingCalc / preparedNum) * 100 : 0;

  const handleSaveResults = () => {
    if (preparedNum === 0) {
      toast.error('Veuillez saisir le nombre de repas préparés.');
      return;
    }
    api.saveServiceResults({
      mealsPrepared: preparedNum,
      mealsServed: servedNum,
      managerComment,
      menu: menuItems,
    }).then((c) => {
      setCycle(c);
      toast.success('Bilan enregistré. Veuillez vérifier et confirmer.');
    });
  };

  const handleConfirm = () => {
    api.confirmService().then((c) => {
      setCycle(c);
      toast.success('Journée clôturée. La préparation de demain est disponible.');
    });
  };

  const handleEdit = () => {
    api.updateServiceStatus('awaiting_closure').then((c) => setCycle(c));
  };

  const handleStartService = () => {
    api.updateServiceStatus('in_progress').then((c) => setCycle(c));
  };

  const handleEndService = () => {
    api.updateServiceStatus('awaiting_closure').then((c) => setCycle(c));
  };

  const dishName = (dishId: string) => dishes.find((d) => d.id === dishId)?.name ?? 'Non renseign\u00e9';
  const categoryName = (catId: string) => categories.find((c) => c.id === catId)?.name ?? 'Autre';

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Status banner */}
      <div className={cn('flex items-center gap-3 rounded-lg border p-4', config.bg, 'border-current/10')}>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', config.bg)}>
          {status === 'closed' ? (
            <CheckCircle2 className={cn('h-6 w-6', config.color)} />
          ) : status === 'in_progress' ? (
            <Clock className={cn('h-6 w-6', config.color)} />
          ) : (
            <AlertCircle className={cn('h-6 w-6', config.color)} />
          )}
        </div>
        <div className="flex-1">
          <p className={cn('text-sm font-semibold capitalize', config.color)}>{config.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground capitalize">{todayLabel}</p>
        </div>
        {status === 'in_progress' && (
          <Button onClick={handleEndService} variant="default">
            Terminer le service
          </Button>
        )}
        {status === 'upcoming' && (
          <Button onClick={handleStartService} variant="default">
            Démarrer le service
          </Button>
        )}
      </div>

      {/* STATE A/B: Before or during service — show today's prep, no tomorrow */}
      {(status === 'upcoming' || status === 'in_progress') && (
        <>
          <Card className="p-6">
            <SectionHeader title="Service d'aujourd'hui" description="Informations de préparation" />
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <Users className="h-5 w-5 text-primary" />
                <p className="mt-2 text-xs text-muted-foreground">Employ\u00e9s attendus</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{formatNumber(cycle.service.employeesExpected)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                <p className="mt-2 text-xs text-muted-foreground">Repas préparés</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{formatNumber(cycle.service.mealsPrepared ?? 0)}</p>
              </div>
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <ChefHat className="h-5 w-5 text-primary" />
                <p className="mt-2 text-xs text-muted-foreground">Menu du jour</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {menuItems.map((m) => dishName(m.dishId)).join(' · ') || 'Non défini'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <SectionHeader title="Menu du jour" description="Plats prévus pour aujourd'hui" />
            <div className="mt-4 space-y-2">
              {menuItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun menu d\u00e9fini.</p>
              ) : (
                menuItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{categoryName(item.categoryId)}</span>
                    <span className="text-sm font-medium text-foreground">{dishName(item.dishId)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </>
      )}

      {/* STATE C: Service finished, data not entered — show entry form */}
      {status === 'awaiting_closure' && (
        <Card className="p-6">
          <SectionHeader title="Bilan du service" description="Saisissez les r\u00e9sultats du jour" />
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prepared">Repas préparés</Label>
                <Input id="prepared" type="number" placeholder="330" value={mealsPrepared} onChange={(e) => setMealsPrepared(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="served">Repas servis</Label>
                <Input id="served" type="number" placeholder="312" value={mealsServed} onChange={(e) => setMealsServed(e.target.value)} />
              </div>
            </div>

            {preparedNum > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Repas restants</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{remainingCalc}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Taux de gaspillage</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{formatPercent(wasteRateCalc)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Menu confirmation */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Menu du jour</Label>
                <button onClick={() => setShowMenuEditor((v) => !v)} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  <Pencil className="h-3 w-3" />
                  {showMenuEditor ? 'Fermer' : 'Modifier le menu'}
                </button>
              </div>
              {showMenuEditor ? (
                <MenuEditor
                  categories={categories}
                  dishes={dishes}
                  items={menuItems}
                  onChange={setMenuItems}
                />
              ) : (
                <div className="mt-2 space-y-2">
                  {menuItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2.5">
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{categoryName(item.categoryId)}</span>
                      <span className="text-sm font-medium text-foreground">{dishName(item.dishId)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="comment">Commentaire (optionnel)</Label>
              <Textarea id="comment" placeholder="Exemple: Forte affluence entre 12h30 et 13h15." value={managerComment} onChange={(e) => setManagerComment(e.target.value)} rows={2} />
            </div>

            <Button size="lg" className="w-full" onClick={handleSaveResults}>
              <Save className="mr-2 h-4 w-4" />
              Enregistrer le bilan
            </Button>
          </div>
        </Card>
      )}

      {/* STATE D: Data entered, not confirmed — show review */}
      {status === 'confirmation_required' && (
        <Card className="p-6">
          <SectionHeader title="Vérifier le bilan" description="Confirmez les informations saisies" />
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <ReviewItem label="Préparés" value={formatNumber(cycle.service.mealsPrepared ?? 0)} />
              <ReviewItem label="Servis" value={formatNumber(cycle.service.mealsServed ?? 0)} />
              <ReviewItem label="Restants" value={formatNumber(cycle.service.mealsRemaining ?? 0)} />
              <ReviewItem label="Gaspillage" value={formatPercent(wasteRateCalc)} />
            </div>
            {cycle.service.managerComment && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">Commentaire</p>
                <p className="mt-1 text-sm text-foreground">{cycle.service.managerComment}</p>
              </div>
            )}
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Menu servi</p>
              <div className="mt-2 space-y-1.5">
                {cycle.service.menu.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{categoryName(item.categoryId)}</span>
                    <span className="font-medium text-foreground">{dishName(item.dishId)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Ces informations sont-elles correctes ?</p>
          <div className="mt-3 flex gap-3">
            <Button onClick={handleConfirm} className="flex-1">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmer et cl\u00f4turer
            </Button>
            <Button onClick={handleEdit} variant="outline" className="flex-1">
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          </div>
        </Card>
      )}

      {/* STATE E: Day closed — show results + unlock tomorrow */}
      {status === 'closed' && (
        <>
          <Card className="border-success/30 bg-success/5 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-xl font-bold text-success">Journée clôturée</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatNumber(cycle.service.mealsPrepared ?? 0)} préparés · {formatNumber(cycle.service.mealsServed ?? 0)} servis · {formatNumber(cycle.service.mealsRemaining ?? 0)} restants · {formatPercent(wasteRateCalc)} gaspillage
                </p>
              </div>
            </div>
          </Card>

          {/* Tomorrow unlocked */}
          {tomorrowForecast && (
            <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-card p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-primary">Préparation du lendemain</p>
                  <p className="mt-1 text-xs text-muted-foreground">Mardi 18 ao\u00fbt 2026</p>
                </div>
                <Badge variant="outline" className="gap-1.5 border-success/30 bg-success/5 text-success">
                  <CheckCircle2 className="h-3 w-3" />
                  Disponible
                </Badge>
              </div>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-6 lg:gap-10">
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employ\u00e9s attendus</p>
                  <p className="mt-1 text-4xl font-bold text-foreground">{formatNumber(tomorrowForecast.expectedPresence)}</p>
                </div>
                <ChevronRight className="h-6 w-6 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">Repas recommandés</p>
                  <p className="mt-1 text-5xl font-bold text-primary">{formatNumber(tomorrowForecast.recommendedMeals)}</p>
                </div>
              </div>
              <div className="mt-6 flex justify-center">
                <Link href="/prepare">
                  <Button size="lg" className="gap-2">
                    <ChefHat className="h-5 w-5" />
                    Préparer le service de demain
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </Card>
          )}

          {/* KPIs + chart after closure */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <KPIWidget key={kpi.id} kpi={kpi} />
            ))}
          </div>
          <Card className="p-6">
            <SectionHeader title="Prévisions vs consommation réelle" description="14 derniers jours ouvrés" />
            <div className="mt-4">
              <ForecastChart data={chartData} />
            </div>
          </Card>
        </>
      )}

      {/* Demo notice */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <p>
          Données de démonstration — La recommandation pour demain sera disponible après la clôture du service d'aujourd'hui.
        </p>
      </div>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function MenuEditor({
  categories,
  dishes,
  items,
  onChange,
}: {
  categories: DishCategory[];
  dishes: Dish[];
  items: MenuElement[];
  onChange: (items: MenuElement[]) => void;
}) {
  const [newCategory, setNewCategory] = React.useState('');
  const [newDish, setNewDish] = React.useState('');

  const addElement = (categoryId: string, dishId: string) => {
    onChange([...items, { categoryId, dishId }]);
  };

  const removeElement = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
  };

  const dishesForCategory = (catId: string) => dishes.filter((d) => d.categoryId === catId && d.active);

  return (
    <div className="mt-2 space-y-3 rounded-lg border border-border bg-muted/20 p-4">
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {categories.find((c) => c.id === item.categoryId)?.name ?? 'Autre'}
            </p>
            <p className="text-sm font-medium text-foreground">
              {dishes.find((d) => d.id === item.dishId)?.name ?? 'Non renseigné'}
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => removeElement(i)}>
            Retirer
          </Button>
        </div>
      ))}

      <div className="border-t border-border pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ajouter un élément</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Select
            value={newCategory}
            onValueChange={(v) => {
              setNewCategory(v);
              setNewDish('');
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Cat\u00e9gorie" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={newDish} onValueChange={setNewDish} disabled={!newCategory}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Plat" />
            </SelectTrigger>
            <SelectContent>
              {newCategory &&
                dishesForCategory(newCategory).map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!newCategory || !newDish}
            onClick={() => {
              addElement(newCategory, newDish);
              setNewCategory('');
              setNewDish('');
            }}
          >
            Ajouter
          </Button>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
