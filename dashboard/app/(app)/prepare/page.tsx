'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { ForecastResult, MenuItem } from '@/lib/types';
import { formatNumber } from '@/lib/format';
import {
  Users,
  UtensilsCrossed,
  ChefHat,
  CheckCircle2,
  ChevronRight,
  Pencil,
  TrendingDown,
  Check,
  Lock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import Link from 'next/link';

const overrideReasons = [
  'Événement prévu',
  'Habitude de fréquentation',
  'Information non disponible dans le système',
  'Prévision jugée trop faible',
  'Prévision jugée trop élevée',
  'Autre',
];

export default function PreparePage() {
  const [forecast, setForecast] = React.useState<ForecastResult | null>(null);
  const [menus, setMenus] = React.useState<MenuItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [todayClosed, setTodayClosed] = React.useState(false);
  const [presenceInput, setPresenceInput] = React.useState<number>(0);

  // Override state
  const [mealCount, setMealCount] = React.useState(340);
  const [isEditing, setIsEditing] = React.useState(false);
  const [overrideDialog, setOverrideDialog] = React.useState(false);
  const [overrideReason, setOverrideReason] = React.useState('');
  const [hasOverridden, setHasOverridden] = React.useState(false);

  // Menu selection
  const [selectedMenuId, setSelectedMenuId] = React.useState('menu-1');
  const [validated, setValidated] = React.useState(false);

  const refreshForecast = React.useCallback(async (presence: number, menuId: string) => {
    await api.updatePlanningInputs({ expectedPresence: presence, selectedMenuId: menuId });
    const f = await api.getTomorrowForecast();
    setForecast(f);
    if (!isEditing && !hasOverridden) {
      setMealCount(f.recommendedMeals);
    }
  }, [isEditing, hasOverridden]);

  React.useEffect(() => {
    (async () => {
      const today = await api.getTodayState();
      setTodayClosed(today.status === 'cloturee');

      const [f, m, planning] = await Promise.all([
        api.getTomorrowForecast(),
        api.getMenus(),
        api.getPlanningInputs(),
      ]);
      setForecast(f);
      setMenus(m);
      setMealCount(f.recommendedMeals);
      setPresenceInput(planning.expectedPresence || f.officePresent);
      setSelectedMenuId(planning.selectedMenuId);
      setLoading(false);
    })();
  }, []);

  React.useEffect(() => {
    if (loading || presenceInput <= 0 || !selectedMenuId) return;
    refreshForecast(presenceInput, selectedMenuId);
  }, [loading, presenceInput, selectedMenuId, refreshForecast]);

  if (loading || !forecast) {
    return <Skeleton className="h-96 w-full rounded-lg" />;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowLabel = tomorrow.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // No menu for tomorrow → no forecast → no preparation is possible.
  if (!forecast.forecastAvailable) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Préparer demain — {tomorrowLabel}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Suivez les étapes pour préparer le service de demain.
          </p>
        </div>
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
            <UtensilsCrossed className="h-8 w-8 text-amber-600" />
          </div>
          <p className="mt-4 text-lg font-semibold text-foreground">Menu de demain non renseigné</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Aucune prévision ne peut être générée tant que le menu de demain n’est pas planifié.
            Renseignez d’abord le menu pour obtenir une prévision des repas.
          </p>
          <Link href="/menus-planner">
            <Button className="mt-6">
              Planifier le menu de demain
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const selectedMenu = menus.find((m) => m.id === selectedMenuId);

  const handleOverrideConfirm = () => {
    setHasOverridden(true);
    setOverrideDialog(false);
    setOverrideReason('');
    toast.success(`Quantité ajustée à ${mealCount} repas`);
  };

  const handleValidate = () => {
    setValidated(true);
    toast.success('Préparation validée pour demain');
  };

  const steps = [
    { num: 1, label: 'Fréquentation', icon: Users, done: true },
    { num: 2, label: 'Repas', icon: UtensilsCrossed, done: true },
    { num: 3, label: 'Menu', icon: ChefHat, done: true },
    { num: 4, label: 'Validation', icon: CheckCircle2, done: validated },
  ];

  // ── Locked state: today not closed yet ───────────────────
  if (!todayClosed) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Préparer demain</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tomorrowLabel}
          </p>
        </div>
        <Card className="flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="mt-4 text-lg font-semibold text-foreground">Journée d'aujourd'hui non clôturée</p>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Vous devez d'abord clôturer la journée en cours avant de préparer le service de demain.
            Rendez-vous sur l'accueil pour saisir le bilan.
          </p>
          <Link href="/dashboard">
            <Button className="mt-6">
              Retour à l'accueil
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          Préparer demain — {tomorrowLabel}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suivez les étapes pour préparer le service de demain.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <React.Fragment key={step.num}>
              <div
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
                  step.done
                    ? 'border-primary/30 bg-primary/5 text-primary'
                    : 'border-border bg-muted/30 text-muted-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{step.label}</span>
                {step.done && <Check className="h-3.5 w-3.5" />}
              </div>
              {i < steps.length - 1 && (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step 1 — Attendance */}
      <Card className="p-6">
        <StepHeader num={1} icon={Users} title="Fréquentation" />
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-3xl font-bold text-foreground">
              {formatNumber(forecast.employeesCount)} repas prévus
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Présence bureau estimée : {formatNumber(forecast.officePresent)} employés · Taux participation : {(forecast.predictedRatio * 100).toFixed(1).replace('.', ',')}%
            </p>
            <div className="mt-3 flex max-w-sm items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="presence-input" className="text-xs text-muted-foreground">
                  Présence bureau manuelle
                </Label>
                <Input
                  id="presence-input"
                  type="number"
                  min={0}
                  value={presenceInput}
                  onChange={(e) => setPresenceInput(Number(e.target.value) || 0)}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => refreshForecast(presenceInput, selectedMenuId)}
                disabled={presenceInput <= 0}
              >
                Mettre à jour
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Step 2 — Meals with override */}
      <Card className="p-6">
        <StepHeader num={2} icon={UtensilsCrossed} title="Repas" />
        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <UtensilsCrossed className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1">
            {isEditing ? (
              <div className="flex items-end gap-3">
                <div>
                  <Label htmlFor="meal-count" className="text-xs text-muted-foreground">
                    Quantité à préparer
                  </Label>
                  <Input
                    id="meal-count"
                    type="number"
                    value={mealCount}
                    onChange={(e) => setMealCount(Number(e.target.value))}
                    className="w-32 text-2xl font-bold"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    if (mealCount !== forecast.recommendedMeals) {
                      setOverrideDialog(true);
                    } else {
                      setIsEditing(false);
                      setHasOverridden(false);
                      toast.success(`Quantité confirmée : ${mealCount} repas`);
                    }
                  }}
                >
                  Confirmer
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMealCount(forecast.recommendedMeals);
                    setIsEditing(false);
                    setHasOverridden(false);
                  }}
                >
                  Annuler
                </Button>
              </div>
            ) : (
              <>
                <p className="text-3xl font-bold text-primary">
                  {formatNumber(mealCount)} repas à préparer
                </p>
                <div className="mt-1 flex items-center gap-3 text-sm">
                  {hasOverridden ? (
                    <span className="text-muted-foreground">
                      Recommandation initiale : {forecast.recommendedMeals} repas — ajusté par le gestionnaire
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      Estimation : {formatNumber(forecast.confidenceLower)} — {formatNumber(forecast.confidenceUpper)} repas · Marge de sécurité incluse
                    </span>
                  )}
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <Pencil className="h-3 w-3" />
                    Modifier
                  </button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{forecast.recommendationNote}</p>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Step 3 — Menu */}
      <Card className="p-6">
        <StepHeader num={3} icon={ChefHat} title="Menu" />
        <div className="mt-4 space-y-3">
          <Select value={selectedMenuId} onValueChange={setSelectedMenuId}>
            <SelectTrigger className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {menus.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedMenu && (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-foreground">
                      {selectedMenu.name}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {selectedMenu.description}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{selectedMenu.score}</p>
                  <p className="text-[10px] uppercase text-muted-foreground">Score</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border pt-3">
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <ChefHat className="h-3 w-3" /> Popularité
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {selectedMenu.attractiveness >= 90
                      ? 'Très apprécié'
                      : selectedMenu.attractiveness >= 80
                      ? 'Apprécié'
                      : 'Moyen'}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingDown className="h-3 w-3" /> Gaspillage habituel
                  </p>
                  <p
                    className={cn(
                      'mt-0.5 text-sm font-medium',
                      selectedMenu.predictedWaste < 5
                        ? 'text-success'
                        : selectedMenu.predictedWaste < 8
                        ? 'text-warning'
                        : 'text-destructive'
                    )}
                  >
                    {selectedMenu.predictedWaste < 5
                      ? 'Faible'
                      : selectedMenu.predictedWaste < 8
                      ? 'Moyen'
                      : 'Élevé'}
                  </p>
                </div>
                <div>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <TrendingDown className="h-3 w-3" /> Impact de menu
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-foreground">
                    {selectedMenu.predictedWaste < 5 ? 'Faible' : selectedMenu.predictedWaste < 8 ? 'Moyen' : 'Élevé'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Step 4 — Validation */}
      <Card className={cn('p-6', validated && 'border-success/30 bg-success/5')}>
        <StepHeader num={4} icon={CheckCircle2} title="Validation" />
        {validated ? (
          <div className="mt-4 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <div>
              <p className="text-xl font-bold text-success">Préparation validée</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Demain — {formatNumber(forecast.officePresent)} employés · {formatNumber(mealCount)} repas · {selectedMenu?.name}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Récapitulatif — Demain
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employés au bureau</span>
                  <span className="font-medium text-foreground">{formatNumber(forecast.officePresent)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Repas prévus</span>
                  <span className="font-medium text-foreground">{formatNumber(forecast.employeesCount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Repas à préparer</span>
                  <span className="font-medium text-foreground">{formatNumber(mealCount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Menu</span>
                  <span className="font-medium text-foreground">{selectedMenu?.name}</span>
                </div>
              </div>
            </div>
            <Button
              size="lg"
              className="mt-4 w-full"
              onClick={handleValidate}
            >
              <Check className="mr-2 h-5 w-5" />
              Valider la préparation
            </Button>
          </>
        )}
      </Card>

      {/* Override dialog */}
      <Dialog open={overrideDialog} onOpenChange={setOverrideDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pourquoi avez-vous modifié la recommandation ?</DialogTitle>
            <DialogDescription>
              Votre retour aide le système à améliorer ses futures prévisions.
            </DialogDescription>
          </DialogHeader>
          <Select value={overrideReason} onValueChange={setOverrideReason}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez une raison" />
            </SelectTrigger>
            <SelectContent>
              {overrideReasons.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOverrideDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleOverrideConfirm} disabled={!overrideReason}>
              Confirmer l&apos;ajustement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepHeader({
  num,
  icon: Icon,
  title,
}: {
  num: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
        {num}
      </div>
      <Icon className="h-5 w-5 text-primary" />
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
    </div>
  );
}
