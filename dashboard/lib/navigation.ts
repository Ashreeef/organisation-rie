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
        label: 'Préparer demain',
        href: '/prepare',
        icon: 'ChefHat',
        description: 'Préparation du prochain service',
      },
      {
        label: 'Menus',
        href: '/menus',
        icon: 'UtensilsCrossed',
        description: 'Plats, catégories et menus',
      },
      {
        label: 'Approvisionnements',
        href: '/procurement',
        icon: 'Package',
        description: 'Ingrédients, stock et commandes',
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
    title: 'Management',
    items: [
      {
        label: 'Performance',
        href: '/performance',
        icon: 'TrendingUp',
        description: 'Vue d\u2019ensemble pour le management',
      },
      {
        label: '\u00c9conomies',
        href: '/savings',
        icon: 'Banknote',
        description: 'Impact financier et \u00e9conomies',
      },
    ],
  },
  {
    title: 'Autre',
    items: [
      {
        label: 'Param\u00e8tres',
        href: '/settings',
        icon: 'Settings',
        description: 'Configuration de l\u2019application',
      },
      {
        label: '\u00c9quipe IA',
        href: '/admin/ai-team',
        icon: 'ShieldCheck',
        description: 'Monitoring technique du syst\u00e8me',
      },
    ],
  },
];

export const allNavItems = navSections.flatMap((s) => s.items);
