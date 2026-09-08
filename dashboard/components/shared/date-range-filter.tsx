'use client';

import * as React from 'react';
import { format } from 'date-fns';
import type { DateRange as DayPickerDateRange } from 'react-day-picker';
import { CalendarDays, X } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type RangePreset = 'all' | '7d' | '30d' | 'custom';

export interface DateRange {
  preset: RangePreset;
  /** Bornes de la période personnalisée (YYYY-MM-DD). */
  from?: string;
  to?: string;
}

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: 'all', label: 'Toute la période' },
  { value: '7d', label: '7 derniers jours' },
  { value: '30d', label: '30 derniers jours' },
  { value: 'custom', label: 'Période personnalisée' },
];

// Libellé court de la période active, utilisé dans les titres/descriptions.
export function rangeLabel(range: DateRange): string {
  switch (range.preset) {
    case 'all':
      return 'toute la période';
    case '7d':
      return '7 derniers jours';
    case '30d':
      return '30 derniers jours';
    case 'custom': {
      const from = range.from ? format(fromIso(range.from), 'dd/MM/yyyy') : null;
      const to = range.to ? format(fromIso(range.to), 'dd/MM/yyyy') : null;
      if (from && to) return `du ${from} au ${to}`;
      if (from) return `à partir du ${from}`;
      if (to) return `jusqu'au ${to}`;
      return 'toute la période';
    }
  }
}

// Filtre une liste de lignes datées (ISO YYYY-MM-DD, comparaison lexicale sûre)
// selon une plage. Les présélections 7j/30j sont relatives à la dernière date
// présente dans les données (jamais "aujourd'hui", qui divergerait si les
// bilans retardent).
export function applyDateRange<T extends { date: string }>(rows: T[], range: DateRange): T[] {
  if (rows.length === 0 || range.preset === 'all') return rows;

  if (range.preset === '7d' || range.preset === '30d') {
    const maxDate = rows.reduce((max, r) => (r.date > max ? r.date : max), rows[0].date);
    const addDays = range.preset === '7d' ? -6 : -29;
    const threshold = shiftIso(maxDate, addDays);
    return rows.filter((r) => r.date >= threshold);
  }

  // Période personnalisée : bornes inclusives, optionnelles.
  if (!range.from && !range.to) return rows;
  return rows.filter((r) => {
    if (range.from && r.date < range.from) return false;
    if (range.to && r.date > range.to) return false;
    return true;
  });
}

function shiftIso(iso: string, days: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
}

// Conversions ISO <-> Date sans dérive de fuseau : la chaîne YYYY-MM-DD est
// interprétée en heures locales (minuit), jamais via UTC (toISOString décalerait
// d'une journée selon le fuseau).
function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface DateRangeFilterProps {
  range: DateRange;
  onChange: (range: DateRange) => void;
}

export function DateRangeFilter({ range, onChange }: DateRangeFilterProps) {
  const [open, setOpen] = React.useState(false);

  const selected = React.useMemo<DayPickerDateRange | undefined>(() => {
    const from = range.from ? fromIso(range.from) : undefined;
    const to = range.to ? fromIso(range.to) : undefined;
    return from || to ? { from, to } : undefined;
  }, [range.from, range.to]);

  const handlePreset = (preset: RangePreset) => onChange({ preset });

  const handleRange = (sel: DayPickerDateRange | undefined) => {
    onChange({
      preset: 'custom',
      from: sel?.from ? toIso(sel.from) : undefined,
      to: sel?.to ? toIso(sel.to) : undefined,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={range.preset} onValueChange={(v) => handlePreset(v as RangePreset)}>
        <SelectTrigger className="w-52">
          <SelectValue placeholder="Période" />
        </SelectTrigger>
        <SelectContent>
          {RANGE_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {range.preset === 'custom' && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="justify-start gap-2 font-normal"
            >
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {range.from && range.to
                ? `${format(fromIso(range.from), 'dd/MM/yyyy')} — ${format(fromIso(range.to), 'dd/MM/yyyy')}`
                : 'Choisir la période…'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="space-y-2 p-3">
              <Calendar
                mode="range"
                selected={selected}
                onSelect={handleRange}
                numberOfMonths={1}
                defaultMonth={range.from ? fromIso(range.from) : undefined}
                initialFocus
              />
              <div className="flex items-center justify-between border-t border-border pt-2">
                <p className="text-xs text-muted-foreground">
                  {selected?.from && selected?.to
                    ? `${format(selected.from, 'dd/MM/yyyy')} → ${format(selected.to, 'dd/MM/yyyy')}`
                    : 'Sélectionnez une période'}
                </p>
                {(range.from || range.to) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    onClick={() => handleRange(undefined)}
                  >
                    <X className="h-3 w-3" />
                    Effacer
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}