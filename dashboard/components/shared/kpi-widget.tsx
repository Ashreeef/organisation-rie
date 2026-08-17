'use client';

import * as React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { KPI } from '@/lib/types';
import { Card } from '@/components/ui/card';

const variantStyles: Record<string, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

const trendIcon = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

const trendColor = {
  up: 'text-success',
  down: 'text-success',
  flat: 'text-muted-foreground',
};

export function KPIWidget({ kpi }: { kpi: KPI }) {
  const TrendIcon = kpi.trend ? trendIcon[kpi.trend.direction] : null;

  return (
    <Card className="p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{kpi.label}</p>
        {kpi.trend && TrendIcon && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium',
              trendColor[kpi.trend.direction]
            )}
          >
            <TrendIcon className="h-3.5 w-3.5" />
            <span>{kpi.trend.value}</span>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span
          className={cn(
            'text-3xl font-semibold tracking-tight',
            variantStyles[kpi.variant ?? 'default']
          )}
        >
          {kpi.value}
        </span>
        {kpi.unit && (
          <span className="text-sm font-medium text-muted-foreground">
            {kpi.unit}
          </span>
        )}
      </div>
      {kpi.trend && (
        <p className="mt-1.5 text-xs text-muted-foreground">{kpi.trend.label}</p>
      )}
    </Card>
  );
}
