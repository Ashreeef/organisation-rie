// Formatting utilities for display.

export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}

export function formatDZD(n: number): string {
  return `${n.toLocaleString('fr-FR')} DZD`;
}

export function formatPercent(n: number, decimals = 1): string {
  return `${n.toFixed(decimals).replace('.', ',')}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
