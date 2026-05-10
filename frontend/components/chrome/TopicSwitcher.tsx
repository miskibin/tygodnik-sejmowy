"use client";

import { TOPICS, TOPIC_IDS, type TopicId } from "@/lib/topics";
import { useProfile } from "@/lib/profile";

// Primary chip row on the homepage. Mirrors PersonaSwitcher.tsx UI but
// drives the topic filter (lib/topics.ts) instead of the persona filter.
export function TopicSwitcher() {
  const { topics, district, setTopics } = useProfile();

  const toggle = (id: TopicId) => {
    setTopics(topics.includes(id) ? topics.filter((x) => x !== id) : [...topics, id]);
  };

  return (
    <div className="flex items-center gap-3 md:gap-6 flex-wrap font-sans text-xs px-4 md:px-8 lg:px-14 py-3.5 bg-muted border-b border-border">
      <span className="text-muted-foreground tracking-[0.1em] uppercase text-[10px]">Tematy</span>
      {district && (
        <>
          <span className="flex items-center gap-1.5 text-secondary-foreground">
            <span className="w-1.5 h-1.5 bg-destructive rounded-full" />
            Okręg {district.num} · {district.name}
          </span>
          <span className="text-border">·</span>
        </>
      )}
      <span className="text-muted-foreground text-[11px]">Czego dotyczy:</span>
      <div className="flex gap-1.5 flex-wrap">
        {TOPIC_IDS.map((id) => {
          const on = topics.includes(id);
          const t = TOPICS[id];
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className="cursor-pointer rounded-full text-xs transition-all duration-150 flex items-center gap-1.5"
              style={{
                padding: "4px 10px",
                background: on ? "var(--foreground)" : "transparent",
                color: on ? "var(--background)" : "var(--secondary-foreground)",
                border: `1px solid ${on ? "var(--foreground)" : "var(--border)"}`,
              }}
            >
              <span style={{ color: on ? "var(--background)" : t.color, opacity: on ? 0.85 : 0.7 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
