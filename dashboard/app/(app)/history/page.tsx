'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { ForecastHistoryEntry } from '@/lib/types';
import { formatDate, formatNumber } from '@/lib/format';
import { Download, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type SortKey = 'date' | 'employeesCount' | 'forecast' | 'prepared' | 'actual' | 'ecart' | 'errorPct';
type SortDir = 'asc' | 'desc';

const statusConfig = {
  bon: { label: 'Bon', className: 'bg-success/10 text-success' },
  acceptable: { label: 'Acceptable', className: 'bg-warning/10 text-warning' },
  mauvais: { label: 'Mauvais', className: 'bg-destructive/10 text-destructive' },
};

export default function HistoryPage() {
  const [history, setHistory] = React.useState<ForecastHistoryEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [sortKey, setSortKey] = React.useState<SortKey>('date');
  const [sortDir, setSortDir] = React.useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');

  React.useEffect(() => {
    // Le socle historique est déjà celui partagé avec /waste (_historyWindow) :
    // aucune fenêtre propre à cette page, sinon les deux pages divergeraient.
    api.getForecastHistory().then((h) => {
      setHistory(h);
      setLoading(false);
    });
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = React.useMemo(() => {
    let result = [...history];
    if (statusFilter !== 'all') {
      result = result.filter((e) => e.status === statusFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter((e) => e.date.includes(s));
    }
    result.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const av = a[sortKey];
      const bv = b[sortKey];
      // Valeurs absentes (null/undefined, exemple : écart lorsque pas de prévision) triées en dernier
      const an = av == null ? Infinity : av;
      const bn = bv == null ? Infinity : bv;
      if (an < bn) return -dir;
      if (an > bn) return dir;
      return 0;
    });
    return result;
  }, [history, sortKey, sortDir, statusFilter, search]);

  const completed = history.filter((e) => e.actual > 0);
  const forecasted = completed.filter((e) => e.hasForecast);
  const avgForecast = forecasted.length > 0
    ? Math.round(forecasted.reduce((s, e) => s + e.forecast, 0) / forecasted.length)
    : 0;
  const avgActual = completed.length > 0
    ? Math.round(completed.reduce((s, e) => s + e.actual, 0) / completed.length)
    : 0;
  const avgWaste = forecasted.length > 0
    ? Math.round(forecasted.reduce((s, e) => s + (e.ecart != null ? Math.abs(e.ecart) / e.actual * 100 : 0), 0) / forecasted.length * 10) / 10
    : 0;

  const errorChartData = history.map((e) => ({
    shortDate: e.date.slice(5),
    error: e.errorPct,
  }));

  const exportCSV = () => {
    const headers = ['Date', 'Employés prévus', 'Prévision', 'Préparés', 'Réel', 'Écart', 'Écart %', 'Statut'];
    const rows = filtered.map((e) => [
      e.date, e.hasAttendance ? e.employeesCount : '', e.forecast, e.prepared, e.actual, e.ecart, e.errorPct, e.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'historique-previsions.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Export CSV généré');
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="ml-1 inline h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 inline h-3 w-3" />
    );
  };

  if (loading) return <Skeleton className="h-96 w-full rounded-lg" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Simple summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Prévision moyenne (30j)
          </p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {formatNumber(avgForecast)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Consommation moyenne (30j)
          </p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {formatNumber(avgActual)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gaspillage moyen
          </p>
          <p className="mt-2 text-3xl font-semibold text-foreground">
            {avgWaste.toString().replace('.', ',')}%
          </p>
        </Card>
      </div>

      {/* Summary text */}
      <Card className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-6 w-6 text-success" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {completed.length > 0
              ? avgActual > 0 && avgForecast > 0
                ? `Écart moyen : ${Math.abs(avgForecast - avgActual)} repas/jour`
                : 'Les prévisions sont globalement proches de la consommation réelle'
              : 'Données historiques chargées — consommation réelle en attente'}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {completed.length > 0
              ? `Basé sur ${completed.length} jour(s) avec données réelles.`
              : `${history.length} prévisions chargées. Les données réelles seront ajoutées prochainement.`}
          </p>
        </div>
      </Card>

      {/* Error chart */}
      <Card className="p-6">
        <SectionHeader
          title="Écart avec la consommation réelle"
          description="Évolution de l'écart en pourcentage"
        />
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={errorChartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="shortDate"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="error"
                name="Écart %"
                stroke="hsl(var(--chart-3))"
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* History table */}
      <Card className="p-6">
        <SectionHeader
          title="Historique détaillé"
          description={`${filtered.length} entrées`}
          action={
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          }
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Input
            placeholder="Rechercher par date…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Statut" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les statuts</SelectItem>
              <SelectItem value="bon">Bon</SelectItem>
              <SelectItem value="acceptable">Acceptable</SelectItem>
              <SelectItem value="mauvais">Mauvais</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="cursor-pointer pb-3 pr-4 font-medium text-muted-foreground" onClick={() => toggleSort('date')}>
                  Date <SortIcon col="date" />
                </th>
                <th className="cursor-pointer pb-3 pr-4 font-medium text-muted-foreground" onClick={() => toggleSort('employeesCount')}>
                  Employés prévus <SortIcon col="employeesCount" />
                </th>
                <th className="cursor-pointer pb-3 pr-4 font-medium text-muted-foreground" onClick={() => toggleSort('forecast')}>
                  Prévision <SortIcon col="forecast" />
                </th>
                <th className="cursor-pointer pb-3 pr-4 font-medium text-muted-foreground" onClick={() => toggleSort('prepared')}>
                  Préparés <SortIcon col="prepared" />
                </th>
                <th className="cursor-pointer pb-3 pr-4 font-medium text-muted-foreground" onClick={() => toggleSort('actual')}>
                  Réel <SortIcon col="actual" />
                </th>
                <th className="cursor-pointer pb-3 pr-4 font-medium text-muted-foreground" onClick={() => toggleSort('ecart')}>
                  Écart <SortIcon col="ecart" />
                </th>
                <th className="cursor-pointer pb-3 pr-4 font-medium text-muted-foreground" onClick={() => toggleSort('errorPct')}>
                  Écart % <SortIcon col="errorPct" />
                </th>
                <th className="pb-3 pr-4 font-medium text-muted-foreground">Statut</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-border/50 transition-colors hover:bg-muted/30"
                >
                  <td className="py-3 pr-4 capitalize text-foreground">{formatDate(entry.date)}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {entry.hasAttendance ? formatNumber(entry.employeesCount) : 'Non disponible'}
                  </td>
                  <td className="py-3 pr-4 font-medium text-foreground">{formatNumber(entry.forecast)}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{formatNumber(entry.prepared)}</td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {entry.hasForecast ? formatNumber(entry.actual) : formatNumber(entry.actual)}
                  </td>
                  <td className={cn(
                    'py-3 pr-4 font-medium',
                    entry.ecart != null && entry.ecart > 0 ? 'text-destructive' : entry.ecart != null && entry.ecart < 0 ? 'text-success' : 'text-muted-foreground'
                  )}>
                    {entry.hasForecast && entry.ecart != null ? `${entry.ecart > 0 ? '+' : ''}${entry.ecart}` : '—'}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {entry.hasForecast && entry.errorPct != null ? `${entry.errorPct}%` : '—'}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={cn('rounded px-2 py-0.5 text-xs font-medium', statusConfig[entry.status].className)}>
                      {statusConfig[entry.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Aucune entrée ne correspond aux filtres.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
