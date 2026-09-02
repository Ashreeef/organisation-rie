import type { NavSection } from '@/lib/types';

export const navSections: NavSection[] = [
  {
    title: 'Principal',
    items: [
      {
        label: 'Accueil',
        href: '/dashboard',
        icon: 'Home',
        description: 'Assistant opérationnel du jour',
      },
      {
        label: 'Planifier les menus',
        href: '/menus-planner',
        icon: 'CalendarDays',
        description: 'Menus de la semaine (Dimanche - Jeudi)',
      },
      {
        label: 'Menus',
        href: '/menus',
        icon: 'UtensilsCrossed',
        description: 'Plats, catégories et menus',
      },
      {
        label: 'Gaspillage',
        href: '/waste',
        icon: 'Recycle',
        description: 'Saisie et suivi du gaspillage',
      },
      {
        label: 'Historique',
        href: '/history',
        icon: 'History',
        description: 'Tendances et performance passée',
      },
    ],
  },
  {
    title: 'Autre',
    items: [
      {
        label: 'Paramètres',
        href: '/settings',
        icon: 'Settings',
        description: 'Configuration de l’application',
      },
      {
        label: 'Équipe IA',
        href: '/admin/ai-team',
        icon: 'ShieldCheck',
        description: 'Monitoring technique du système',
      },
    ],
  },
];

export const allNavItems = navSections.flatMap((s) => s.items);
