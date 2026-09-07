'use client';

import * as React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import type { OperationalAlert } from '@/lib/types';

const severityConfig = {
  critical: {
    icon: AlertTriangle,
    color: 'text-destructive',
    bg: 'bg-destructive/5',
    border: 'border-destructive/20',
    label: 'Urgent',
  },
  high: {
    icon: AlertTriangle,
    color: 'text-warning',
    bg: 'bg-warning/5',
    border: 'border-warning/20',
    label: 'Attention',
  },
  medium: {
    icon: AlertCircle,
    color: 'text-warning',
    bg: 'bg-warning/5',
    border: 'border-warning/20',
    label: 'À vérifier',
  },
  low: {
    icon: Info,
    color: 'text-muted-foreground',
    bg: 'bg-muted/40',
    border: 'border-border',
    label: 'Information',
  },
  info: {
    icon: Info,
    color: 'text-muted-foreground',
    bg: 'bg-muted/40',
    border: 'border-border',
    label: 'Information',
  },
};

export function AlertCard({ alert }: { alert: OperationalAlert }) {
  const config = severityConfig[alert.severity];
  const Icon = config.icon;

  return (
    <Card
      className={cn(
        'flex items-start gap-3 border p-4 transition-shadow hover:shadow-md',
        config.border,
        config.bg
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', config.color)} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{alert.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{alert.explanation}</p>
        <div className="mt-2 flex items-start gap-1.5 text-xs">
          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
          <p className="text-foreground">
            {alert.recommendedAction}
          </p>
        </div>
      </div>
    </Card>
  );
}
