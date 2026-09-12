"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useProfile } from "@/lib/profile";
import { PERSONAS, PERSONA_IDS, type PersonaId } from "@/lib/personas";
import { TOPICS, TOPIC_IDS, type TopicId } from "@/lib/topics";

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="cursor-pointer font-sans text-[12.5px] rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-4 inline-flex items-center gap-1.5"
      style={{
        padding: "6px 12px",
        background: active ? "var(--foreground)" : "var(--background)",
        color: active ? "var(--background)" : "var(--secondary-foreground)",
        border: `1px solid ${active ? "var(--foreground)" : "var(--border)"}`,
      }}
    >
      {label}
    </button>
  );
}

export function PreferencesEditor() {
  const { topics, personas, setTopics, setPersonas } = useProfile();

  const readingHref = useMemo(() => {
    const query = new URLSearchParams();
    if (topics.length > 0) query.set("topics", topics.join(","));
    if (personas.length > 0) query.set("personas", personas.join(","));
    const encoded = query.toString();
    return encoded ? `/tygodnik?${encoded}` : "/tygodnik";
  }, [personas, topics]);

  const toggleTopic = (id: TopicId) => {
    setTopics(topics.includes(id) ? topics.filter((item) => item !== id) : [...topics, id]);
  };

  const togglePersona = (id: PersonaId) => {
    setPersonas(personas.includes(id) ? personas.filter((item) => item !== id) : [...personas, id]);
  };

  return (
    <div>
      <section aria-labelledby="topics-heading">
        <div className="flex justify-between items-baseline gap-3 mb-2">
          <div>
            <h2 id="topics-heading" className="font-sans text-[13px] font-medium m-0">
              Tematy
            </h2>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {TOPIC_IDS.map((id) => {
            const topic = TOPICS[id];
            return (
              <Chip
                key={id}
                active={topics.includes(id)}
                label={topic.label}
                onClick={() => toggleTopic(id)}
              />
            );
          })}
        </div>
      </section>

      <section aria-labelledby="personas-heading" className="mt-7 pt-6 border-t border-border">
        <div className="flex justify-between items-baseline gap-3 mb-2">
          <div>
            <h2 id="personas-heading" className="font-sans text-[13px] font-medium m-0">
              Kim jesteś
            </h2>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PERSONA_IDS.map((id) => {
            const persona = PERSONAS[id];
            return (
              <Chip
                key={id}
                active={personas.includes(id)}
                label={persona.label}
                onClick={() => togglePersona(id)}
              />
            );
          })}
        </div>
      </section>

      <p className="mt-7 mb-0 font-sans text-[11px] text-muted-foreground">
        Zapisane preferencje są używane po wybraniu „Czytaj wybrane tematy”.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Link
          href={readingHref}
          className="inline-flex justify-center items-center bg-foreground text-background hover:opacity-90 transition-opacity py-3 px-5 rounded-full font-sans text-[13px] tracking-wide"
        >
          Czytaj wybrane tematy&nbsp;→
        </Link>
        {(topics.length > 0 || personas.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setTopics([]);
              setPersonas([]);
            }}
            className="cursor-pointer font-sans text-[12px] text-muted-foreground hover:text-foreground transition-colors text-center"
          >
            Wyczyść wybór
          </button>
        )}
      </div>
    </div>
  );
}
