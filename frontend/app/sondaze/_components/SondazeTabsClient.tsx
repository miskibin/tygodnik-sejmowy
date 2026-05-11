"use client";

import type { ReactNode } from "react";
import { TabStrip, type TabStripItem } from "@/components/chrome/TabStrip";

export type SondazeTab = TabStripItem;

export function SondazeTabsClient({
  tabs,
  panels,
}: {
  tabs: SondazeTab[];
  panels: Record<string, ReactNode>;
}) {
  return <TabStrip tabs={tabs} panels={panels} />;
}
