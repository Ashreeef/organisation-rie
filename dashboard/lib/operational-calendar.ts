// Calendrier opérationnel RIE (frontend) — source unique de vérité (côté client).
//
// Miroir du module backend `src/operational_calendar.py`. La restauration
// fonctionne de DIMANCHE à JEUDI ; vendredi et samedi sont non travaillés.
// La « prochaine journée de service » après un jeudi est donc le dimanche
// suivant (et jamais vendredi/samedi).
//
// Convention de jours (getDay() JS) : Dimanche=0, Lundi=1, ..., Samedi=6.
// Jours opérationnels : 0, 1, 2, 3, 4 (Dimanche -> Jeudi).

export interface OperationalWeekday {
  dow: number;
  label: string;
  shortLabel: string;
}

// Ordre réel de la semaine locale BNP : Dimanche → Jeudi
export const OPERATIONAL_WEEKDAYS: OperationalWeekday[] = [
  { dow: 0, label: 'Dimanche', shortLabel: 'Dim' },
  { dow: 1, label: 'Lundi', shortLabel: 'Lun' },
  { dow: 2, label: 'Mardi', shortLabel: 'Mar' },
  { dow: 3, label: 'Mercredi', shortLabel: 'Mer' },
  { dow: 4, label: 'Jeudi', shortLabel: 'Jeu' },
];

export const OPERATIONAL_DOWS = new Set(OPERATIONAL_WEEKDAYS.map((d) => d.dow)); // 0..4

/** Un jour (dow JS) est-il une journée de service ? (Dimanche -> Jeudi). */
export function isWorkdayDow(dow: number): boolean {
  return OPERATIONAL_DOWS.has(dow);
}

/** Libellé français du jour (ex. 'Dimanche'), ou vide si non opérationnel. */
export function dowLabel(dow: number): string {
  return OPERATIONAL_WEEKDAYS.find((w) => w.dow === dow)?.label ?? '';
}

/** Libellé court (ex. 'Dim'), ou vide si non opérationnel. */
export function dowShortLabel(dow: number): string {
  return OPERATIONAL_WEEKDAYS.find((w) => w.dow === dow)?.shortLabel ?? '';
}

/** Date -> 'YYYY-MM-DD' (local). */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Début (00:00) du dimanche de la semaine opérationnelle contenant `from`. */
export function startOfOperationalWeek(from: Date): Date {
  const start = new Date(from);
  while (start.getDay() !== 0) {
    start.setDate(start.getDate() - 1);
  }
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Les 5 jours opérationnels (Dimanche → Jeudi) de la semaine contenant `from`. */
export function operationalWeekDays(from: Date, count = 5): Date[] {
  const out: Date[] = [];
  const cursor = new Date(from);
  while (cursor.getDay() !== 0) {
    cursor.setDate(cursor.getDate() - 1);
  }
  cursor.setHours(0, 0, 0, 0);
  while (out.length < count) {
    if (isWorkdayDow(cursor.getDay())) {
      out.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Prochaine journée de service après `from` — vendredi(5)/samedi(6) exclus. */
export function nextOperationalDay(from: Date): Date {
  const cursor = new Date(from);
  cursor.setDate(cursor.getDate() + 1);
  while (!isWorkdayDow(cursor.getDay())) {
    cursor.setDate(cursor.getDate() + 1);
  }
  cursor.setHours(0, 0, 0, 0);
  return cursor;
}
