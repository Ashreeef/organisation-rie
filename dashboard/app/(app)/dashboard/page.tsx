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
import type { ForecastVsActualPoint, ForecastResult } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  Users,
  UtensilsCrossed,
  ChefHat,
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
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { ServiceStatus, TodayState } from '@/lib/service-store';

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
/*  Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function DashboardPage() {
  const [forecast, setForecast] = React.useState<ForecastResult | null>(null);
  const [today, setToday] = React.useState<TodayState | null>(null);
  const [chartData, setChartData] = React.useState<ForecastVsActualPoint[]>([]);
  const [loading, setLoading] = React.useState(true);

  // Bilan form
  const [prepared, setPrepared] = React.useState('');
  const [served, setServed] = React.useState('');
  const [comment, setComment] = React.useState('');

  const refresh = React.useCallback(async () => {
    const store = api.init();
    const [f, chart] = await Promise.all([
      api.getTodayForecast(),
      api.getForecastVsActual(14),
    ]);
    setForecast(f);
    setToday(api.getTodayState());
    setChartData(chart);
    setPrepared(store.today.bilan?.prepared?.toString() ?? '');
    setServed(store.today.bilan?.served?.toString() ?? '');
    setComment(store.today.bilan?.comment ?? '');
    setLoading(false);
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  if (loading || !forecast || !today) return <DashboardSkeleton />;

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

  const handleStartService = async () => {
    await api.startService();
    setToday(api.getTodayState());
    toast.success('Service démarré');
  };

  const handleEndService = async () => {
    await api.endService();
    setToday(api.getTodayState());
    toast.success('Service terminé — saisissez le bilan');
  };

  const handleSubmitBilan = async () => {
    if (preparedNum === 0) { toast.error('Veuillez saisir le nombre de repas préparés.'); return; }
    await api.submitBilanToday({ prepared: preparedNum, served: servedNum, comment: comment || undefined });
    await api.submitOperation({
      date: today.date, prepared: preparedNum, served: servedNum, comment: comment || undefined,
    });
    setToday(api.getTodayState());
    toast.success('Bilan enregistré — vérifiez et confirmez');
  };

  const handleConfirmBilan = async () => {
    await api.confirmBilanToday();
    setToday(api.getTodayState());
    toast.success('Journée clôturée');
  };

  const handleEditBilan = async () => {
    await api.editBilanToday();
    setToday(api.getTodayState());
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

          <div className="mt-4 rounded-lg bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{forecast.recommendationNote}</p>
          </div>
        </Card>
      )}

      {/* ── STATE: Before/during service ───────────────────── */}
      {(status === 'preparation' || status === 'service') && (
        <Card className="p-6">
          <SectionHeader
            title="Aperçu du service"
            description={status === 'service' ? 'Service en cours — suivi en temps réel' : 'Préparation en cours'}
          />
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <Users className="h-5 w-5 text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">Employés au bureau</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{formatNumber(forecast.officePresent)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <UtensilsCrossed className="h-5 w-5 text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">Repas à préparer</p>
              <p className="mt-1 text-2xl font-bold text-foreground">{formatNumber(forecast.recommendedMeals)}</p>
            </div>
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <ChefHat className="h-5 w-5 text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">Menu recommandé</p>
              <p className="mt-1 text-sm font-medium text-foreground">
                {today.menu?.name ?? 'À définir'}
              </p>
            </div>
          </div>
          {status === 'preparation' && (
            <Link href="/prepare">
              <Button variant="outline" className="mt-4 w-full">
                Préparer demain
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          )}
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
          <Card className="border-success/30 bg-success/5 p-6">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-success/10">
                <CheckCircle2 className="h-8 w-8 text-success" />
              </div>
              <div>
                <p className="text-xl font-bold text-success">Journée clôturée</p>
                {today.bilan && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatNumber(today.bilan.prepared)} préparés · {formatNumber(today.bilan.served)} servis · {formatNumber(today.bilan.remaining)} restants · {formatPercent(today.bilan.wasteRate)} gaspillage
                  </p>
                )}
              </div>
            </div>
          </Card>

          {/* Tomorrow preview (unlocked) */}
          <Card className="p-6">
            <SectionHeader title="Demain" description="Prévision pour demain" />
            <div className="mt-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Employés au bureau</p>
                <p className="mt-1 text-2xl font-bold text-foreground">{formatNumber(forecast.officePresent)}</p>
              </div>
              <div>
                <p className="text-xs text-primary">Repas recommandés</p>
                <p className="mt-1 text-3xl font-bold text-primary">{formatNumber(forecast.recommendedMeals)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Taux participation</p>
                <p className="mt-1 text-2xl font-bold text-foreground">
                  {(forecast.predictedRatio * 100).toFixed(1).replace('.', ',')}%
                </p>
              </div>
            </div>
            <Link href="/prepare">
              <Button className="mt-4 w-full">
                Préparer demain
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </Card>
        </>
      )}

      {/* ── Chart (always visible) ─────────────────────────── */}
      <Card className="p-6">
        <SectionHeader title="Prévisions vs consommation réelle" description="14 derniers jours ouvrés" />
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
