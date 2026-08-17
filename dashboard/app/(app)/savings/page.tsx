'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { FinancialKPI } from '@/lib/types';
import { formatDZD } from '@/lib/format';
import { TrendingUp, TrendingDown, Info } from 'lucide-react';

export default function SavingsPage() {
  const [financial, setFinancial] = React.useState<FinancialKPI | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    api.getFinancialKPIs().then((f) => {
      setFinancial(f);
      setLoading(false);
    });
  }, []);

  if (loading || !financial) return <Skeleton className="h-96 w-full rounded-lg" />;

  const savingsData = financial.monthlyTrend.map((m) => ({
    month: m.month,
    savings: m.savings,
    wasteCost: m.wasteCost,
  }));

  const cumulativeData = financial.monthlyTrend.reduce(
    (acc, m, i) => {
      const prev = i > 0 ? acc[i - 1].cumulative : 0;
      acc.push({ month: m.month, cumulative: prev + m.savings });
      return acc;
    },
    [] as { month: string; cumulative: number }[]
  );

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Main KPIs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className="p-5 border-success/20 bg-success/5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Économies estimées ce mois
          </p>
          <p className="mt-2 text-3xl font-bold text-success">
            +{formatDZD(financial.estimatedSavings)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>+4% vs mois précédent</span>
          </div>
        </Card>
        <Card className="p-5 border-destructive/20 bg-destructive/5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Coût du gaspillage
          </p>
          <p className="mt-2 text-3xl font-bold text-destructive">
            {formatDZD(financial.wasteCost)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-success">
            <TrendingDown className="h-3.5 w-3.5" />
            <span>-1,6% vs mois précédent</span>
          </div>
        </Card>
        <Card className="p-5 border-success/20 bg-success/5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Gaspillage évité
          </p>
          <p className="mt-2 text-3xl font-bold text-success">
            {formatDZD(financial.avoidedWaste)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Ce mois</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Coût alimentaire total
          </p>
          <p className="mt-2 text-3xl font-bold text-foreground">
            {formatDZD(financial.foodCost)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Ce mois</p>
        </Card>
      </div>

      {/* Monthly trend */}
      <Card className="p-6">
        <SectionHeader
          title="Évolution mensuelle"
          description="Économies vs coût du gaspillage sur 6 mois"
        />
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={savingsData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  fontSize: 12,
                }}
                formatter={(value: number) => formatDZD(value)}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="savings" name="Économies" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="wasteCost" name="Coût du gaspillage" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Cumulative savings */}
      <Card className="p-6">
        <SectionHeader
          title="Économies cumulées"
          description="Total des économies réalisées sur 6 mois"
        />
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={cumulativeData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="savingsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid hsl(var(--border))',
                  fontSize: 12,
                }}
                formatter={(value: number) => formatDZD(value)}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                name="Économies cumulées"
                stroke="hsl(var(--primary))"
                strokeWidth={2.5}
                fill="url(#savingsGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Comparison with manual planning */}
      <Card className="p-6">
        <SectionHeader
          title="Comparaison avec la planification manuelle"
          description="Impact du système par rapport aux méthodes précédentes"
        />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-muted/20 p-5">
            <p className="text-sm font-semibold text-muted-foreground">Planification manuelle (estimation)</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gaspillage moyen</span>
                <span className="font-medium text-foreground">8,5%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coût mensuel du gaspillage</span>
                <span className="font-medium text-foreground">{formatDZD(28500)}</span>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/5 p-5">
            <p className="text-sm font-semibold text-success">Avec le système actuel</p>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gaspillage moyen</span>
                <span className="font-medium text-success">5,8%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coût mensuel du gaspillage</span>
                <span className="font-medium text-success">{formatDZD(financial.wasteCost)}</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Demo notice */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <p>
          Données financières de démonstration — Les chiffres réels seront connectés
          aux données comptables du RIE.
        </p>
      </div>
    </div>
  );
}
