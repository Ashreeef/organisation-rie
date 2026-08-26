'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { ProcurementItem, ProcurementSummary } from '@/lib/types';
import { formatNumber, formatDZD } from '@/lib/format';
import { Package, FileText, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const statusConfig = {
  'en-stock': { label: 'En stock', className: 'bg-success/10 text-success' },
  'a-commander': { label: 'À commander', className: 'bg-warning/10 text-warning' },
  'commande': { label: 'Commandé', className: 'bg-primary/10 text-primary' },
  'livre': { label: 'Livré', className: 'bg-success/10 text-success' },
};

export default function ProcurementPage() {
  const [items, setItems] = React.useState<ProcurementItem[]>([]);
  const [summary, setSummary] = React.useState<ProcurementSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [orderGenerated, setOrderGenerated] = React.useState(false);
  const [recommendedMeals, setRecommendedMeals] = React.useState(0);

  React.useEffect(() => {
    Promise.all([
      api.getProcurementItems(),
      api.getProcurementSummary(),
      api.getTomorrowForecast(),
    ]).then(([i, s, f]) => {
      setItems(i);
      setSummary(s);
      setRecommendedMeals(f.recommendedMeals);
      setLoading(false);
    });
  }, []);

  const handleGenerateOrder = () => {
    api.generateOrder().then((result) => {
      setOrderGenerated(true);
      toast.success(`Commande ${result.orderId} générée — ${formatDZD(result.totalCost)}`);
    });
  };

  if (loading || !summary) return <Skeleton className="h-96 w-full rounded-lg" />;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header context */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              Commande pour demain
            </p>
            <p className="text-xs text-muted-foreground">
              Basé sur {formatNumber(recommendedMeals)} repas recommandés — Preparation demain
            </p>
          </div>
        </div>
      </Card>

      {/* Ingredient list */}
      <Card className="p-6">
        <SectionHeader
          title="Ingrédients nécessaires"
          description={`${items.length} ingrédients · ${summary.itemsToOrder} à commander`}
        />
        <div className="mt-4 space-y-3">
          {items.map((item) => {
            const status = statusConfig[item.status];
            return (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {item.ingredient}
                    </p>
                    <Badge variant="outline" className={cn('text-xs', status.className)}>
                      {status.label}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Besoin : {item.quantityRequired} {item.unit} · Stock actuel : {item.currentStock} {item.unit} · {item.supplier}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">
                    À commander : {item.quantityToOrder} {item.unit}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDZD(item.estimatedCost)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Total + generate */}
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-muted-foreground">Total estimé</p>
            <p className="mt-1 text-3xl font-bold text-primary">
              {formatDZD(summary.totalCost)}
            </p>
          </div>
          {orderGenerated ? (
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-5 w-5" />
              <span className="text-sm font-medium">Commande générée</span>
            </div>
          ) : (
            <Button size="lg" onClick={handleGenerateOrder}>
              <FileText className="mr-2 h-4 w-4" />
              Générer la commande
            </Button>
          )}
        </div>
      </Card>

      {/* Reference data notice */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0" />
        <p>
          Données de référence — Les ingrédients et prix seront connectés au système ERP et aux catalogues fournisseurs.
        </p>
      </div>
    </div>
  );
}
