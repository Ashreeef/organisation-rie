'use client';

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  ChefHat,
  UtensilsCrossed,
  Package,
  Recycle,
  History,
  TrendingUp,
  Banknote,
  Settings,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { navSections } from '@/lib/navigation';
import { Button } from '@/components/ui/button';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  ChefHat,
  UtensilsCrossed,
  Package,
  Recycle,
  History,
  TrendingUp,
  Banknote,
  Settings,
};

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card transition-[width] duration-200',
        collapsed ? 'w-[68px]' : 'w-[260px]'
      )}
    >
      {/* Brand header */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#0d8f6b] ring-1 ring-black/5">
          <Image
            src="/images/bnp-logo-mark.png"
            alt="BNP Paribas logo"
            width={36}
            height={36}
            className="h-full w-full object-cover"
            priority
          />
        </div>
        {!collapsed && (
          <div className="min-w-0 animate-fade-in">
            <p className="truncate text-sm font-semibold leading-tight text-foreground">
              RIE Intelligence
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              BNP Paribas El Djazaïr
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin px-3 py-4">
        {navSections.map((section) => (
          <div key={section.title} className="mb-5">
            {!collapsed && (
              <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {section.title}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = iconMap[item.icon];
                const active =
                  pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                      collapsed && 'justify-center'
                    )}
                  >
                    {Icon && <Icon className="h-4 w-4 shrink-0" />}
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile */}
      <div className="border-t border-border p-3">
        <div
          className={cn(
            'flex items-center gap-3 rounded-md px-2 py-2',
            collapsed && 'justify-center'
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            OO
          </div>
          {!collapsed && (
            <div className="min-w-0 animate-fade-in">
              <p className="truncate text-sm font-medium text-foreground">
                BERBAOUI Ashref
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Gestionnaire RIE · Siège — Alger
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <div className="mt-2 flex items-center gap-2 px-2">
            <span className="h-2 w-2 rounded-full bg-success animate-pulse-soft" />
            <span className="text-[11px] text-muted-foreground">
              Système opérationnel
            </span>
          </div>
        )}
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="w-full justify-center text-muted-foreground"
        >
          <ChevronLeft
            className={cn(
              'h-4 w-4 transition-transform',
              collapsed && 'rotate-180'
            )}
          />
          {!collapsed && <span className="ml-2">Réduire</span>}
        </Button>
      </div>
    </aside>
  );
}
