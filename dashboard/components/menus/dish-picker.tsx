'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, SearchX } from 'lucide-react';

export interface DishPickerOption {
  id: string;
  name: string;
  categoryLabel: string;
  categoryColor?: string;
  /** Bandes de ratio attendu (badge) — optionnel pour les accompagnements. */
  ratioEffect?: 'très élevé' | 'élevé' | 'moyen' | 'faible';
  typicalRatio?: number;
}

interface DishPickerProps {
  options: DishPickerOption[];
  groups: { id: string; label: string; color?: string }[];
  value?: string; // valeur libre saisie (texte)
  dishId?: string; // id canonique sélectionné
  onSelect: (option: DishPickerOption | null) => void;
  onTextChange: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const RATIO_BADGE_STYLE: Record<string, string> = {
  'très élevé': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  élevé: 'bg-green-100 text-green-700 border-green-200',
  moyen: 'bg-amber-100 text-amber-700 border-amber-200',
  faible: 'bg-sky-100 text-sky-700 border-sky-200',
};

/**
 * Sélecteur de plat recherche/groupé, alimenté par le catalogue canonique
 * (menu-catalog.ts). L'utilisateur peut taper un texte libre OU choisir un
 * plat canonique (id) ; le badge indique la bande de ratio attendue.
 */
export function DishPicker({
  options,
  groups,
  value,
  dishId,
  onSelect,
  onTextChange,
  placeholder,
  disabled,
  className,
}: DishPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const selected = options.find((o) => o.id === dishId) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.categoryLabel.toLowerCase().includes(q),
    );
  }, [options, query]);

  const grouped = React.useMemo(() => {
    const map = new Map<string, DishPickerOption[]>();
    for (const o of filtered) {
      const key = o.categoryLabel;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return map;
  }, [filtered]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'h-9 w-full justify-between font-normal',
            !selected && !value && 'text-muted-foreground',
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: selected.categoryColor ?? '#94a3b8' }}
                />
                <span className="truncate">{selected.name}</span>
                {selected.ratioEffect && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 px-1.5 py-0 text-[10px] font-medium',
                      RATIO_BADGE_STYLE[selected.ratioEffect],
                    )}
                  >
                    {selected.ratioEffect}
                  </Badge>
                )}
              </>
            ) : value ? (
              <span className="truncate">{value}</span>
            ) : (
              <span>{placeholder ?? 'Sélectionner…'}</span>
            )}
          </span>
          <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Rechercher un plat…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <SearchX className="h-4 w-4" /> Aucun plat ne correspond
            </CommandEmpty>
            {groups.map((g) => {
              const items = grouped.get(g.label);
              if (!items || items.length === 0) return null;
              return (
                <CommandGroup key={g.id} heading={g.label}>
                  {items.map((o) => (
                    <CommandItem
                      key={o.id}
                      value={o.id}
                      onSelect={() => {
                        onSelect(o);
                        onTextChange(o.name);
                        setOpen(false);
                        setQuery('');
                      }}
                      className="flex items-center gap-2"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: o.categoryColor ?? '#94a3b8' }}
                      />
                      <span className="flex-1 truncate">{o.name}</span>
                      {o.ratioEffect && (
                        <Badge
                          variant="outline"
                          className={cn(
                            'shrink-0 px-1.5 py-0 text-[10px] font-medium',
                            RATIO_BADGE_STYLE[o.ratioEffect],
                          )}
                        >
                          {o.ratioEffect}
                        </Badge>
                      )}
                      {dishId === o.id && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
