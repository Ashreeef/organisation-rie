'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ErrorBar,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type { WeekForecastDay } from '@/lib/types';
import { formatNumber, formatPercent } from '@/lib/format';
import {
  isoDate,
  dowLabel,
  dowShortLabel,
  startOfOperationalWeek,
} from '@/lib/operational-calendar';
import {
  TrendingUp,
  CalendarDays,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Moon,
  CalendarOff,
  AlertTriangle,
  Users,
  ChefHat,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const CONFIDENCE_LABEL = {
  high: 'Élevée',
  medium: 'Modérée',
  low: 'Faible',
} as const;

const CONF_TRACK_WIDTH: Record<'high' | 'medium' | 'low', number> = {
  high: 88,
  medium: 60,
  low: 32,
};

const RATIO_BADGE_STYLE: Record<string, string> = {
  'très élevé': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  élevé: 'bg-green-100 text-green-700 border-green-200',
  moyen: 'bg-amber-100 text-amber-700 border-amber-200',
  faible: 'bg-sky-100 text-sky-700 border-sky-200',
};

// La fiabilité affichée est celle calculée par le modèle lui-même (largeur de
// l'intervalle de confiance) — aucun recours à une moyenne historique.
function confidenceOf(day: WeekForecastDay): 'high' | 'medium' | 'low' {
  if (day.isHoliday || day.isRamadan) return 'low';
  return day.forecast.forecastAvailable
    ? day.forecast.confidenceLevel
    : 'low';
}

export default function ForecastsPage() {
  const [weekSunday, setWeekSunday] = React.useState<Date | null>(null);
  const [week, setWeek] = React.useState<WeekForecastDay[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [generatedAt, setGeneratedAt] = React.useState<Date | null>(null);

  const load = React.useCallback(async (sunday: Date) => {
    setLoading(true);
    setError(false);
    try {
      const days = await api.getWeekForecast(isoDate(sunday));
      setWeek(days);
      setWeekSunday(sunday);
      setGeneratedAt(new Date());
    } catch {
      setWeek(null);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(startOfOperationalWeek(new Date()));
  }, [load]);

  const goPrevWeek = () => {
    if (weekSunday) {
      const w = new Date(weekSunday);
      w.setDate(w.getDate() - 7);
      load(w);
    }
  };

  const goNextWeek = () => {
    if (weekSunday) {
      const w = new Date(weekSunday);
      w.setDate(w.getDate() + 7);
      load(w);
    }
  };

  if (loading && !week) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  // Backend injoignable : chaque jour revient `forecastAvailable=false` avec une
  // raison « Backend indisponible » → état vide explicite avec bouton Réessayer.
  const backendDown =
    !!week &&
    week.length > 0 &&
    week.every(
      (d) =>
        !d.forecast.forecastAvailable &&
        (d.forecast.unavailableReason ?? '').toLowerCase().includes('backend'),
    );

  if (error || !week || week.length === 0 || backendDown) {
    return (
      <Card className="mx-auto mt-10 max-w-xl p-10 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-7 w-7 text-muted-foreground" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Prévisions temporairement indisponibles.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Vérifiez que le serveur FastAPI est démarré (http://localhost:8000).
        </p>
        <Button className="mt-6" onClick={() => weekSunday && load(weekSunday)}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Réessayer
        </Button>
      </Card>
    );
  }

  const days = week;
  const available = days.filter((d) => d.forecast.forecastAvailable);
  const totalPred = available.reduce((s, d) => s + d.employeesCount, 0);
  const totalPrep = available.reduce((s, d) => s + d.recommendedMeals, 0);
  const busiest = available.length > 0
    ? available.reduce((best, d) => (d.recommendedMeals > best.recommendedMeals ? d : best))
    : null;
  const quietest = available.length > 0
    ? available.reduce((best, d) => (d.recommendedMeals < best.recommendedMeals ? d : best))
    : null;

  const rangeLabel = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const firstDay = weekSunday;
  const lastDay = weekSunday ? new Date(weekSunday.getTime()) : null;
  if (lastDay) lastDay.setDate(lastDay.getDate() + 4);
  const weekLabel = firstDay && lastDay
    ? `Semaine du ${rangeLabel(firstDay)} au ${rangeLabel(lastDay)}`
    : '';

  // Ne garde que les jours pour lesquels une prévision existe réellement
  // (menu planifié). Les jours sans menu n'apparaissent pas dans le graphique :
  // aucune valeur null/NaN n'est exposée à recharts, ce qui élimine le crash
  // « DecimalError: Invalid argument: NaN » lors du calcul de l'axe Y.
  const chartData = days
    .filter((d) => d.forecast.forecastAvailable)
    .map((d) => {
      const prep = Number.isFinite(d.recommendedMeals) ? d.recommendedMeals : 0;
      const pred = Number.isFinite(d.employeesCount) ? d.employeesCount : 0;
      const lo = Number.isFinite(d.confidenceLower) ? d.confidenceLower : 0;
      const up = Number.isFinite(d.confidenceUpper) ? d.confidenceUpper : 0;
      const spread = (up - lo) / 2;
      return {
        day: dowShortLabel(d.dow),
        fullDay: dowLabel(d.dow),
        date: d.date,
        title: `${dowShortLabel(d.dow)} ${new Date(`${d.date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`,
        àPréparer: prep,
        prévision: pred,
        errObj: Number.isFinite(spread) ? spread : 0,
        interval: `${formatNumber(lo)} – ${formatNumber(up)}`,
        menu: d.menu ?? null,
        menuPlanned: true,
        office: Number.isFinite(d.officePresent) ? d.officePresent : 0,
      };
    });

  const chartValues = chartData
    .flatMap((d) => [d.àPréparer, d.prévision])
    .filter((v): v is number => Number.isFinite(v));
  const dataMaxV = chartValues.length > 0 ? Math.max(...chartValues) : 0;
  const yMax = Number.isFinite(dataMaxV) && dataMaxV > 0 ? dataMaxV + 40 : 100;
  const yDomain: [number, number] = [0, yMax];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── En-tête + navigation hebdomadaire ─────────────── */}
      <div className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Prévisions de la semaine</h1>
              <p className="text-sm text-muted-foreground">
                Prévisions du modèle · {weekLabel}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button variant="outline" size="sm" onClick={goPrevWeek} disabled={!weekSunday}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Semaine précédente
            </Button>
            <span className="min-w-44 text-center text-sm font-medium text-foreground">{weekLabel}</span>
            <Button variant="outline" size="sm" onClick={goNextWeek} disabled={!weekSunday}>
              Semaine suivante
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <span className="mx-1 h-6 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={() => weekSunday && load(weekSunday)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualiser
            </Button>
          </div>
        </div>
        {generatedAt && (
          <p className="mt-3 text-xs text-muted-foreground">
            Généré le {generatedAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            à {generatedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* ── Bandeau récapitulatif de la semaine (KPIs) ────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total prévu semaine</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {available.length > 0 ? formatNumber(totalPred) : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {available.length > 0 ? 'repas sur les jours planifiés' : 'aucun menu planifié'}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total à préparer</p>
          <p className="mt-2 text-3xl font-semibold text-primary">
            {available.length > 0 ? formatNumber(totalPrep) : '—'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">avec marge de sécurité +6%</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jour le plus chargé</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{busiest ? dowLabel(busiest.dow) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {busiest ? `${formatNumber(busiest.recommendedMeals)} repas prévus` : 'Aucune donnée'}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Jour le moins chargé</p>
          <p className="mt-2 text-3xl font-semibold text-foreground">{quietest ? dowLabel(quietest.dow) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {quietest ? `${formatNumber(quietest.recommendedMeals)} repas prévus` : 'Aucune donnée'}
          </p>
        </Card>
      </div>

      {/* ── Cartes prévisions par jour ────────────────────── */}
      <div className="space-y-3">
        {days.map((day) => {
          const conf = confidenceOf(day);
          const dLabel = new Date(`${day.date}T00:00:00`).toLocaleDateString('fr-FR', {
            weekday: 'long', day: 'numeric', month: 'short',
          });
          const highForecast = day.forecast.forecastAvailable && day.recommendedMeals > 350;
          const lowForecast = day.forecast.forecastAvailable && day.recommendedMeals < 250;
          return (
            <Card
              key={day.date}
              className={cn(
                'overflow-hidden border-l-2 border-l-border bg-card shadow-sm transition-colors',
                day.isToday && 'border-l-[#009453]',
                day.isTomorrow && !day.isToday && 'border-l-[#3B82F6]',
                day.isPast && 'opacity-70',
                day.isHoliday && 'bg-yellow-50/60 border-yellow-300/70',
              )}
            >
              {/* En-tête du jour */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 bg-muted/25 px-5 py-3.5">
                <span className={cn(
                  'flex h-9 items-center rounded-lg px-3 text-sm font-bold',
                  day.isToday ? 'bg-[#009453] text-white' : day.isTomorrow ? 'bg-[#3B82F6] text-white' : 'bg-primary/10 text-primary',
                )}>
                  {dowLabel(day.dow).slice(0, 3)}
                </span>
                <p className="text-base font-semibold capitalize text-foreground">{dLabel}</p>
                {day.isToday && (
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Aujourd&apos;hui</span>
                )}
                {day.isTomorrow && !day.isToday && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">Demain</span>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {day.isHoliday && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                      <CalendarOff className="h-3 w-3" /> Jour férié{day.holidayName ? ` · ${day.holidayName}` : ''}
                    </span>
                  )}
                  {day.isRamadan && (
                    <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-700">
                      <Moon className="h-3 w-3" /> Ramadan
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-5 p-5 lg:grid-cols-2">
                {/* Bloc gauche : recommandation */} 
                <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Repas recommandés</p>
                    <p className={cn(
                      'mt-1 text-4xl font-bold',
                      highForecast ? 'text-[#0b7a45]' : lowForecast ? 'text-orange-600' : 'text-foreground',
                    )}>
                      {day.forecast.forecastAvailable ? formatNumber(day.recommendedMeals) : '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">à préparer</p>
                  </div>
                  <div className="border-t border-border/60 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévision modèle</p>
                    <p className={cn(
                      'mt-1 text-2xl font-semibold',
                      highForecast ? 'text-[#0b7a45]' : lowForecast ? 'text-orange-600' : 'text-foreground',
                    )}>
                      {day.forecast.forecastAvailable ? `${formatNumber(day.employeesCount)} repas` : '—'} <span className="text-sm font-normal text-muted-foreground">attendus</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Intervalle : {day.forecast.forecastAvailable
                        ? `${formatNumber(day.confidenceLower)} – ${formatNumber(day.confidenceUpper)}`
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Bloc droit : présence */}
                <div className="space-y-3 rounded-lg border border-border/60 bg-card p-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Employés au bureau</p>
                    <p className={cn(
                      'mt-1 flex items-center gap-2 text-4xl font-bold text-foreground',
                      day.isPast && 'opacity-80',
                    )}>
                      <Users className="h-6 w-6 text-muted-foreground" />
                      {day.forecast.forecastAvailable ? formatNumber(day.officePresent) : '—'}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">prévus au siège</p>
                  </div>
                  <div className="border-t border-border/60 pt-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Taux de participation</p>
                    <p className="mt-1 text-2xl font-semibold text-foreground">
                      {day.forecast.forecastAvailable ? formatPercent(day.predictedRatio * 100) : '—'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Intervalle de confiance : {day.forecast.forecastAvailable
                        ? `${formatNumber(day.confidenceLower)} – ${formatNumber(day.confidenceUpper)} repas`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Menu planifié / avertissement */}
              <div className="border-t border-border/60 px-5 py-3.5">
                {day.menu ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <ChefHat className="h-4 w-4 shrink-0 text-primary" />
                    <span className="text-xs font-medium text-muted-foreground">Menu planifié :</span>
                    <span className="text-sm font-semibold text-foreground">{day.menu}</span>
                    {day.menuRatioEffect && (
                      <Badge
                        variant="outline"
                        className={cn('px-1.5 py-0 text-[10px] font-medium', RATIO_BADGE_STYLE[day.menuRatioEffect])}
                      >
                        {day.menuRatioEffect}
                      </Badge>
                    )}
                    {day.menuCategory && (
                      <span className="text-xs text-muted-foreground">· {day.menuCategory}</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs text-muted-foreground">
                      Aucun menu planifié pour ce jour — la prévision sera disponible
                      dès qu&apos;un menu sera enregistré (page « Planification des menus »).
                    </p>
                  </div>
                )}
              </div>

              {/* Fiabilité + drapeaux calendrier */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-border/60 bg-muted/15 px-5 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="h-2 w-24 overflow-hidden rounded-full bg-border/70">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        conf === 'high' ? 'bg-[#009453]' : conf === 'medium' ? 'bg-amber-500' : 'bg-red-500',
                      )}
                      style={{ width: `${CONF_TRACK_WIDTH[conf]}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-foreground">
                    Confiance : {CONFIDENCE_LABEL[conf]}
                  </span>
                </div>
                {!day.isHoliday && !day.isRamadan && (
                  <span className="text-xs text-muted-foreground">Semaine type</span>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Graphique hebdomadaire ────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-foreground">Quantités à préparer cette semaine</h2>
            <p className="text-xs text-muted-foreground">
              Pour chaque jour de service dont le menu est planifié : prévision du modèle vs quantité à préparer
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs">
            {[
              ['Prévision modèle', '#34D399'],
              ['À préparer (+6%)', '#009453'],
            ].map(([label, color]) => (
              <span key={label} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: color }} />
                <span className="font-medium text-muted-foreground">{label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="mt-4">
          {chartValues.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={chartData} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="title"
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  tickLine={false}
                  axisLine={false}
                  width={50}
                  unit=" repas"
                  tickFormatter={(v: number) => formatNumber(v)}
                  domain={yDomain}
                />
                <Tooltip content={<WeekTooltip />} cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} />
                <Bar dataKey="prévision" name="Prévision modèle" fill="#34D399" radius={[4, 4, 0, 0]} barSize={18}>
                  <ErrorBar dataKey="errObj" direction="y" width={6} strokeWidth={1.5} stroke="#009453" />
                </Bar>
                <Bar dataKey="àPréparer" name="À préparer" fill="#009453" radius={[4, 4, 0, 0]} barSize={18} />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-center">
              <CalendarOff className="h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium text-foreground">Aucune prévision cette semaine</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Aucun menu n&apos;est planifié pour les jours de cette semaine. Renseignez les menus
                dans la page « Planification des menus » : la prévision apparaîtra dès qu&apos;un menu
                est enregistré.
              </p>
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Les jours sans menu planifié sont laissés vides (aucune prévision) — la prédiction
          est générée uniquement pour les jours dont le menu a été enregistré dans la
          planification.
        </p>
      </Card>

      {/* ── Note de bas de page ───────────────────────────── */}
      <p className="px-1 text-xs italic text-muted-foreground">
        Les prévisions sont générées automatiquement par le modèle d&apos;ensemble
        (36 modèles · AsymCost : 19.52 · MAE : 17.90 repas). La marge de +6% est
        appliquée automatiquement pour absorber les variations d&apos;affluence.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Sub-components                                                              */
/* -------------------------------------------------------------------------- */

interface WeekTooltipProps {
  active?: boolean;
  payload?: { payload: {
    fullDay: string;
    àPréparer: number | null;
    prévision: number | null;
    interval: string;
    office: number | null;
    menu: string | null;
    menuPlanned: boolean;
  } }[];
}

function WeekTooltip({ active, payload }: WeekTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-xs rounded-lg border border-border bg-popover p-3 shadow-lg">
      <p className="mb-1.5 text-xs font-semibold text-foreground capitalize">{p.fullDay}</p>
      {p.menuPlanned ? (
        <div className="space-y-1 text-xs">
          <p className="flex justify-between gap-3"><span className="text-muted-foreground">Prévision modèle :</span><span className="font-medium text-foreground">{p.prévision != null ? `${formatNumber(p.prévision)} repas` : '—'}</span></p>
          <p className="flex justify-between gap-3"><span className="text-muted-foreground">Intervalle de confiance :</span><span className="font-medium text-foreground">{p.interval} repas</span></p>
          <p className="flex justify-between gap-3"><span className="text-muted-foreground">À préparer (+6%) :</span><span className="font-medium text-foreground">{p.àPréparer != null ? `${formatNumber(p.àPréparer)} repas` : '—'}</span></p>
          <p className="flex justify-between gap-3"><span className="text-muted-foreground">Employés au bureau :</span><span className="font-medium text-foreground">{p.office != null ? `${formatNumber(p.office)} prévus` : '—'}</span></p>
          {p.menu && (
            <p className="flex justify-between gap-3"><span className="text-muted-foreground">Menu :</span><span className="max-w-[160px] truncate font-medium text-foreground">{p.menu}</span></p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Menu non planifié — aucune prévision pour ce jour. Planifiez le menu pour
          obtenir la prédiction.
        </p>
      )}
    </div>
  );
}