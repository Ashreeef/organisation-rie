'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { ForecastHistoryEntry } from '@/lib/types';
import { formatNumber, formatPercent, formatDate, formatDateLong } from '@/lib/format';
import { isoDate, startOfOperationalWeek, operationalWeekDays } from '@/lib/operational-calendar';
import { cn } from '@/lib/utils';
import {
  ChevronLeft,
  ChevronRight,
  Printer,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Brain,
  BarChart3,
  Recycle,
  FileText,
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Types                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

interface WeekDayRow {
  date: string;
  dow: number;
  dowLabel: string;
  menu: string;
  mlForecast: number;
  naiveBaseline: number;
  actual: number;
  prepared: number;
  wasted: number;
  wasteRate: number;
  mlError: number;
  naiveError: number;
  mlCloser: boolean;
}

interface WeekSummary {
  totalForecast: number;
  totalActual: number;
  totalPrepared: number;
  totalWasted: number;
  wasteRate: number;
  mlAvgError: number;
  naiveAvgError: number;
  mlAccuracy: number;
  naiveAccuracy: number;
  mlBetterDays: number;
  naiveBetterDays: number;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                   */
/* ─────────────────────────────────────────────────────────────────────────── */

const DOW_MAP: Record<number, string> = {
  0: 'Dimanche',
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
};

function computeNaiveBaseline(
  allHistory: ForecastHistoryEntry[],
  targetDate: string,
  targetDow: number,
): number {
  // Baseline naïve honnête — on n'utilise QUE le passé strict (dates < cible)
  // pour ne jamais fuiter la valeur réelle du jour à prédire.
  //
  // Stratégie en 2 niveaux, robuste aux historiques clairsemés :
  //   1. Si au moins un jour passé de MÊME jour de semaine existe → moyenne du
  //      réel de ces jours (baseline saisonnière, la plus pertinente).
  //   2. Sinon → repli sur la moyenne du réel de TOUS les jours passés
  //      (baseline "moyenne simple"), pour qu'un jour sans précédent homologue
  //      obtienne quand même une référence chiffrée plutôt que 0.
  const pastDays = allHistory.filter(
    (e) => e.hasForecast && e.actual > 0 && e.date < targetDate,
  );

  const sameDow = pastDays.filter(
    (e) => new Date(e.date).getDay() === targetDow,
  );
  const pool = sameDow.length > 0 ? sameDow : pastDays;

  if (pool.length === 0) return 0;
  return Math.round(pool.reduce((s, e) => s + e.actual, 0) / pool.length);
}

function buildWeekRows(
  weekDays: Date[],
  weekHistory: ForecastHistoryEntry[],
  allHistory: ForecastHistoryEntry[],
): WeekDayRow[] {
  const byDate = new Map(weekHistory.map((e) => [e.date, e]));

  return weekDays.map((d) => {
    const key = isoDate(d);
    const entry = byDate.get(key);
    const dow = d.getDay();
    const naive = computeNaiveBaseline(allHistory, key, dow);

    const actual = entry?.actual ?? 0;
    const mlForecast = entry?.forecast ?? 0;
    const prepared = entry?.prepared ?? 0;
    const wasted = prepared - actual;
    const wasteRate = prepared > 0 ? Math.round((wasted / prepared) * 1000) / 10 : 0;

    const mlError = mlForecast > 0 ? Math.abs(mlForecast - actual) : 0;
    const naiveError = naive > 0 ? Math.abs(naive - actual) : 0;
    const mlCloser = mlError < naiveError;

    return {
      date: key,
      dow,
      dowLabel: DOW_MAP[dow] ?? '',
      menu: entry?.menu ?? '',
      mlForecast,
      naiveBaseline: naive,
      actual,
      prepared,
      wasted,
      wasteRate,
      mlError,
      naiveError,
      mlCloser,
    };
  });
}

function computeSummary(rows: WeekDayRow[]): WeekSummary {
  const withActual = rows.filter((r) => r.actual > 0);
  const withForecast = rows.filter((r) => r.mlForecast > 0);

  const totalForecast = withForecast.reduce((s, r) => s + r.mlForecast, 0);
  const totalActual = withActual.reduce((s, r) => s + r.actual, 0);
  const totalPrepared = withActual.reduce((s, r) => s + r.prepared, 0);
  const totalWasted = withActual.reduce((s, r) => s + r.wasted, 0);
  const wasteRate = totalPrepared > 0 ? Math.round((totalWasted / totalPrepared) * 1000) / 10 : 0;

  const mlAvgError =
    withForecast.length > 0
      ? Math.round(withForecast.reduce((s, r) => s + r.mlError, 0) / withForecast.length)
      : 0;
  const naiveAvgError =
    withForecast.length > 0
      ? Math.round(withForecast.reduce((s, r) => s + r.naiveError, 0) / withForecast.length)
      : 0;

  const mlAccuracy = totalActual > 0 ? Math.round((1 - mlAvgError / (totalActual / withActual.length || 1)) * 100) : 0;
  const naiveAccuracy = totalActual > 0 ? Math.round((1 - naiveAvgError / (totalActual / withActual.length || 1)) * 100) : 0;

  const mlBetterDays = withForecast.filter((r) => r.mlCloser).length;
  const naiveBetterDays = withForecast.filter((r) => !r.mlCloser && r.naiveError < r.mlError).length;

  return {
    totalForecast,
    totalActual,
    totalPrepared,
    totalWasted,
    wasteRate,
    mlAvgError,
    naiveAvgError,
    mlAccuracy: Math.max(0, mlAccuracy),
    naiveAccuracy: Math.max(0, naiveAccuracy),
    mlBetterDays,
    naiveBetterDays,
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Page Component                                                            */
/* ─────────────────────────────────────────────────────────────────────────── */

export default function WeeklyReportPage() {
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [allHistory, setAllHistory] = React.useState<ForecastHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.getForecastHistory().then((h) => {
      setAllHistory(h);
      setLoading(false);
    });
  }, []);

  const weekStart = React.useMemo(() => {
    const base = startOfOperationalWeek(new Date());
    const d = new Date(base);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const weekDays = React.useMemo(() => operationalWeekDays(weekStart, 5), [weekStart]);

  const weekHistory = React.useMemo(() => {
    const start = isoDate(weekDays[0]);
    const end = isoDate(weekDays[weekDays.length - 1]);
    return allHistory.filter((e) => e.date >= start && e.date <= end);
  }, [allHistory, weekDays]);

  const rows = React.useMemo(
    () => buildWeekRows(weekDays, weekHistory, allHistory),
    [weekDays, weekHistory, allHistory],
  );

  const summary = React.useMemo(() => computeSummary(rows), [rows]);

  const weekLabel = React.useMemo(() => {
    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];
    return `Semaine du ${formatDate(isoDate(first))} au ${formatDate(isoDate(last))}`;
  }, [weekDays]);

  const chartData = rows.map((r) => ({
    day: `${r.dowLabel.slice(0, 3)} ${new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}`,
    'Prévision ML': r.mlForecast || null,
    'Baseline naïf': r.naiveBaseline || null,
    'Réel': r.actual || null,
  }));

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-80 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  const improvementPct =
    summary.naiveAvgError > 0
      ? Math.round(((summary.naiveAvgError - summary.mlAvgError) / summary.naiveAvgError) * 100)
      : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* ── No-print: controls ──────────────────────────────── */}
      <div className="no-print overflow-hidden rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Rapport Hebdomadaire</h1>
              <p className="text-sm text-muted-foreground">
                Synthèse ML vs baseline naïve
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/waste">
              <Button variant="outline" size="sm">
                <ArrowLeft className="mr-1 h-4 w-4" />
                Gaspillage
              </Button>
            </Link>
            <span className="mx-1 h-6 w-px bg-border" />
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Précédente
            </Button>
            <span className="min-w-36 text-center text-sm font-medium text-foreground">{weekLabel}</span>
            <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
              Suivante
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <span className="mx-1 h-6 w-px bg-border" />
            <Button size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Imprimer
            </Button>
          </div>
        </div>
      </div>

      {/* ── Print header (only visible when printing) ───── */}
      <div className="print-only hidden print:block">
        <div className="border-b-2 border-foreground pb-4 mb-6">
          <h1 className="text-2xl font-bold">Rapport Hebdomadaire — RIIE</h1>
          <p className="text-sm text-muted-foreground mt-1">{weekLabel}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Généré le {formatDateLong(isoDate(new Date()))}
          </p>
        </div>
      </div>

      {/* ── KPI Cards ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total prévu (ML)
          </p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {formatNumber(summary.totalForecast)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">repas par le modèle</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Total réel servi
          </p>
          <p className="mt-2 text-3xl font-semibold text-primary">
            {formatNumber(summary.totalActual)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">repas consommés</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gaspillage
          </p>
          <p className="mt-2 text-3xl font-semibold text-destructive">
            {formatNumber(summary.totalWasted)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatPercent(summary.wasteRate)} de taux
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Précision ML
          </p>
          <p className={cn(
            'mt-2 text-3xl font-semibold',
            summary.mlAccuracy > summary.naiveAccuracy ? 'text-success' : 'text-warning',
          )}>
            {summary.mlAccuracy}%
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            vs {summary.naiveAccuracy}% naïf
          </p>
        </Card>
      </div>

      {/* ── ML vs Naive insight banner ─────────────────────── */}
      {summary.mlBetterDays + summary.naiveBetterDays > 0 && (
        <Card className={cn(
          'flex items-start gap-4 p-5',
          improvementPct > 0
            ? 'border-success/30 bg-success/5'
            : 'border-warning/30 bg-warning/5',
        )}>
          <div className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-full',
            improvementPct > 0 ? 'bg-success/10' : 'bg-warning/10',
          )}>
            <Brain className={cn('h-6 w-6', improvementPct > 0 ? 'text-success' : 'text-warning')} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground">
              {improvementPct > 0
                ? `Le modèle ML réduit l'erreur de ${improvementPct}% par rapport à la baseline naïve`
                : 'La baseline naïfe surperforme cette semaine — le modèle sera réentraîné'}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Erreur moyenne ML : {formatNumber(summary.mlAvgError)} repas/jour ·
              {' '}Baseline naïve : {formatNumber(summary.naiveAvgError)} repas/jour ·
              {' '}ML meilleur sur {summary.mlBetterDays}/{summary.mlBetterDays + summary.naiveBetterDays} jour(s)
            </p>
          </div>
        </Card>
      )}

      {/* ── Chart: ML vs Naive vs Actual ──────────────────── */}
      <Card className="p-6">
        <SectionHeader
          title="Prévision ML vs Baseline naïve vs Réel"
          description="Comparaison jour par jour — le modèle ML apprend les tendances spécifiques au menu et au contexte"
        />
        <div className="mt-4">
          {chartData.some((d) => d['Prévision ML'] || d['Réel']) ? (
            <ResponsiveContainer width="100%" height={340}>
              <ComposedChart data={chartData} margin={{ top: 16, right: 24, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="day"
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
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(var(--border))',
                    fontSize: 12,
                    background: 'hsl(var(--popover))',
                  }}
                  formatter={(value: number, name: string) => [
                    `${formatNumber(value)} repas`,
                    name,
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  iconType="square"
                />
                <Bar
                  dataKey="Prévision ML"
                  fill="#009453"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                />
                <Bar
                  dataKey="Baseline naïf"
                  fill="#94A3B8"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                  strokeDasharray="5 5"
                />
                <Line
                  type="monotone"
                  dataKey="Réel"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#3B82F6' }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium text-foreground">Aucune donnée cette semaine</p>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Les données apparaîtront une fois les bilans quotidiens saisis.
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Daily Breakdown Table ────────────────────────── */}
      <Card className="p-6">
        <SectionHeader
          title="Détail journalier"
          description="Performance du modèle jour par jour"
        />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Jour</th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Menu</th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">Prévu (ML)</th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">Baseline naïf</th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">Réel</th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">Gaspillé</th>
                <th className="pb-3 pr-4 text-right font-medium text-muted-foreground">Taux</th>
                <th className="pb-3 pr-4 text-center font-medium text-muted-foreground">ML vs naïf</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const hasData = r.actual > 0;
                return (
                  <tr
                    key={r.date}
                    className="border-b border-border/50 transition-colors hover:bg-muted/30"
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium text-foreground">{r.dowLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(r.date + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                      </div>
                    </td>
                    <td className="max-w-[200px] truncate py-3 pr-4 text-muted-foreground">
                      {r.menu || '—'}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-foreground">
                      {r.mlForecast > 0 ? formatNumber(r.mlForecast) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {r.naiveBaseline > 0 ? formatNumber(r.naiveBaseline) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium text-foreground">
                      {hasData ? formatNumber(r.actual) : '—'}
                    </td>
                    <td className={cn(
                      'py-3 pr-4 text-right font-medium',
                      r.wasted > 0 ? 'text-destructive' : 'text-muted-foreground',
                    )}>
                      {hasData ? formatNumber(r.wasted) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-right text-muted-foreground">
                      {hasData ? formatPercent(r.wasteRate) : '—'}
                    </td>
                    <td className="py-3 pr-4 text-center">
                      {hasData && r.mlForecast > 0 && r.naiveBaseline > 0 ? (
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                            r.mlCloser
                              ? 'bg-success/10 text-success'
                              : 'bg-warning/10 text-warning',
                          )}
                        >
                          {r.mlCloser ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {r.mlCloser ? 'ML' : 'Naïf'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Waste Summary ──────────────────────────────────── */}
      <Card className="p-6">
        <SectionHeader
          title="Synthèse gaspillage"
          description="Impact opérationnel de la semaine"
        />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <Recycle className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Préparés</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {formatNumber(summary.totalPrepared)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">repas sortis de la cuisine</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-success" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Servis</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-success">
              {formatNumber(summary.totalActual)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">repas consommés</p>
          </div>
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Gaspillés</p>
            </div>
            <p className="mt-2 text-2xl font-semibold text-destructive">
              {formatNumber(summary.totalWasted)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatPercent(summary.wasteRate)} de taux de gaspillage
            </p>
          </div>
        </div>
      </Card>

      {/* ── Print footer (only visible when printing) ────── */}
      <div className="print-only hidden print:block mt-8 border-t border-border pt-4">
        <p className="text-xs text-muted-foreground text-center">
          Rapport généré automatiquement par RIIE Intelligence — {formatDateLong(isoDate(new Date()))}
        </p>
      </div>
    </div>
  );
}
