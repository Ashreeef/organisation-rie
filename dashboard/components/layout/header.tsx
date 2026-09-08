'use client';

import * as React from 'react';
import { Bell, CheckCheck, Inbox } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { api } from '@/lib/api';
import type { HolidayInfo } from '@/lib/types';
import { cn } from '@/lib/utils';

interface HeaderProps {
  title: string;
  description: string;
}

// Marque "vu" des alertes fériés (persistée localement, jamais une date codée).
const SEEN_KEY = 'rie.notifications.holidays.seen';

function formatHolidayDate(iso: string): string {
  // "2026-06-06" -> "6 juin" (fuseau local, pas d'off-by-one UTC).
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
  });
}

export function Header({ title, description }: HeaderProps) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const [freshness, setFreshness] = React.useState<string | null>(null);
  const [holidays, setHolidays] = React.useState<HolidayInfo[]>([]);
  const [seenKey, setSeenKey] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);

  // Données fraîches du backend (metrics) — poll 60 s.
  React.useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const m = await api.getModelMetrics();
        if (active) setFreshness(m.dataFreshness);
      } catch {
        if (active) setFreshness(null);
      }
    };
    refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, []);

  // Jours fériés algériens dans les 7 prochains jours — calculé dynamiquement
  // par le backend (calendrier unifié), jamais codé en dur.
  React.useEffect(() => {
    api
      .getUpcomingHolidays(7)
      .then((hs) => {
        // Un férié peut s'étaler sur plusieurs jours ("Eid al-Adha Holiday") :
        // on n'affiche qu'une ligne par fête, au premier jour de la fenêtre.
        const byName = new Map<string, HolidayInfo>();
        for (const h of hs) if (!byName.has(h.name)) byName.set(h.name, h);
        setHolidays(
          Array.from(byName.values()).sort((a, b) => a.date.localeCompare(b.date))
        );
        setSeenKey(localStorage.getItem(SEEN_KEY));
      })
      .catch(() => { /* backend indisponible : pas d'alerte */ });
  }, []);

  // Clé stable du jeu actuel d'alertes (jamais vue ? -> point rouge).
  const currentKey = holidays.length
    ? holidays.map((h) => `${h.date}|${h.name}`).join(';;')
    : '';

  const unread = currentKey.length > 0 && seenKey !== currentKey;

  const markSeen = () => {
    localStorage.setItem(SEEN_KEY, currentKey);
    setSeenKey(currentKey);
  };

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-6">
      {/* Left: page title */}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold leading-tight text-foreground">
          {title}
        </h1>
        <p className="truncate text-xs text-muted-foreground">{description}</p>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-3">
        {/* Date */}
        <div className="hidden items-center text-sm text-muted-foreground lg:flex">
          <span className="capitalize">{dateStr}</span>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Sync status */}
        <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 md:flex">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="text-xs text-muted-foreground">
            Sources synchronisées{ freshness ? ` — ${freshness}` : '' }
          </span>
        </div>

        {/* Notifications */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifications">
              <Bell className="h-4 w-4 text-muted-foreground" />
              {/* Point rouge uniquement si non consulté — jamais de badge. */}
              <span
                className={cn(
                  'absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive transition-opacity',
                  unread ? 'opacity-100' : 'opacity-0'
                )}
              />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold text-foreground">Notifications</p>
              <p className="text-xs text-muted-foreground">
                Jours fériés dans les 7 prochains jours
              </p>
            </div>

            {holidays.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Aucun jour férié dans les 7 prochains jours
                </p>
              </div>
            ) : (
              <>
                <ul className="max-h-72 overflow-y-auto py-1">
                  {holidays.map((h) => (
                    <li
                      key={h.date}
                      className="flex items-start gap-3 px-4 py-2.5 hover:bg-accent/50"
                    >
                      <span className="mt-0.5 text-base">📅</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{h.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Le {formatHolidayDate(h.date)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-muted-foreground"
                    onClick={markSeen}
                  >
                    <CheckCheck className="mr-2 h-4 w-4" />
                    Marquer comme vu
                  </Button>
                </div>
              </>
            )}
          </PopoverContent>
        </Popover>

        {/* Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          MX
        </div>
      </div>
    </header>
  );
}