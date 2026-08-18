'use client';

import * as React from 'react';
import { Bell, RefreshCw, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  title: string;
  description: string;
}

export function Header({ title, description }: HeaderProps) {
  const today = new Date();
  const dateStr = today.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

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

        {/* Language selector */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <span className="sr-only">Langue</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>FR / EN</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Sync status */}
        <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 md:flex">
          <span className="h-2 w-2 rounded-full bg-success" />
          <span className="text-xs text-muted-foreground">
            Sources synchronisées — il y a 12 min
          </span>
        </div>

        {/* Notifications */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="relative h-9 w-9">
                <Bell className="h-4 w-4 text-muted-foreground" />
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
                <span className="sr-only">Notifications</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>5 alertes opérationnelles</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Avatar */}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          BA
        </div>
      </div>
    </header>
  );
}
