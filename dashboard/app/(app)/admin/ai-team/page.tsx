'use client';

import * as React from 'react';
import {
  ResponsiveContainer,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionHeader } from '@/components/shared/section-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { api } from '@/lib/api';
import type { ModelMetrics, ModelFamily, DataSource } from '@/lib/types';
import { formatNumber } from '@/lib/format';
import { GitBranch, Clock, Activity, Database, Layers, AlertTriangle } from 'lucide-react';

const driftConfig = {
  stable: { label: 'Stable', color: 'text-success', bg: 'bg-success/10' },
  modere: { label: 'Modéré', color: 'text-warning', bg: 'bg-warning/10' },
  eleve: { label: 'Élevé', color: 'text-destructive', bg: 'bg-destructive/10' },
};

export default function AITeamPage() {
  const [metrics, setMetrics] = React.useState<ModelMetrics | null>(null);
  const [families, setFamilies] = React.useState<ModelFamily[]>([]);
  const [sources, setSources] = React.useState<DataSource[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([
      api.getModelMetrics(),
      api.getModelFamilies(),
      api.getDataSources(),
    ]).then(([m, f, s]) => {
      setMetrics(m);
      setFamilies(f);
      setSources(s);
      setLoading(false);
    });
  }, []);

  if (loading || !metrics) return <Skeleton className="h-96 w-full rounded-lg" />;

  const drift = driftConfig[metrics.driftIndicator];
  const accuracyData = [{ name: 'Précision', value: metrics.accuracy, fill: 'hsl(var(--primary))' }];

  const metricCards = [
    { icon: GitBranch, label: 'Version', value: metrics.version },
    { icon: Clock, label: 'Dernier entraînement', value: metrics.lastTrainingDate },
    { icon: Activity, label: 'Dernière prédiction', value: metrics.lastPredictionDate },
    { icon: Database, label: 'Fraîcheur des données', value: metrics.dataFreshness },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Admin warning banner */}
      <div className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
        <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Section technique — Réservée à l’équipe IA
          </p>
          <p className="text-xs text-muted-foreground">
            Cette section contient les détails techniques du système de prévision.
            Les utilisateurs opérationnels n’ont pas besoin d’accéder à ces informations.
          </p>
        </div>
      </div>

      {/* Top metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metricCards.map((m, i) => {
          const Icon = m.icon;
          return (
            <Card key={i} className="p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Icon className="h-4 w-4" />
                <p className="text-xs font-medium uppercase tracking-wide">{m.label}</p>
              </div>
              <p className="mt-2 text-lg font-semibold text-foreground">{m.value}</p>
            </Card>
          );
        })}
      </div>

      {/* Accuracy + Error + Drift */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6">
          <SectionHeader title="Précision (30j)" />
          <div className="mt-4">
            <ResponsiveContainer width="100%" height={200}>
              <RadialBarChart
                data={accuracyData}
                startAngle={90}
                endAngle={-270}
                innerRadius="70%"
                outerRadius="100%"
              >
                <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                <RadialBar dataKey="value" background={{ fill: 'hsl(var(--muted))' }} cornerRadius={10} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="-mt-28 text-center">
              <p className="text-4xl font-bold text-foreground">
                {metrics.accuracy.toFixed(1).replace('.', ',')}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Précision</p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeader title="Métriques d'erreur" />
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">MAE</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(metrics.mae)} <span className="text-sm font-normal text-muted-foreground">repas</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">RMSE</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {formatNumber(metrics.rmse)} <span className="text-sm font-normal text-muted-foreground">repas</span>
              </p>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">Métrique d’évaluation</p>
              <p className="mt-1 text-lg font-semibold text-foreground">
                {metrics.evaluationMetric} = {metrics.predictionError}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <SectionHeader title="Santé du modèle" />
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">Indicateur de drift</p>
              <div className="mt-2">
                <span className={`rounded px-2 py-1 text-sm font-medium ${drift.bg} ${drift.color}`}>
                  {drift.label}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">Disponibilité des features</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">
                {metrics.featureAvailability}%
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${metrics.featureAvailability}%` }} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Ensemble architecture */}
      <Card className="p-6">
        <SectionHeader
          title="Architecture de l'ensemble"
          description={`${metrics.lgbCount + metrics.xgbCount + metrics.catboostCount} modèles combinés (LightGBM + XGBoost + CatBoost)`}
        />
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <Layers className="h-8 w-8 text-primary" />
          <div>
            <p className="text-2xl font-bold text-primary">{metrics.lgbCount + metrics.xgbCount + metrics.catboostCount} modèles</p>
            <p className="text-sm text-muted-foreground">
              Cascade: sous-modèle office_present → ensemble ratio → calibration DOW + shrinkage (λ={metrics.calibrationLambda.toFixed(3)})
            </p>
          </div>
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={families} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={false} width={40} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid hsl(var(--border))', fontSize: 12 }} />
              <Bar dataKey="modelCount" name="Nombre de modèles" radius={[4, 4, 0, 0]}>
                {families.map((_, i) => (
                  <Cell key={i} fill={`hsl(var(--chart-${i + 1}))`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {families.map((fam, i) => (
            <div key={i} className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{fam.name}</p>
                <Badge variant="outline" className="text-xs">{fam.modelCount} modèles</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{fam.description}</p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Contribution</span>
                  <span className="font-medium text-foreground">{fam.contribution}%</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full transition-all" style={{ width: `${fam.contribution}%`, backgroundColor: `hsl(var(--chart-${i + 1}))` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Data sources */}
      <Card className="p-6">
        <SectionHeader
          title="Sources de données"
          description="Intégrations et santé des données"
        />
        <div className="mt-4 space-y-2">
          {sources.map((src) => (
            <div
              key={src.id}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{src.name}</p>
                  <StatusBadge status={src.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {src.description} · {src.lastSync} · {src.records.toLocaleString('fr-FR')} enregistrements
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-foreground">{src.availability}%</p>
                <p className="text-xs text-muted-foreground">Disponibilité</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Technical details */}
      <Card className="p-6">
        <SectionHeader title="Détails techniques" />
        <Accordion type="single" collapsible className="mt-4">
          <AccordionItem value="features">
            <AccordionTrigger>Variables d’entrée (features)</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>• Informations calendaires (jour de semaine, semaine, mois)</li>
                <li>• Jours fériés et événements spéciaux</li>
                <li>• Période Ramadan et fêtes religieuses</li>
                <li>• Présence au bureau (contrôle d’accès)</li>
                <li>• Prévisions météo (température, conditions)</li>
                <li>• Caractéristiques des menus (target encoding)</li>
                <li>• Lag features (7j, 14j, 28j)</li>
                <li>• Patterns year-over-year</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="pipeline">
            <AccordionTrigger>Pipeline de prédiction</AccordionTrigger>
            <AccordionContent>
              <ol className="space-y-1.5 text-sm text-muted-foreground">
                <li>1. Sous-modèle LightGBM: prédit la présence au bureau (7j)</li>
                <li>2. Feature engineering: 126 variables (calendrier, météo, menus, lags)</li>
                <li>3. Ensemble 3 familles (LGB + XGB + CatBoost) prédit le ratio</li>
                <li>4. Calibration: offsets par jour + shrinkage vers la moyenne historique</li>
                <li>5. Conversion ratio × présence → nombre de repas</li>
                <li>6. Marge de sécurité opérationnelle (+4-6%)</li>
              </ol>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="training">
            <AccordionTrigger>Stratégie d’entraînement</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm text-muted-foreground">
                Validation par TimeSeriesSplit (5 folds, gap=7j). Les modèles sont entraînés
                avec des seeds et hyperparamètres Optuna différents. Pondération par blend weights
                optimisés via grid search sur la métrique asymmetric cost.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </div>
  );
}
