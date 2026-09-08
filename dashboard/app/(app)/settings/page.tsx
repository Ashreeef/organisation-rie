'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SectionHeader } from '@/components/shared/section-header';
import { Building2, Bell, ShieldCheck, Save, Clock, UtensilsCrossed, Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { api } from '@/lib/api';

const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const LOCAL_KEYS = {
  notifications: 'rie.notifications',
  autoSync: 'rie.auto-sync',
};

function loadLocal(key: string, fallback: boolean): boolean {
  const v = localStorage.getItem(key);
  return v === null ? fallback : v === '1';
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [siteName, setSiteName] = React.useState('Siège — Alger');
  const [notifications, setNotifications] = React.useState(true);
  const [autoSync, setAutoSync] = React.useState(true);
  const [marginInput, setMarginInput] = React.useState('4');
  const [serviceStart, setServiceStart] = React.useState('12:30');
  const [serviceEnd, setServiceEnd] = React.useState('13:30');
  const [bilanDeadline, setBilanDeadline] = React.useState('15:00');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setNotifications(loadLocal(LOCAL_KEYS.notifications, true));
    setAutoSync(loadLocal(LOCAL_KEYS.autoSync, true));
    api
      .getSettings()
      .then((s) => {
        setSiteName(s.siteName ?? 'Siège — Alger');
        setMarginInput(String(s.safetyMarginPct));
        setServiceStart(s.serviceStart);
        setServiceEnd(s.serviceEnd);
        setBilanDeadline(s.bilanDeadline);
      })
      .catch(() => {
        // Serveur indisponible : on conserve les valeurs par défaut.
      })
      .finally(() => setLoading(false));
  }, []);

  const resolvedTheme = theme ?? 'system';
  const ThemeIcon = THEME_ICONS[resolvedTheme as keyof typeof THEME_ICONS] ?? Monitor;

  const handleSave = async () => {
    setSaving(true);
    try {
      const margin = Math.min(25, Math.max(0, parseFloat(marginInput.replace(',', '.')) || 0));
      await api.updateSettings({
        siteName,
        safetyMarginPct: margin,
        serviceStart,
        serviceEnd,
        bilanDeadline,
      });
      localStorage.setItem(LOCAL_KEYS.notifications, notifications ? '1' : '0');
      localStorage.setItem(LOCAL_KEYS.autoSync, autoSync ? '1' : '0');
      toast.success('Paramètres enregistrés');
    } catch {
      toast.error("Impossible d'enregistrer les paramètres");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Site info */}
      <Card className="p-6">
        <SectionHeader
          title="Informations du site"
          description="Configuration du restaurant inter-entreprises"
        />
        <div className="mt-4 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <Label htmlFor="site-name">Nom du site</Label>
            <Input
              id="site-name"
              value={siteName}
              onChange={(e) => setSiteName(e.target.value)}
              className="mt-1 max-w-md"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Affiché dans la barre latérale, sous le profil gestionnaire.
            </p>
          </div>
        </div>
      </Card>

      {/* Prévisions & repas */}
      <Card className="p-6">
        <SectionHeader
          title="Prévisions & repas"
          description="Réglages métier appliqués au calcul des quantités"
        />
        <div className="mt-4 max-w-md">
          <Label htmlFor="safety-margin" className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-muted-foreground" />
            Marge de sécurité (%)
          </Label>
          <Input
            id="safety-margin"
            type="number"
            inputMode="decimal"
            min={0}
            max={25}
            step={0.5}
            value={marginInput}
            onChange={(e) => setMarginInput(e.target.value)}
            className="mt-1"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Repas préparés en plus de la prévision (défaut 4&nbsp;%). Pilote
            directement la recommandation du jour.
          </p>
        </div>
      </Card>

      {/* Horaire du service */}
      <Card className="p-6">
        <SectionHeader
          title="Horaire du service"
          description="Fenêtre de service et limite de saisie du bilan"
        />
        <div className="mt-4 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="service-start" className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span>Début</span>
            </Label>
            <Input
              id="service-start"
              type="time"
              value={serviceStart}
              onChange={(e) => setServiceStart(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="service-end" className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground opacity-0" />
              <span>Fin</span>
            </Label>
            <Input
              id="service-end"
              type="time"
              value={serviceEnd}
              onChange={(e) => setServiceEnd(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="bilan-deadline" className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground opacity-0" />
              <span>Clôture bilan</span>
            </Label>
            <Input
              id="bilan-deadline"
              type="time"
              value={bilanDeadline}
              onChange={(e) => setBilanDeadline(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>
      </Card>

      {/* Préférences */}
      <Card className="p-6">
        <SectionHeader
          title="Préférences"
          description="Personnalisation de l'application"
        />
        <div className="mt-4 space-y-5">
          {/* Theme */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ThemeIcon className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Thème</p>
                <p className="text-xs text-muted-foreground">Apparence de l’interface</p>
              </div>
            </div>
            <Select value={resolvedTheme} onValueChange={setTheme}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Clair</SelectItem>
                <SelectItem value="dark">Sombre</SelectItem>
                <SelectItem value="system">Système</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notifications */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Notifications</p>
                <p className="text-xs text-muted-foreground">Alertes opérationnelles</p>
              </div>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>

          {/* Auto sync */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Synchronisation automatique</p>
                <p className="text-xs text-muted-foreground">Mise à jour des données toutes les 15 min</p>
              </div>
            </div>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </div>
        </div>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={loading || saving}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
        </Button>
      </div>
    </div>
  );
}