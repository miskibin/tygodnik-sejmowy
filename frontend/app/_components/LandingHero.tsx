"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/profile";
import { PERSONAS, PERSONA_IDS, type PersonaId } from "@/lib/personas";
import { TOPICS, TOPIC_IDS, type TopicId } from "@/lib/topics";

export function LandingHero() {
  const router = useRouter();
  const {
    postcode,
    personas,
    topics,
    showPersonas,
    district,
    setPostcode,
    setPersonas,
    setTopics,
    setShowPersonas,
    setDistrict,
    hydrated,
  } = useProfile();
  const [lookupErr, setLookupErr] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    if (!postcode || postcode.length < 6) { setDistrict(null); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/postcode?p=${encodeURIComponent(postcode)}`, { signal: ctrl.signal });
        if (!r.ok) { setDistrict(null); setLookupErr(null); return; }
        const j = await r.json();
        if (j?.district) { setDistrict(j.district); setLookupErr(null); }
        else { setDistrict(null); }
      } catch (e) {
        if ((e as Error).name !== "AbortError") setLookupErr("nie udało się sprawdzić kodu");
      }
    }, 250);
    return () => { ctrl.abort(); clearTimeout(id); };
  }, [postcode, hydrated, setDistrict]);

  const togglePersona = (id: PersonaId) => {
    setPersonas(personas.includes(id) ? personas.filter((x) => x !== id) : [...personas, id]);
  };
  const toggleTopic = (id: TopicId) => {
    setTopics(topics.includes(id) ? topics.filter((x) => x !== id) : [...topics, id]);
  };

  return (
    <section className="px-4 md:px-8 lg:px-14 pt-10 md:pt-14 pb-12 md:pb-16 border-b border-rule">
      <div className="max-w-[1100px] mx-auto grid gap-10 md:gap-14 grid-cols-1 md:[grid-template-columns:1.1fr_1fr] items-center">
        {/* Left — pitch */}
        <div>
          <div className="font-sans text-[11px] tracking-[0.2em] uppercase text-destructive mb-4">
            ✶ tygodnik obywatelski
          </div>
          <h1
            className="font-medium tracking-[-0.035em] leading-[0.98] m-0 mb-5"
            style={{ fontSize: "clamp(2.25rem, 6.5vw, 4.25rem)", textWrap: "balance" }}
          >
            W piątek dowiesz się, co Sejm zmienił{" "}
            <span className="italic text-destructive">w Twoim życiu.</span>
          </h1>
          <p className="font-serif italic text-[15px] md:text-[17px] text-secondary-foreground leading-[1.55] m-0 mb-5 max-w-[520px]">
            Krótki list raz w&nbsp;tygodniu — bez tabel, bez slangu prawniczego, bez agitacji. Dopasowany do Twojego okręgu i&nbsp;sytuacji życiowej.
          </p>
          <div className="flex gap-4 font-mono text-[11px] text-muted-foreground tracking-wide">
            <span><strong className="text-foreground font-semibold">3 min</strong> czytania</span>
            <span className="text-border">·</span>
            <span><strong className="text-foreground font-semibold">5–7</strong> rzeczy</span>
            <span className="text-border">·</span>
            <span><strong className="text-foreground font-semibold">1×</strong> w&nbsp;tygodniu</span>
          </div>
        </div>

        {/* Right — entry form */}
        <div className="bg-muted border border-rule rounded-lg p-5 md:p-6">
          <label className="block">
            <div className="font-sans text-[10px] tracking-[0.16em] uppercase text-muted-foreground mb-2">
              Kod pocztowy
            </div>
            <div className="flex items-baseline gap-3 border-b border-rule pb-1.5 mb-1">
              <input
                value={postcode}
                onChange={(e) => setPostcode(e.target.value)}
                placeholder="00–000"
                className="font-serif text-[22px] font-medium border-0 outline-none flex-1 bg-transparent text-foreground min-w-0"
              />
              {district && (
                <span className="font-serif text-[13px] italic text-destructive truncate">
                  okręg <strong className="not-italic font-semibold">{district.num}</strong> · {district.name}
                </span>
              )}
              {!district && postcode.length >= 6 && !lookupErr && (
                <span className="font-mono text-[10px] text-muted-foreground">sprawdzam…</span>
              )}
              {lookupErr && (
                <span className="font-mono text-[10px] text-destructive">{lookupErr}</span>
              )}
            </div>
          </label>

          {/* Primary chip row — topical buckets ("Czego dotyczy"). Most
              Sejm legislation is institutional/topical (sądy, obrona, podatki),
              so this matches what's actually in the corpus. */}
          <div className="mt-5">
            <div className="flex justify-between items-baseline mb-2">
              <span className="font-sans text-[10px] tracking-[0.16em] uppercase text-muted-foreground">Czego dotyczy</span>
              <span className="font-mono text-[10px] tracking-wide" style={{ color: topics.length ? "var(--destructive)" : "var(--muted-foreground)" }}>
                {topics.length}/{TOPIC_IDS.length}
              </span>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {TOPIC_IDS.map((id) => {
                const on = topics.includes(id);
                const t = TOPICS[id];
                return (
                  <button
                    key={id}
                    onClick={() => toggleTopic(id)}
                    className="cursor-pointer font-sans text-[12.5px] rounded-full transition-all duration-150 inline-flex items-center gap-1.5"
                    style={{
                      padding: "5px 11px",
                      background: on ? "var(--foreground)" : "var(--background)",
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
            <div className="mt-1.5 font-sans text-[10.5px] italic text-muted-foreground">
              opcjonalnie — zaznacz tematy, które Cię interesują
            </div>
          </div>

          {/* Secondary chip row — "I am X" personas behind a toggle. The
              primary row is topic-first because most legislation doesn't
              neatly slot into a citizen persona; persona stays for users
              who want "what affects me as a kierowca/rolnik/etc.". */}
          <div className="mt-4">
            <button
              onClick={() => setShowPersonas(!showPersonas)}
              className="cursor-pointer font-sans text-[10.5px] tracking-[0.16em] uppercase text-muted-foreground hover:text-destructive transition-colors"
            >
              {showPersonas ? "▾" : "▸"} Filtry osobiste — kim jestem
              {!showPersonas && personas.length > 0 && (
                <span className="ml-2 normal-case tracking-wide text-destructive">({personas.length})</span>
              )}
            </button>
            {showPersonas && (
              <div className="mt-2">
                <div className="flex gap-1.5 flex-wrap">
                  {PERSONA_IDS.map((id) => {
                    const on = personas.includes(id);
                    const p = PERSONAS[id];
                    return (
                      <button
                        key={id}
                        onClick={() => togglePersona(id)}
                        className="cursor-pointer font-sans text-[12.5px] rounded-full transition-all duration-150 inline-flex items-center gap-1.5"
                        style={{
                          padding: "5px 11px",
                          background: on ? "var(--foreground)" : "var(--background)",
                          color: on ? "var(--background)" : "var(--secondary-foreground)",
                          border: `1px solid ${on ? "var(--foreground)" : "var(--border)"}`,
                        }}
                      >
                        <span style={{ color: on ? "var(--background)" : p.color, opacity: on ? 0.85 : 0.7 }}>{p.icon}</span>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 font-sans text-[10.5px] italic text-muted-foreground">
                  opcjonalnie — zaznacz wszystkie, które Cię dotyczą
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => router.push("/tygodnik")}
            className="mt-5 w-full text-center cursor-pointer bg-foreground text-background hover:bg-destructive transition-colors py-3 px-4 rounded-full font-sans text-[13.5px] tracking-wide"
          >
            Zobacz mój Tygodnik &nbsp;→
          </button>

          <div className="mt-3 font-sans text-[10.5px] text-muted-foreground tracking-wide text-center">
            Bez konta · Bez śledzenia · Profil zostaje na Twoim urządzeniu
          </div>
          <div className="mt-2 font-serif text-[12.5px] leading-[1.55] text-secondary-foreground text-center max-w-[34rem] mx-auto">
            Źródła publiczne. Przetwarzanie jawne. Każdy skrót da się sprawdzić u podstaw.
          </div>
        </div>
      </div>
    </section>
  );
}
