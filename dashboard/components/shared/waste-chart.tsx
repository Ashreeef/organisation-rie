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
  Cell,
} from 'recharts';
import type { WasteDay } from '@/lib/types';

interface WasteChartProps {
  data: WasteDay[];
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: WasteDay }[];
  label?: string;
}

function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 shadow-lg">
      <p className="mb-1 text-xs font-semibold text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{d.menu}</p>
      <div className="mt-1.5 space-y-0.5 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Préparés :</span>
          <span className="font-medium">{d.prepared}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Servis :</span>
          <span className="font-medium">{d.served}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Gaspillés :</span>
          <span className="font-medium text-destructive">{d.wasted}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Taux :</span>
          <span className="font-medium">{d.wasteRate}%</span>
        </div>
      </div>
    </div>
  );
}

export function WasteChart({ data }: WasteChartProps) {
  const maxRate = Math.max(...data.map((d) => d.wasteRate));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))' }} />
        <Bar dataKey="wasteRate" name="Taux de gaspillage %" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.wasteRate > maxRate * 0.7
                  ? 'hsl(var(--destructive))'
                  : entry.wasteRate > maxRate * 0.4
                  ? 'hsl(var(--warning))'
                  : 'hsl(var(--success))'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
