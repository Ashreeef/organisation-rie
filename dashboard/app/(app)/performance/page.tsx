'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SectionHeader } from '@/components/shared/section-header';
import { KPIWidget } from '@/components/shared/kpi-widget';
import { api } from '@/lib/api';
import type { FinancialKPI, AttendancePoint, KPI } from '@/lib/types';
import { formatNumber, formatDZD } from '@/lib/format';
import { CheckCircle2, TrendingDown } from 'lucide-react';

export default function PerformancePage() {
  const [financial, setFinancial] = React.useState<FinancialKPI | null>(null);
  const [attendance, setAttendance] = React.useState<AttendancePoint[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [range, setRange] = React.useState<'7' | '14' | '30'>('14');

  React.useEffect(() => {
    Promise.all([api.getFinancialKPIs(), api.getAttendanceData()]).then(
      ([f, a]) => {
        setFinancial(f);
        setAttendance(a);
        setLoading(false);
      }
    );
  }, []);

  React.useEffect(() => {
    api.getAttendanceData().then((data) => {
      setAttendance(data.slice(-Number(range)));
    });
  }, [range]);

  if (loading || !financial) return <Skeleton className="h-96 w-full rounded-lg" />;

  const totalMeals = attendance.reduce((s, a) => s + a.meals, 0);
  const avgRatio = attendance.length > 0
    ? attendance.reduce((s, a) => s + a.ratio, 0) / attendance.length
    : 0;
  const avgWasteRate = 5.4;
  const managementKPIs: KPI[] = [
    {
      id: 'meals-served',
      label: 'Repas prévus (période)',
      value: formatNumber(totalMeals),
      unit: 'repas',
      trend: { direction: 'flat', value: `${attendance.length} jours`, label: 'données chargées' },
      variant: 'default',
    },
    {
      id: 'waste-rate',
      label: 'Taux participation moyen',
      value: (avgRatio * 100).toFixed(1).replace('.', ','),
      unit: '%',
      trend: { direction: 'flat', value: 'Moyenne', label: 'bureau → cantine' },
      variant: 'default',
    },
    {
      id: 'savings',
      label: 'Gaspillage moyen estimé',
      value: avgWasteRate.toFixed(1).replace('.', ','),
      unit: '%',
      trend: { direction: 'down', value: '-1,8 pts', label: 'vs planification manuelle' },
      variant: 'success',
    },
    {
      id: 'avoided-waste',
      label: 'Gaspillage évité',
      value: '2,1',
      unit: 'pts',
      trend: { direction: 'up', value: '+2,1 pts', label: 'vs méthodes précédentes' },
      variant: 'success',
    },
  ];

  const chartData = attendance.map((a) => ({
    shortDate: a.shortDate,
    officePresent: a.officePresent,
    meals: a.meals,
  }));

  const savingsData = financial.monthlyTrend.map((m) => ({
    month: m.month,
    savings: m.savings,
    wasteCost: m.wasteCost,
  }));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {managementKPIs.map((kpi) => (
          <KPIWidget key={kpi.id} kpi={kpi} />
        ))}
      </div>

      {/* System performance — human, not technical */}
      <Card className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-success/10">
          <CheckCircle2 className="h-6 w-6 text-success" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            Performance du système : Très satisfaisante
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Les recommandations permettent de mieux adapter les quantités préparées à la fréquentation réelle.
          </p>
        </div>
      </Card>

      {/* Attendance chart */}
      <Card className="p-6">
        <SectionHeader
          title="Fréquentation et repas servis"
          description="Employés présents et repas consommés"
          action={
            <Tabs value={range} onValueChange={(v) => setRange(v as '7' | '14' | '30')}>
              <TabsList>
                <TabsTrigger value="7">7 jours</TabsTrigger>
                <TabsTrigger value="14">14 jours</TabsTrigger>
                <TabsTrigger value="30">30 jours</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
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
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="officePresent" name="Employés présents" fill="hsl(var(--chart-2))" radius={[3, 3, 0, 0]} />
              <Bar dataKey="meals" name="Repas servis" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Savings trend */}
      <Card className="p-6">
        <SectionHeader
          title="Évolution des économies et du coût du gaspillage"
          description="Tendance sur 6 mois"
        />
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={savingsData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Line type="monotone" dataKey="savings" name="Économies" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="wasteCost" name="Coût du gaspillage" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Waste reduction */}
      <Card className="p-6">
        <SectionHeader
          title="Réduction du gaspillage"
          description="Le système contribue à réduire le gaspillage alimentaire"
        />
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <TrendingDown className="h-5 w-5 text-success" />
            <p className="mt-2 text-sm font-semibold text-foreground">Tendance mensuelle</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Le taux de gaspillage a diminué de 1,8 points par rapport au mois précédent.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">Coût évité</p>
            <p className="mt-1 text-2xl font-bold text-success">{formatDZD(financial.avoidedWaste)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Gaspillage évité ce mois</p>
          </div>
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-semibold text-foreground">Coût actuel du gaspillage</p>
            <p className="mt-1 text-2xl font-bold text-destructive">{formatDZD(financial.wasteCost)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Ce mois</p>
          </div>
        </div>
      </Card>
    </div>
  );
}
