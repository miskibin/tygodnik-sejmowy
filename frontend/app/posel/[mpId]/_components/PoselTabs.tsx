"use client";

import type { ReactNode } from "react";
import { TabStrip, type TabStripItem } from "@/components/chrome/TabStrip";

export function PoselTabs({
  tabs,
  panels,
  initialTabId,
}: {
  tabs: TabStripItem[];
  panels: Record<string, ReactNode>;
  initialTabId?: string;
}) {
  return (
    <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 border-t border-border pt-4 md:pt-6 min-w-0">
      <TabStrip
        tabs={tabs}
        panels={panels}
        edgeBleedClass="-mx-4 md:-mx-8 lg:-mx-14"
        edgePadClass="px-4 md:px-8 lg:px-14"
        panelClassName="py-6 md:py-8 min-w-0"
        initialTabId={initialTabId}
      />
    </div>
  );
}
