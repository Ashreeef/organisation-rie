'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WasteChart } from '@/components/shared/waste-chart';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { WasteDay, WasteSummary, WasteEntry } from '@/lib/types';
import { formatNumber, formatPercent, formatDate } from '@/lib/format';
import { TrendingDown, Save, Calendar, Smile, Meh, Frown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function WastePage() {
  const [wasteDays, setWasteDays] = React.useState<WasteDay[]>([]);
  const [summary, setSummary] = React.useState<WasteSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Form state
  const [date, setDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [prepared, setPrepared] = React.useState('');
  const [served, setServed] = React.useState('');
  const [menu, setMenu] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [dayRating, setDayRating] = React.useState<'good' | 'normal' | 'difficult' | ''>('');

  React.useEffect(() => {
    Promise.all([api.getWasteDays(), api.getWasteSummary()]).then(([w, s]) => {
      setWasteDays(w);
      setSummary(s);
      setLoading(false);
    });
  }, []);

  const preparedNum = Number(prepared) || 0;
  const servedNum = Number(served) || 0;
  const wastedCalc = Math.max(0, preparedNum - servedNum);
  const wasteRateCalc = preparedNum > 0 ? (wastedCalc / preparedNum) * 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (preparedNum === 0) {
      toast.error('Veuillez saisir le nombre de repas préparés.');
      return;
    }
    const entry: WasteEntry = {
      date,
      prepared: preparedNum,
      served: servedNum,
      remaining: 0,
      wasted: wastedCalc,
      wasteRate: Math.round(wasteRateCalc * 10) / 10,
      menu,
      comment,
    };
    api.submitWasteEntry(entry).then(() => {
      toast.success('Bilan du jour enregistré.');
      setPrepared('');
      setServed('');
      setComment('');
      setDayRating('');
    });
  };

  if (loading || !summary) return <Skeleton className="h-96 w-full rounded-lg" />;

  const ratingButtons = [
    { value: 'good', label: 'Très bien', icon: Smile, color: 'text-success' },
    { value: 'normal', label: 'Normal', icon: Meh, color: 'text-muted-foreground' },
    { value: 'difficult', label: 'Difficulté', icon: Frown, color: 'text-warning' },
  ] as const;

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs defaultValue="entry">
        <TabsList>
          <TabsTrigger value="entry">Bilan du jour</TabsTrigger>
          <TabsTrigger value="tracking">Suivi</TabsTrigger>
        </TabsList>

        {/* Daily entry — ultra simple */}
        <TabsContent value="entry">
          <Card className="max-w-2xl p-6">
            <SectionHeader
              title="Bilan du jour"
              description="Saisie rapide — moins de 30 secondes"
            />
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {/* Date */}
              <div className="space-y-2">
                <Label htmlFor="date" className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
              </div>

              {/* Menu */}
              <div className="space-y-2">
                <Label>Menu du jour</Label>
                <Select value={menu} onValueChange={setMenu}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionnez un menu" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Poulet rôti + Rechta">Poulet rôti + Rechta</SelectItem>
                    <SelectItem value="Couscous viande">Couscous viande</SelectItem>
                    <SelectItem value="Spaghetti bolognaise">Spaghetti bolognaise</SelectItem>
                    <SelectItem value="Tajine poulet">Tajine poulet</SelectItem>
                    <SelectItem value="Salade composée + poisson">Salade composée + poisson</SelectItem>
                    <SelectItem value="Chorba + bourek">Chorba + bourek</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Prepared / Served */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="prepared">Repas préparés</Label>
                  <Input
                    id="prepared"
                    type="number"
                    placeholder="330"
                    value={prepared}
                    onChange={(e) => setPrepared(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="served">Repas servis</Label>
                  <Input
                    id="served"
                    type="number"
                    placeholder="312"
                    value={served}
                    onChange={(e) => setServed(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Auto-calc preview */}
              {preparedNum > 0 && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Repas gaspillés</p>
                      <p className="mt-1 text-2xl font-bold text-destructive">
                        {wastedCalc}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Taux de gaspillage</p>
                      <p className="mt-1 text-2xl font-bold text-foreground">
                        {formatPercent(wasteRateCalc)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Day rating */}
              <div className="space-y-2">
                <Label>Comment s'est passée la journée ?</Label>
                <div className="flex gap-3">
                  {ratingButtons.map((btn) => {
                    const Icon = btn.icon;
                    return (
                      <button
                        key={btn.value}
                        type="button"
                        onClick={() => setDayRating(btn.value)}
                        className={cn(
                          'flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
                          dayRating === btn.value
                            ? 'border-primary bg-primary/5 text-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/30'
                        )}
                      >
                        <Icon className={cn('h-4 w-4', dayRating === btn.value && btn.color)} />
                        {btn.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Optional comment */}
              <div className="space-y-2">
                <Label htmlFor="comment">Commentaire (optionnel)</Label>
                <Textarea
                  id="comment"
                  placeholder="Observations éventuelles…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                />
              </div>

              <Button type="submit" size="lg" className="w-full">
                <Save className="mr-2 h-4 w-4" />
                Enregistrer le bilan
              </Button>
            </form>
          </Card>
        </TabsContent>

        {/* Tracking tab */}
        <TabsContent value="tracking" className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Repas préparés
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {formatNumber(summary.prepared)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Repas servis
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {formatNumber(summary.served)}
              </p>
            </Card>
            <Card className="p-5 border-destructive/20">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Repas gaspillés
              </p>
              <p className="mt-2 text-3xl font-semibold text-destructive">
                {formatNumber(summary.wasted)}
              </p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Taux de gaspillage
              </p>
              <p className="mt-2 text-3xl font-semibold text-foreground">
                {formatPercent(summary.wasteRate)}
              </p>
            </Card>
          </div>

          {/* Trend */}
          <div className="flex items-center gap-2 text-sm">
            <TrendingDown className="h-4 w-4 text-success" />
            <span className="font-medium text-success">{summary.trend.value}</span>
            <span className="text-muted-foreground">{summary.trend.label}</span>
          </div>

          {/* Chart */}
          <Card className="p-6">
            <SectionHeader
              title="Évolution du gaspillage"
              description="14 derniers jours ouvrés"
            />
            <div className="mt-4">
              <WasteChart data={wasteDays} />
            </div>
          </Card>

          {/* Recent entries */}
          <Card className="p-6">
            <SectionHeader
              title="Derniers bilans"
              description="Historique récent"
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Date</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Menu</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Préparés</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Servis</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Gaspillés</th>
                    <th className="pb-3 pr-4 font-medium text-muted-foreground">Taux</th>
                  </tr>
                </thead>
                <tbody>
                  {wasteDays.slice(-8).reverse().map((d) => (
                    <tr
                      key={d.date}
                      className="border-b border-border/50 transition-colors hover:bg-muted/30"
                    >
                      <td className="py-3 pr-4 capitalize text-foreground">
                        {formatDate(d.date)}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{d.menu}</td>
                      <td className="py-3 pr-4 text-foreground">{d.prepared}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{d.served}</td>
                      <td className="py-3 pr-4 font-medium text-destructive">{d.wasted}</td>
                      <td className="py-3 pr-4 text-muted-foreground">{d.wasteRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
