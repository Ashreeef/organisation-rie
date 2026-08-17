'use client';

import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ForecastResult } from '@/lib/types';
import { formatNumber } from '@/lib/format';

const reliabilityConfig = {
  high: { label: 'Bonne', color: 'bg-success' },
  medium: { label: 'Moyenne', color: 'bg-warning' },
  low: { label: 'Faible', color: 'bg-destructive' },
};

interface ForecastCardProps {
  forecast: ForecastResult;
  tomorrowLabel?: string;
  compact?: boolean;
}

export function ForecastCard({ forecast, tomorrowLabel, compact }: ForecastCardProps) {
  const conf = reliabilityConfig[forecast.confidenceLevel];

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/[0.04] to-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">
          {tomorrowLabel ?? 'Demain'}
        </p>
        <Badge
          variant="outline"
          className="gap-1.5 border-success/30 bg-success/5 text-success"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${conf.color}`} />
          Fiabilité {conf.label.toLowerCase()}
        </Badge>
      </div>

      {/* Flow: Employees → Estimated → Recommended */}
      {!compact && (
        <div className="mt-6 flex items-center justify-center gap-6 lg:gap-10">
          {/* Employees */}
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Employés attendus
            </p>
            <p className="mt-1 text-4xl font-bold text-foreground">
              {formatNumber(forecast.expectedPresence)}
            </p>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center text-muted-foreground">
            <ChevronRight className="h-6 w-6 rotate-90 lg:rotate-0" />
          </div>

          {/* Estimated */}
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Repas estimés
            </p>
            <p className="mt-1 text-4xl font-bold text-foreground">
              {formatNumber(forecast.predictedMeals)}
            </p>
          </div>

          {/* Arrow */}
          <div className="flex flex-col items-center text-muted-foreground">
            <ChevronRight className="h-6 w-6 rotate-90 lg:rotate-0" />
          </div>

          {/* Recommended */}
          <div className="text-center">
            <p className="text-xs font-medium uppercase tracking-wide text-primary">
              Repas recommandés
            </p>
            <p className="mt-1 text-5xl font-bold text-primary">
              {formatNumber(forecast.recommendedMeals)}
            </p>
          </div>
        </div>
      )}

      {/* Compact mode: just the number */}
      {compact && (
        <div className="mt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Repas recommandés
          </p>
          <p className="mt-1 text-5xl font-bold text-primary">
            {formatNumber(forecast.recommendedMeals)}
          </p>
        </div>
      )}

      {/* Explanation */}
      <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm text-muted-foreground">
          {forecast.recommendationNote}
        </p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>
            Estimation : {formatNumber(forecast.confidenceLower)} — {formatNumber(forecast.confidenceUpper)} repas
          </span>
          <span>Marge de sécurité incluse</span>
        </div>
      </div>
    </Card>
  );
}
