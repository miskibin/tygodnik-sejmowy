// Client orchestrator for /posiedzenie/[number] and /posiedzenie/mockup.
// Owns the activeDay state shared by Hero / DayHeadline / WhatPassed /
// DayTimeline.

"use client";

import { useState } from "react";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import type { SittingView } from "./types";
import { Hero } from "./Hero";
import { DayHeadline } from "./DayHeadline";
import { MomentOfDay } from "./MomentOfDay";
import { WhatPassed } from "./WhatPassed";
import { DayTimeline } from "./DayTimeline";
import { AgendaList } from "./AgendaList";
import { TopQuotes } from "./TopQuotes";
import { YourTopics } from "./YourTopics";
import { TopSpeakers } from "./TopSpeakers";
import { Friction } from "./Friction";
import { Tomorrow } from "./Tomorrow";
import { Sources } from "./Sources";

export function SittingViewClient({ data }: { data: SittingView }) {
  // Default to the "live" day so the live cursor on the timeline is visible.
  // Falls back to the first day when no live day exists (past sittings).
  const liveIdx = data.days.findIndex((d) => d.status === "live");
  const [activeDay, setActiveDay] = useState<number>(
    liveIdx >= 0 ? liveIdx : 0,
  );
  const day = data.days[activeDay] ?? data.days[0] ?? null;

  return (
    <main className="bg-background font-serif text-foreground">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 pt-5">
        <PageBreadcrumb
          items={[
            { label: "Tygodnik", href: "/tygodnik" },
            { label: "Posiedzenia", href: "/posiedzenie" },
            {
              label: `X kadencja, posiedzenie nr ${data.number}`,
            },
          ]}
        />
      </div>

      <Hero data={data} activeDay={activeDay} setActiveDay={setActiveDay} />
      {day && <DayHeadline day={day} />}
      <MomentOfDay data={data} />
      <WhatPassed data={data} activeDay={activeDay} />
      <DayTimeline data={data} activeDay={activeDay} />
      <AgendaList data={data} />
      <TopQuotes data={data} />
      <YourTopics data={data} />
      <TopSpeakers data={data} />
      <Friction data={data} />
      <Tomorrow data={data} />
      <Sources data={data} />
    </main>
  );
}
