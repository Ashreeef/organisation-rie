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
import { Building2, Bell, Globe, ShieldCheck, Save } from 'lucide-react';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [siteName, setSiteName] = React.useState('Siège — Alger');
  const [language, setLanguage] = React.useState('fr');
  const [notifications, setNotifications] = React.useState(true);
  const [autoSync, setAutoSync] = React.useState(true);

  const handleSave = () => {
    toast.success('Paramètres enregistrés');
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
          </div>
        </div>
      </Card>

      {/* Preferences */}
      <Card className="p-6">
        <SectionHeader
          title="Préférences"
          description="Personnalisation de l'application"
        />
        <div className="mt-4 space-y-5">
          {/* Language */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Langue</p>
                <p className="text-xs text-muted-foreground">Langue d’interface</p>
              </div>
            </div>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="en">English</SelectItem>
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
        <Button onClick={handleSave}>
          <Save className="mr-2 h-4 w-4" />
          Enregistrer les paramètres
        </Button>
      </div>
    </div>
  );
}
