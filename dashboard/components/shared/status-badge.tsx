'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const statusConfig = {
  synced: { label: 'Synchronisé', color: 'bg-success', text: 'text-success' },
  syncing: { label: 'Synchronisation…', color: 'bg-primary', text: 'text-primary' },
  delayed: { label: 'Retardé', color: 'bg-warning', text: 'text-warning' },
  error: { label: 'Erreur', color: 'bg-destructive', text: 'text-destructive' },
};

type StatusKey = keyof typeof statusConfig;

export function StatusBadge({ status }: { status: StatusKey }) {
  const config = statusConfig[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span className={cn('h-2 w-2 rounded-full', config.color)} />
      <span className={config.text}>{config.label}</span>
    </span>
  );
}

export function StatusDot({ status }: { status: StatusKey }) {
  const config = statusConfig[status];
  return <span className={cn('inline-block h-2 w-2 rounded-full', config.color)} />;
}
