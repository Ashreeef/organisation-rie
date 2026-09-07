'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WasteChart } from '@/components/shared/waste-chart';
import { SectionHeader } from '@/components/shared/section-header';
import { api } from '@/lib/api';
import type { WasteDay, WasteSummary } from '@/lib/types';
import { formatNumber, formatPercent, formatDate } from '@/lib/format';
import { TrendingDown, ArrowRight, ClipboardCheck, Info } from 'lucide-react';

export default function WastePage() {
  const [wasteDays, setWasteDays] = React.useState<WasteDay[]>([]);
  const [summary, setSummary] = React.useState<WasteSummary | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([api.getWasteDays(), api.getWasteSummary()]).then(([w, s]) => {
      setWasteDays(w);
      setSummary(s);
      setLoading(false);
    });
  }, []);

  if (loading || !summary) return <Skeleton className="h-96 w-full rounded-lg" />;

  const hasData = summary.prepared > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <Tabs defaultValue="tracking">
        <TabsList>
          <TabsTrigger value="tracking">Suivi</TabsTrigger>
        </TabsList>

        <TabsContent value="tracking" className="space-y-6">
          {/* Redirect notice */}
          <Card className="flex items-center gap-4 p-5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <ClipboardCheck className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Saisir le bilan du jour
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Le bilan quotidien se saisit depuis l&apos;accueil, une fois le service terminé.
              </p>
            </div>
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Accueil
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </Card>

          {!hasData ? (
            /* No data yet */
            <Card className="flex flex-col items-center justify-center p-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                <Info className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-lg font-semibold text-foreground">Aucune donnée de gaspillage</p>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                Les données apparaîtront ici une fois que des bilans quotidiens auront été saisis
                depuis l&apos;accueil.
              </p>
            </Card>
          ) : (
            <>
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
              {wasteDays.length > 0 && (
                <Card className="p-6">
                  <SectionHeader
                    title="Évolution du gaspillage"
                    description={`${wasteDays.length} derniers jours`}
                  />
                  <div className="mt-4">
                    <WasteChart data={wasteDays} />
                  </div>
                </Card>
              )}

              {/* Recent entries */}
              {wasteDays.length > 0 && (
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
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
