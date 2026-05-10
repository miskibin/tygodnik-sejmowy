"use client";

import { PERSONAS, PERSONA_IDS, type PersonaId } from "@/lib/personas";
import { useProfile } from "@/lib/profile";

export function PersonaSwitcher() {
  const { personas, district, setPersonas } = useProfile();

  const toggle = (id: PersonaId) => {
    setPersonas(personas.includes(id) ? personas.filter((x) => x !== id) : [...personas, id]);
  };

  return (
    <div className="flex items-center gap-3 md:gap-6 flex-wrap font-sans text-xs px-4 md:px-8 lg:px-14 py-3.5 bg-muted border-b border-border">
      <span className="text-muted-foreground tracking-[0.1em] uppercase text-[10px]">Twój profil</span>
      {district && (
        <>
          <span className="flex items-center gap-1.5 text-secondary-foreground">
            <span className="w-1.5 h-1.5 bg-destructive rounded-full" />
            Okręg {district.num} · {district.name}
          </span>
          <span className="text-border">·</span>
        </>
      )}
      <span className="text-muted-foreground text-[11px]">Sytuacja:</span>
      <div className="flex gap-1.5 flex-wrap">
        {PERSONA_IDS.map((id) => {
          const on = personas.includes(id);
          const p = PERSONAS[id];
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
              <span style={{ color: p.color, opacity: on ? 1 : 0.7 }}>{p.icon}</span>
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
