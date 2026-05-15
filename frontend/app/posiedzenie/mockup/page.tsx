// Mockup orchestrator for /posiedzenie/mockup. Client component because
// DayTabs / PorzadekObrad / TwojeSprawy share an activeDay state.
// All data flows from data.ts — no Supabase access on this route.

"use client";

import { useState } from "react";
import Link from "next/link";
import { PageBreadcrumb } from "@/components/chrome/PageBreadcrumb";
import { MOCK } from "./data";
import { Hero } from "./_components/Hero";
import { DayHeadline } from "./_components/DayHeadline";
import { MomentOfDay } from "./_components/MomentOfDay";
import { WhatPassed } from "./_components/WhatPassed";
import { DayTimeline } from "./_components/DayTimeline";
import { AgendaList } from "./_components/AgendaList";
import { TopQuotes } from "./_components/TopQuotes";
import { YourTopics } from "./_components/YourTopics";
import { TopSpeakers } from "./_components/TopSpeakers";
import { Friction } from "./_components/Friction";
import { Tomorrow } from "./_components/Tomorrow";
import { Sources } from "./_components/Sources";

export default function ProceedingMockupPage() {
  // Default to the "live" day (index 1) so the live cursor on OsDnia is visible.
  const liveIdx = MOCK.days.findIndex((d) => d.status === "live");
  const [activeDay, setActiveDay] = useState<number>(
    liveIdx >= 0 ? liveIdx : 0,
  );
  const day = MOCK.days[activeDay];

  return (
    <main className="bg-background font-serif text-foreground">
      <div className="max-w-[1280px] mx-auto px-4 md:px-8 pt-5">
        <PageBreadcrumb
          items={[
            { label: "Tygodnik", href: "/tygodnik" },
            { label: "Posiedzenia", href: "/tygodnik" },
            {
              label: `X kadencja, posiedzenie nr ${MOCK.number}`,
            },
          ]}
        />
      </div>

      <Hero activeDay={activeDay} setActiveDay={setActiveDay} />
      <DayHeadline day={day} />
      <MomentOfDay />
      <WhatPassed activeDay={activeDay} />
      <DayTimeline activeDay={activeDay} />
      <AgendaList />
      <TopQuotes />
      <YourTopics />
      <TopSpeakers />
      <Friction />
      <Tomorrow />
      <Sources />
    </main>
  );
}
