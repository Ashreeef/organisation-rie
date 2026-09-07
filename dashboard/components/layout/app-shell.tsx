'use client';

import * as React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { allNavItems } from '@/lib/navigation';
import { usePathname } from 'next/navigation';

function usePageMeta() {
  const pathname = usePathname();
  const item = allNavItems.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + '/')
  );
  return {
    title: item?.label ?? 'RIE Intelligence',
    description: item?.description ?? 'Plateforme opérationnelle RIE',
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const { title, description } = usePageMeta();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title} description={description} />
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          <div className="mx-auto max-w-[1400px] p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
