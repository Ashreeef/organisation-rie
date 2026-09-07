'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SectionHeader } from '@/components/shared/section-header';
import { ForecastChart } from '@/components/shared/forecast-chart';
import { api } from '@/lib/api';
import type { ForecastVsActualPoint, ForecastResult, MenuPlan } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Pencil,
  Save,
  ArrowRight,
  Info,
  Lock,
  PlayCircle,
  StopCircle,
  ClipboardCheck,
  RefreshCcw,
  Utensils,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ServiceStatus, TodayState } from '@/lib/types';

/* -------------------------------------------------------------------------- */
/*  Status helpers                                                             */
/* -------------------------------------------------------------------------- */

const statusUI: Record<ServiceStatus, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  preparation: { label: 'Préparation', color: 'text-blue-600', bg: 'bg-blue-50', icon: ClipboardCheck },
  service: { label: 'Service en cours', color: 'text-amber-600', bg: 'bg-amber-50', icon: Clock },
  bilan_a_saisir: { label: 'Service terminé — bilan à saisir', color: 'text-orange-600', bg: 'bg-orange-50', icon: AlertCircle },
  bilan_a_confirmer: { label: 'Bilan à confirmer', color: 'text-purple-600', bg: 'bg-purple-50', icon: AlertCircle },
  cloturee: { label: 'Journée clôturée', color: 'text-green-600', bg: 'bg-green-50', icon: CheckCircle2 },
};

/* -------------------------------------------------------------------------- */
/*  Menu helpers — single source of truth = planned_menus (GET /api/menus)     */
/* -------------------------------------------------------------------------- */

// Un menu est "renseigné" dès qu'au moins un champ non vide est planifié.
function menuHasContent(menu: MenuPlan | null | undefined): boolean {
  if (!menu) return false;
  return [menu.entrees, menu.plat_principal_1, menu.plat_principal_2]
    .some((v) => (v ?? '').toString().trim().length > 0);
}

// Représentation compacte du menu (champs non vides, joints par " · ").
function menuLabel(menu: MenuPlan | null | undefined): string {
  if (!menu) return '';
  return [menu.entrees, menu.plat_principal_1, menu.plat_principal_2]
    .map((v) => (v ?? '').toString().trim())
    .filter(Boolean)
    .join(' · ');
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const [forecast, setForecast] = React.useState<ForecastResult | null>(null);
  const [nextForecast, setNextForecast] = React.useState<ForecastResult | null>(null);
  const [today, setToday] = React.useState<TodayState | null>(null);
  const [chartData, setChartData] = React.useState<ForecastVsActualPoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [hasTodayPlan, setHasTodayPlan] = React.useState(false);
  // Menus du jour / de la prochaine journée — même source de vérité que
  // /menus-planner (GET /api/menus/{date}) : menu → features → prévision.
  const [todayMenu, setTodayMenu] = React.useState<MenuPlan | null>(null);
  const [nextMenu, setNextMenu] = React.useState<MenuPlan | null>(null);

  // Bilan form
  const [prepared, setPrepared] = React.useState('');
  const [served, setServed] = React.useState('');
  const [comment, setComment] = React.useState('');

  const refresh = React.useCallback(async () => {
    const todayDate = new Date().toISOString().slice(0, 10);
    const todayState = await api.getTodayState();
    setToday(todayState);
    setPrepared(todayState.bilan?.prepared?.toString() ?? '');
    setServed(todayState.bilan?.served?.toString() ?? '');
    setComment(todayState.bilan?.comment ?? '');

    // ── Prochaine journée de service ─────────────────────────────
    // Elle n'est montrée qu'UNE FOIS le bilan du jour clos. Sa date est fournie
    // par le backend (calendrier opérationnel canonique : dimanche→jeudi,
    // vendredi/samedi exclus) — l'UI ne fait PAS de "date + 1 jour" pour la
    // calculer. Avant la clôture, on n'affiche que les informations du jour.
    const closed = todayState.bilanClosed;
    const nextDayStr = todayState.nextOperationalDay;

    if (closed) {
      // Un menu absent (404) → null → "non renseigné".
      let plan: MenuPlan | null = null;
      try {
        plan = await api.getPlannedMenu(nextDayStr);
      } catch {
        plan = null;
      }
      setNextMenu(plan);
      const nextFc = await api.getForecastForDate(nextDayStr);
      setNextForecast(nextFc);
    } else {
      setNextMenu(null);
      setNextForecast(null);
    }

    // ── Menu du jour (même source que /menus-planner) ────────────
    let dayPlan: MenuPlan | null = null;
    try {
      dayPlan = await api.getPlannedMenu(todayDate);
    } catch {
      dayPlan = null;
    }
    setTodayMenu(dayPlan);
    const hasPlan = !!dayPlan && [dayPlan.entrees, dayPlan.plat_principal_1, dayPlan.plat_principal_2]
      .some((v) => (v ?? '').toString().trim().length > 0);
    setHasTodayPlan(hasPlan);
    if (!hasPlan) {
      setForecast(null);
      setChartData([]);
      setLoading(false);
      return;
    }

    const [f, chart] = await Promise.all([
      api.getTodayForecast(),
      api.getForecastVsActual(14),
    ]);
    setForecast(f);
    setChartData(chart);
    // Persiste la prévision du jour dans son dossier opérationnel pour que
    // /history reflète la prévision vs le réel une fois la journée clôturée.
    // Best-effort : une indisponibilité transitoire du backend ne doit pas
    // casser l'affichage du tableau de bord (persisté au prochain refresh).
    if (f.forecastAvailable) {
      try {
        await api.persistForecast({ ...f, date: todayDate });
      } catch {
        // Non bloquant : la prévision reste affichée sans être persistée.
      }
    }
    setLoading(false);
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  if (loading || !today) return <DashboardSkeleton />;

  if (!forecast || !hasTodayPlan) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className={cn('flex items-center gap-3 rounded-lg border p-4', statusUI[today.status].bg, 'border-current/10')}>
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', statusUI[today.status].bg)}>
            {React.createElement(statusUI[today.status].icon, { className: cn('h-6 w-6', statusUI[today.status].color) })}
          </div>
          <div className="flex-1">
            <p className={cn('text-sm font-semibold', statusUI[today.status].color)}>{statusUI[today.status].label}</p>
            <p className="mt-0.5 text-sm text-muted-foreground capitalize">{new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>

        <Card className="border-dashed border-amber-300 bg-amber-50/50 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <h2 className="text-lg font-semibold text-foreground">Menu du jour non renseigné</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Aucune prévision pour aujourd&apos;hui : le système n’affiche de recommandation
                que lorsqu’un menu est planifié pour la journée. Renseignez le menu dans le
                planificateur pour obtenir une estimation réaliste.
              </p>
              <div className="mt-4">
                <Link href="/menus-planner">
                  <Button variant="outline">
                    <Utensils className="mr-2 h-4 w-4" />
                    Planifier le menu du jour
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const status = today.status;
  const ui = statusUI[status];
  const Icon = ui.icon;
  const preparedNum = Number(prepared) || 0;
  const servedNum = Number(served) || 0;
  const remaining = Math.max(0, preparedNum - servedNum);
  const wasteRate = preparedNum > 0 ? (remaining / preparedNum) * 100 : 0;

  const todayLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  // Prochaine journée de service — date fournie par le backend (calendrier
  // opérationnel canonique), jamais un "date + 1 jour" codé en dur ici.
  const nextDayLabel = today.nextOperationalDay
    ? new Date(`${today.nextOperationalDay}T00:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
    : '';

  const handleStartService = async () => {
    setToday(await api.startService());
    toast.success('Service démarré');
  };

  const handleEndService = async () => {
    setToday(await api.endService());
    toast.success('Service terminé — saisissez le bilan');
  };

  const handleSubmitBilan = async () => {
    if (preparedNum === 0) { toast.error('Veuillez saisir le nombre de repas préparés.'); return; }
    setToday(await api.submitBilanToday({ prepared: preparedNum, served: servedNum, comment: comment || undefined }));
    toast.success('Bilan enregistré — vérifiez et confirmez');
  };

  const handleConfirmBilan = async () => {
    setToday(await api.confirmBilanToday());
    toast.success('Journée clôturée');
  };

  const handleEditBilan = async () => {
    setToday(await api.editBilanToday());
    toast.info('Bilan rouvert — corrigez puis enregistrez à nouveau');
  };

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Status banner ──────────────────────────────────── */}
      <div className={cn('flex items-center gap-3 rounded-lg border p-4', ui.bg, 'border-current/10')}>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', ui.bg)}>
          <Icon className={cn('h-6 w-6', ui.color)} />
        </div>
        <div className="flex-1">
          <p className={cn('text-sm font-semibold', ui.color)}>{ui.label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground capitalize">{todayLabel}</p>
        </div>
        {status === 'preparation' && (
          <Button onClick={handleStartService} size="sm">
            <PlayCircle className="mr-2 h-4 w-4" />
            Démarrer le service
          </Button>
        )}
        {status === 'service' && (
          <Button onClick={handleEndService} size="sm" variant="outline">
            <StopCircle className="mr-2 h-4 w-4" />
            Terminer le service
          </Button>
        )}
      </div>

      {/* ── Today's forecast (clean, no ML jargon) ─────────── */}
      {status !== 'cloturee' && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/[0.04] to-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-primary">Prévision du jour</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Recommandation basée sur la fréquentation historique
              </p>
            </div>
            <span className={cn(
              'rounded-full px-3 py-1 text-xs font-medium',
              forecast.confidenceLevel === 'high' ? 'bg-green-50 text-green-700' :
              forecast.confidenceLevel === 'medium' ? 'bg-amber-50 text-amber-700' :
              'bg-red-50 text-red-700'
            )}>
              Fiabilité : {forecast.confidenceLevel === 'high' ? 'Élevée' : forecast.confidenceLevel === 'medium' ? 'Moyenne' : 'Faible'}
            </span>
          </div>

          {menuHasContent(todayMenu) && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-primary/15 bg-primary/5 px-4 py-3">
              <Utensils className="h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Menu du jour</p>
                <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{menuLabel(todayMenu)}</p>
              </div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-3 gap-6 text-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employés au bureau</p>
              <p className="mt-1 text-4xl font-bold text-foreground">{formatNumber(forecast.officePresent)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Repas à préparer</p>
              <p className="mt-1 text-5xl font-bold text-primary">{formatNumber(forecast.recommendedMeals)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Estimation : {formatNumber(forecast.confidenceLower)} – {formatNumber(forecast.confidenceUpper)} repas
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Taux de participation</p>
              <p className="mt-1 text-4xl font-bold text-foreground">
                {(forecast.predictedRatio * 100).toFixed(1).replace('.', ',')}%
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ── STATE: Bilan to fill ───────────────────────────── */}
      {status === 'bilan_a_saisir' && (
        <Card className="p-6">
          <SectionHeader title="Bilan du service" description="Saisissez les résultats du jour" />
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="prepared">Repas préparés</Label>
                <Input id="prepared" type="number" placeholder="330" value={prepared} onChange={(e) => setPrepared(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="served">Repas servis</Label>
                <Input id="served" type="number" placeholder="312" value={served} onChange={(e) => setServed(e.target.value)} />
              </div>
            </div>

            {preparedNum > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Repas restants</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{remaining}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Taux de gaspillage</p>
                    <p className="mt-1 text-2xl font-bold text-foreground">{formatPercent(wasteRate)}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="comment">Commentaire (optionnel)</Label>
              <Textarea
                id="comment"
                placeholder="Exemple : Forte affluence entre 12h30 et 13h15."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
            </div>

            <Button size="lg" className="w-full" onClick={handleSubmitBilan}>
              <Save className="mr-2 h-4 w-4" />
              Enregistrer le bilan
            </Button>
          </div>
        </Card>
      )}

      {/* ── STATE: Bilan to confirm ────────────────────────── */}
      {status === 'bilan_a_confirmer' && today.bilan && (
        <Card className="p-6">
          <SectionHeader title="Vérifier le bilan" description="Confirmez les informations saisies" />
          <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <ReviewItem label="Préparés" value={formatNumber(today.bilan.prepared)} />
              <ReviewItem label="Servis" value={formatNumber(today.bilan.served)} />
              <ReviewItem label="Restants" value={formatNumber(today.bilan.remaining)} />
              <ReviewItem label="Gaspillage" value={formatPercent(today.bilan.wasteRate)} />
            </div>
            {today.bilan.comment && (
              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">Commentaire</p>
                <p className="mt-1 text-sm text-foreground">{today.bilan.comment}</p>
              </div>
            )}
          </div>
          <p className="mt-4 text-sm font-medium text-foreground">Ces informations sont-elles correctes ?</p>
          <div className="mt-3 flex gap-3">
            <Button onClick={handleConfirmBilan} className="flex-1">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Confirmer et clôturer
            </Button>
            <Button onClick={handleEditBilan} variant="outline" className="flex-1">
              <Pencil className="mr-2 h-4 w-4" />
              Modifier
            </Button>
          </div>
        </Card>
      )}

      {/* ── STATE: Day closed ──────────────────────────────── */}
      {status === 'cloturee' && (
        <>
          {/* Bilan summary only — the status banner above already carries the
              "Journée clôturée" title + date, so no duplicate here. */}
          {today.bilan && (
            <Card className="border-success/30 bg-success/5 p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10">
                    <CheckCircle2 className="h-8 w-8 text-success" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Résultat de la journée</p>
                    <p className="mt-1 text-lg font-semibold text-foreground">
                      {formatNumber(today.bilan.prepared)} préparés · {formatNumber(today.bilan.served)} servis · {formatNumber(today.bilan.remaining)} restants · {formatPercent(today.bilan.wasteRate)} gaspillage
                    </p>
                    {today.bilan.confirmedAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Clôturé le {new Date(today.bilan.confirmedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })} à {new Date(today.bilan.confirmedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={handleEditBilan}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Modifier le bilan
                </Button>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── Prochaine journée de service (uniquement après clôture du bilan du jour) ── */}
      {status === 'cloturee' && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeader
              title="Prochaine journée de service"
              description={`${nextDayLabel}${menuHasContent(nextMenu) && nextForecast?.forecastAvailable ? ' — prévision disponible' : ''}`}
            />
<div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Préparation
            </span>
            <Link href="/forecasts">
              <Button variant="ghost" size="sm" className="text-primary">
                Voir toutes les prévisions
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

          {menuHasContent(nextMenu) ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              {/* Menu prévu */}
              <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
                <Utensils className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Menu prévu</p>
                  <p className="mt-0.5 truncate text-sm font-semibold text-foreground">{menuLabel(nextMenu)}</p>
                </div>
              </div>

              {/* Prévision (uniquement si un menu est planifié) */}
              {nextForecast?.forecastAvailable ? (
                <div className="rounded-lg border border-primary/20 bg-gradient-to-br from-primary/[0.04] to-card px-4 py-3">
                  {nextForecast?.forecastStale ? (
                    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-sm">
                      <RefreshCcw className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <p className="font-semibold text-amber-800">Prévision à actualiser</p>
                        <p className="text-muted-foreground">
                          Le menu de la prochaine journée a changé depuis la dernière prévision. Recalculez les features.
                        </p>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">Prévision</p>
                      <p className="mt-0.5 text-2xl font-bold text-primary">{formatNumber(nextForecast.recommendedMeals)} repas</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatNumber(nextForecast.officePresent)} présents · {(nextForecast.predictedRatio * 100).toFixed(1).replace('.', ',')}% participation
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fiabilité</p>
                      <p className={cn(
                        'mt-0.5 text-sm font-semibold',
                        nextForecast.confidenceLevel === 'high' ? 'text-green-700' :
                        nextForecast.confidenceLevel === 'medium' ? 'text-amber-700' : 'text-red-700'
                      )}>
                        {nextForecast.confidenceLevel === 'high' ? 'Élevée' : nextForecast.confidenceLevel === 'medium' ? 'Moyenne' : 'Faible'}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 px-4 py-3 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                  Menu planifié mais prévision non disponible — actualisez les features.
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/50 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <p className="font-semibold text-foreground">Menu non renseigné</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Renseignez le menu de la prochaine journée de service pour obtenir une prévision.
                  </p>
                </div>
              </div>
              <Link href="/menus-planner">
                <Button variant="outline" size="sm">
                  <Utensils className="mr-2 h-4 w-4" />
                  Planifier le menu de la prochaine journée
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </div>
          )}
        </Card>
      )}

      {/* ── Chart (always visible) ─────────────────────────── */}
      <Card className="p-6">
        <SectionHeader title="Prévisions vs consommation réelle" description="Prévision / préparés / consommation réelle — 14 derniers jours ouvrés" />
        <div className="mt-4">
          <ForecastChart data={chartData} />
        </div>
      </Card>

      {/* ── Info bar ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <p>
          Le système recense les prévisions automatiquement. Le gestionnaire complète le bilan une fois le service terminé.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-48 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
