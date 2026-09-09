"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useProfile } from "@/lib/profile";
import { PERSONAS, type PersonaId } from "@/lib/personas";
import { TOPICS, TOPIC_IDS, type TopicId } from "@/lib/topics";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

// Filter state lives in useProfile (localStorage). We additionally mirror it
// to URL query params (?topics=a,b&personas=x,y) so links are deep-shareable.
// On mount, URL wins over localStorage for that single hydration tick.

const PERSONA_KEYS = Object.keys(PERSONAS) as PersonaId[];

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set<string>(allowed);
  return raw.split(",").map((s) => s.trim()).filter((s) => set.has(s)) as T[];
}

function ChipRack({
  topics,
  personas,
  showPersonas,
  onToggleTopic,
  onTogglePersona,
  onToggleShowPersonas,
  hydrated,
  layout,
}: {
  topics: TopicId[];
  personas: PersonaId[];
  showPersonas: boolean;
  onToggleTopic: (id: TopicId) => void;
  onTogglePersona: (id: PersonaId) => void;
  onToggleShowPersonas: (v: boolean) => void;
  hydrated: boolean;
  layout: "inline" | "stacked";
}) {
  const stacked = layout === "stacked";
  return (
    <>
      <div className={stacked ? "" : "flex items-center gap-1.5 flex-wrap font-sans text-[12px]"}>
        {!stacked && (
          <span className="text-muted-foreground text-[11px] mr-1 font-medium">
            tematy:
          </span>
        )}
        {stacked && (
          <div className="text-[11px] text-muted-foreground mb-2.5 font-medium">
            tematy
          </div>
        )}
        <div className={stacked ? "flex flex-wrap gap-1.5 font-sans text-[13px]" : "contents"}>
          {TOPIC_IDS.map((id) => {
            const on = hydrated && topics.includes(id);
            const t = TOPICS[id];
            return (
              <button
                key={id}
                onClick={() => onToggleTopic(id)}
                aria-pressed={on}
                className="cursor-pointer rounded-full transition-all duration-150 inline-flex items-center gap-1.5"
                style={{
                  padding: stacked ? "5px 12px" : "3px 10px",
                  background: on ? "var(--primary)" : "transparent",
                  color: on ? "var(--primary-foreground)" : "var(--secondary-foreground)",
                  border: `1px solid ${on ? "var(--foreground)" : "var(--border)"}`,
                }}
              >
                <span style={{ color: on ? "var(--primary-foreground)" : t.color, opacity: 1 }}>
                  {t.icon}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={stacked ? "mt-5" : "mt-2.5"}>
        <button
          onClick={() => onToggleShowPersonas(!showPersonas)}
          aria-expanded={showPersonas}
          className="cursor-pointer font-sans text-[11px] text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          {showPersonas ? "▾" : "▸"} Filtry osobiste — kim jestem
          {!showPersonas && hydrated && personas.length > 0 && (
            <span className="ml-2 normal-case tracking-wide text-destructive">
              ({personas.length})
            </span>
          )}
        </button>
        {showPersonas && (
          <div
            className={
              stacked
                ? "mt-3 flex items-center gap-1.5 flex-wrap font-sans text-[13px]"
                : "mt-2 flex items-center gap-1.5 flex-wrap font-sans text-[12px]"
            }
          >
            {PERSONA_KEYS.map((id) => {
              const on = hydrated && personas.includes(id);
              const p = PERSONAS[id];
              return (
                <button
                  key={id}
                  onClick={() => onTogglePersona(id)}
                  aria-pressed={on}
                  className="cursor-pointer rounded-full transition-all duration-150 inline-flex items-center gap-1.5"
                  style={{
                    padding: stacked ? "5px 12px" : "3px 10px",
                    background: on ? "var(--primary)" : "transparent",
                    color: on ? "var(--primary-foreground)" : "var(--secondary-foreground)",
                    border: `1px solid ${on ? "var(--foreground)" : "var(--border)"}`,
                  }}
                >
                  <span style={{ color: on ? "var(--primary-foreground)" : p.color, opacity: 1 }}>
                    {p.icon}
                  </span>
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

export function FilterBar() {
  const {
    personas,
    topics,
    showPersonas,
    hydrated,
    setPersonas,
    setTopics,
    setShowPersonas,
  } = useProfile();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // URL → state hydration: on first load, if URL has filters and they differ
  // from localStorage, URL wins. Runs only once after hydration so we don't
  // fight subsequent local toggles.
  const urlHydrated = useRef(false);
  useEffect(() => {
    if (!hydrated) return;
    if (!urlHydrated.current) {
      urlHydrated.current = true;
      if (searchParams.has("topics") || searchParams.has("personas")) {
        setTopics(parseList<TopicId>(searchParams.get("topics"), TOPIC_IDS));
        const nextPersonas = parseList<PersonaId>(searchParams.get("personas"), PERSONA_KEYS);
        setPersonas(nextPersonas);
        if (nextPersonas.length) setShowPersonas(true);
        // Wait for the profile update before mirroring it back to the URL.
        return;
      }
    }
    // state → URL mirror, without scroll jumps or extra history entries.
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (topics.length > 0) params.set("topics", topics.join(","));
    else params.delete("topics");
    if (personas.length > 0) params.set("personas", personas.join(","));
    else params.delete("personas");
    const qs = params.toString();
    const next = qs ? `?${qs}` : window.location.pathname;
    if (next !== `${window.location.pathname}${window.location.search}` && next !== window.location.search) {
      window.history.replaceState(null, "", next);
    }
  }, [topics, personas, hydrated, searchParams, setTopics, setPersonas, setShowPersonas]);

  const togglePersona = (id: PersonaId) => {
    setPersonas(personas.includes(id) ? personas.filter((x) => x !== id) : [...personas, id]);
  };
  const toggleTopic = (id: TopicId) => {
    setTopics(topics.includes(id) ? topics.filter((x) => x !== id) : [...topics, id]);
  };
  const reset = () => {
    setTopics([]);
    setPersonas([]);
  };

  const activeCount = useMemo(
    () => (hydrated ? topics.length + personas.length : 0),
    [topics, personas, hydrated],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div>
        <DialogTrigger asChild>
        <button
          aria-expanded={open}
          aria-haspopup="dialog"
          className="cursor-pointer inline-flex items-center gap-2 py-2 font-sans text-[12px] text-secondary-foreground hover:text-foreground"
        >
          <span className="inline-flex items-center gap-2">
            <span className="text-destructive">⌕</span>
            {activeCount > 0 ? `Filtry (${activeCount})` : "Filtruj tematy"}
          </span>
          <span className="text-muted-foreground">▾</span>
        </button>
        </DialogTrigger>
      </div>

        <DialogContent
          className="bg-background text-foreground max-h-[85dvh] overflow-y-auto gap-0 p-0 md:max-w-xl max-md:left-0 max-md:top-auto max-md:bottom-0 max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-b-none"
        >
          <DialogHeader className="px-6 pt-6 pb-5 pr-12">
            <DialogTitle
              className="text-foreground"
              style={{ fontSize: 20 }}
            >
              {activeCount > 0 ? `Filtry (${activeCount})` : "Filtruj tematy"}
            </DialogTitle>
            <DialogDescription className="font-sans text-[12px] leading-relaxed text-muted-foreground">
              Wybierz tematy, które chcesz przeczytać. Bez filtrów zobaczysz całe wydanie.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-6">
            <ChipRack
              topics={topics}
              personas={personas}
              showPersonas={showPersonas}
              onToggleTopic={toggleTopic}
              onTogglePersona={togglePersona}
              onToggleShowPersonas={setShowPersonas}
              hydrated={hydrated}
              layout="stacked"
            />
          </div>

          <div className="sticky bottom-0 flex gap-3 border-t border-rule bg-background p-4">
            <button
              type="button"
              onClick={reset}
              disabled={activeCount === 0}
              className="flex-1 rounded-full border border-border bg-transparent px-4 py-2.5 font-sans text-[13px] text-secondary-foreground transition-colors disabled:opacity-40 enabled:cursor-pointer enabled:hover:border-destructive"
            >
              Resetuj
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 cursor-pointer rounded-full bg-destructive px-4 py-2.5 font-sans text-[13px] text-background transition-opacity hover:opacity-90"
            >
              Zastosuj
            </button>
          </div>
        </DialogContent>
    </Dialog>
  );
}
