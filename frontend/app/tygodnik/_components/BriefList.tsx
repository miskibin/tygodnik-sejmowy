"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useProfile } from "@/lib/profile";
import { PERSONAS, type PersonaId } from "@/lib/personas";
import { TOPICS, type TopicId } from "@/lib/topics";
import { personasImplyAnyTopic } from "@/lib/topic-persona-map";
import { Ornament } from "@/components/chrome/Ornament";
import { formatPopulation } from "@/lib/labels";
import { trackEventOncePerSession } from "@/lib/analytics";
import type { BriefItem } from "@/lib/db/prints";
import {
  partitionEvents,
  printEventToBriefItem,
  ACT_KIND_NEW_LAW,
  type SittingInfo,
  type WeeklyEvent,
} from "@/lib/events-types";
import { MPAvatar } from "@/components/tygodnik/MPAvatar";
import { CitationText } from "@/components/tygodnik/CitationLink";
import { VotingHemicycleCard } from "@/components/tygodnik/VotingHemicycleCard";
import { NumberedRow } from "@/components/tygodnik/NumberedRow";
import {
  CardTitle,
  StanceSponsorChip,
  ProcessStageBar,
  DotyczyCallout,
  KpiStrip,
  FooterLinks,
  AffectedGroups,
  CitizenAction,
  EliTimelineStrip,
  DelayStamp,
  VoteResultBar,
  type KpiSlot,
  type FooterLink,
} from "@/components/tygodnik/atoms";
import { FilterBar } from "./FilterBar";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateRange(first: string, last: string): string {
  if (!first) return "";
  const f = new Date(first);
  const l = last ? new Date(last) : f;
  const sameMonth = f.getMonth() === l.getMonth() && f.getFullYear() === l.getFullYear();
  const lastFmt = l.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  if (sameMonth) {
    if (f.getDate() === l.getDate()) return lastFmt;
    const monthYear = lastFmt.replace(/^\d+\s+/, "");
    return `${f.getDate()}–${l.getDate()} ${monthYear}`;
  }
  const firstFmt = f.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  return `${firstFmt} – ${lastFmt}`;
}

// Section label = first matched persona's category. Same logic as before;
// only relevant for print events.
function inferSection(personas: PersonaId[]): string | null {
  return personas[0] ? PERSONAS[personas[0]].section : null;
}

// Build a KpiSlot list for a print: bottom-line = highest-severity affected
// group's est_population; portfelu = nothing solid yet, omit. Returning [] so
// KpiStrip renders nothing — no padded zeroes.
function kpiSlotsForPrint(item: BriefItem): KpiSlot[] {
  const slots: KpiSlot[] = [];
  const top = [...item.affectedGroups]
    .filter((g) => g.estPopulation && g.estPopulation > 0)
    .sort((a, b) => (b.estPopulation ?? 0) - (a.estPopulation ?? 0))[0];
  if (top) {
    const pop = formatPopulation(top.estPopulation);
    if (pop) {
      const [value, ...unitParts] = pop.split(" ");
      slots.push({
        kicker: "BOTTOM LINE",
        value,
        unit: unitParts.join(" ") + " osób",
        sub: `dotkniętych: ${top.tag.replace(/-/g, " ")}`,
      });
    }
  }
  return slots;
}

function ItemView({ item, idx, personas }: { item: BriefItem; idx: number; personas: PersonaId[] }) {
  const [expanded, setExpanded] = useState(idx === 0);
  const isFirst = idx === 0;
  const matchedPersonas = item.personas.filter((p) => personas.includes(p));
  const sectionLabel = inferSection(item.personas);
  const sectionColor = item.personas[0] ? PERSONAS[item.personas[0]].color : "var(--destructive)";

  const personaPills = matchedPersonas.length > 0 ? (
    <div className="flex flex-wrap gap-1 mb-3">
      {matchedPersonas.map((p) => (
        <span
          key={p}
          className="text-[10px] rounded-full bg-muted border border-border"
          style={{ padding: "2px 7px", color: PERSONAS[p].color }}
        >
          {PERSONAS[p].icon} {PERSONAS[p].label}
        </span>
      ))}
    </div>
  ) : null;

  const links: FooterLink[] = [
    {
      href: "",
      label: expanded ? "zwiń ↑" : "czytaj dalej ↓",
      onClick: () => setExpanded((v) => !v),
      primary: true,
    },
    {
      href: `/druk/${item.term}/${item.number}`,
      label: "pełny tekst druku",
    },
  ];
  if (item.voting) {
    links.push({
      href: `/glosowanie/${item.voting.votingId}`,
      label: "wyniki głosowania",
    });
  }

  return (
    <NumberedRow
      idx={idx}
      indexSize={64}
      indexColor="var(--destructive)"
      pad="loose"
      kicker={
        sectionLabel ? (
          <span style={{ color: sectionColor }}>{sectionLabel}</span>
        ) : null
      }
      asideExtra={personaPills}
      meta={
        <>
          <div>druk <span className="text-foreground">{item.number}</span></div>
          <div>kadencja <span className="text-foreground">{item.term}</span></div>
          <div className="mt-1">{formatDate(item.changeDate)}</div>
        </>
      }
    >
      <CardTitle
        size={isFirst ? "hero" : "default"}
        subtitle={
          item.title && item.shortTitle && item.shortTitle !== item.title
            ? item.title
            : null
        }
      >
        {item.shortTitle || item.title}
      </CardTitle>

      <StanceSponsorChip
        stance={item.stance}
        stanceConfidence={item.stanceConfidence}
        sponsorAuthority={item.sponsorAuthority}
      />

      <ProcessStageBar
        currentStageType={item.currentStageType}
        processPassed={item.processPassed}
      />

      <DotyczyCallout size={isFirst ? "large" : "default"}>
        “<CitationText term={item.term}>{item.impactPunch}</CitationText>”
      </DotyczyCallout>

      {item.voting && <VoteResultBar result={item.voting} />}

      <KpiStrip slots={kpiSlotsForPrint(item)} />

      {expanded && item.summaryPlain && (
        <p
          className="font-serif text-secondary-foreground m-0 mb-4"
          style={{ fontSize: 17, lineHeight: 1.65, textWrap: "pretty" }}
        >
          <CitationText term={item.term}>{item.summaryPlain}</CitationText>
        </p>
      )}

      {expanded && <AffectedGroups groups={item.affectedGroups} />}

      <CitizenAction text={item.citizenAction} />

      <FooterLinks links={links} />
    </NumberedRow>
  );
}

// ---------- Section chrome ----------

function SectionHeader({ icon, label, count }: { icon: string; label: string; count: number }) {
  return (
    <div className="border-t border-rule pt-4 md:pt-8 pb-2 px-1">
      <div className="flex items-baseline gap-3">
        <span className="text-[18px] md:text-[22px]" style={{ color: "var(--destructive)" }}>{icon}</span>
        <h3 className="font-mono text-[10.5px] md:text-[11px] tracking-[0.18em] uppercase text-foreground m-0">
          {label}
        </h3>
        <span className="font-mono text-[10px] text-muted-foreground ml-auto">
          {count}
        </span>
      </div>
    </div>
  );
}

// ---------- ELI in-force card ----------

function EliCard({ ev, idx }: { ev: Extract<WeeklyEvent, { eventType: "eli_inforce" }>; idx: number }) {
  const a = ev.payload;
  const links: FooterLink[] = ev.sourceUrl
    ? [{ href: ev.sourceUrl, label: "tekst aktu w ISAP", external: true, primary: true }]
    : [];
  return (
    <NumberedRow
      idx={idx}
      meta={
        <>
          <div>{a.publisher} {a.year}/{a.position}</div>
          <div>od {formatDate(a.legal_status_date)}</div>
        </>
      }
    >
      <CardTitle
        subtitle={
          <span className="font-sans text-xs text-muted-foreground">
            {a.display_address && <span>{a.display_address} · </span>}
            <span>{a.type}</span>
          </span>
        }
      >
        {a.short_title || a.title}
      </CardTitle>

      <EliTimelineStrip
        announcementDate={a.announcement_date}
        promulgationDate={a.promulgation_date}
        legalStatusDate={a.legal_status_date}
      />

      {a.keywords && a.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {a.keywords.slice(0, 6).map((k) => (
            <span
              key={k}
              className="font-sans text-[10px] rounded-full bg-muted border border-border text-secondary-foreground"
              style={{ padding: "1px 8px" }}
            >
              {k}
            </span>
          ))}
        </div>
      )}

      <FooterLinks links={links} />
    </NumberedRow>
  );
}

// ---------- ELI in-force section split (citizen review #13) ----------
//
// "Wchodzi w życie" used to dump every act with legal_status_date in the
// sitting bucket — including teksty jednolite (consolidated republications)
// and assorted Obwieszczenia / postanowienia, which read as AI slop to
// citizens because they aren't new law.
//
// Behind NEXT_PUBLIC_FEATURE_ACT_KIND_FILTER we split the section in two:
//   "Wchodzi w życie"  → ustawa_nowa + nowelizacja
//   "Aktualizacje prawa" → tekst_jednolity + obwieszczenie + rozporzadzenie
//                          + uchwala_sejmu + inne
// Rows with act_kind=null (pre-backfill) keep the legacy behavior.

function EliInforceSections({
  events,
}: {
  events: Array<Extract<WeeklyEvent, { eventType: "eli_inforce" }>>;
}) {
  if (events.length === 0) return null;
  const flagOn = process.env.NEXT_PUBLIC_FEATURE_ACT_KIND_FILTER === "1";

  if (!flagOn) {
    return (
      <>
        <SectionHeader icon="⏱" label="Wchodzi w życie" count={events.length} />
        {events.map((ev, i) => <EliCard key={ev.payload.act_id} ev={ev} idx={i} />)}
      </>
    );
  }

  const newLaw: typeof events = [];
  const updates: typeof events = [];
  for (const ev of events) {
    const k = ev.payload.act_kind;
    if (k && ACT_KIND_NEW_LAW.has(k)) newLaw.push(ev);
    else updates.push(ev);
  }

  return (
    <>
      {newLaw.length > 0 && (
        <>
          <SectionHeader icon="⏱" label="Wchodzi w życie" count={newLaw.length} />
          {newLaw.map((ev, i) => <EliCard key={ev.payload.act_id} ev={ev} idx={i} />)}
        </>
      )}
      {updates.length > 0 && (
        <>
          <SectionHeader icon="📎" label="Aktualizacje prawa" count={updates.length} />
          {updates.map((ev, i) => <EliCard key={ev.payload.act_id} ev={ev} idx={i} />)}
        </>
      )}
    </>
  );
}

// ---------- Late interpellation card ----------

function InterpellationCard({ ev, idx }: { ev: Extract<WeeklyEvent, { eventType: "late_interpellation" }>; idx: number }) {
  const q = ev.payload;
  const recipient = q.recipient_titles?.[0] ?? "—";
  const primaryAuthor = q.authors?.[0] ?? null;
  const extraAuthors = (q.authors ?? []).slice(1);
  const kindLabel = q.kind === "interpellation" ? "interpelacja" : "zapytanie";
  const links: FooterLink[] = ev.sourceUrl
    ? [{ href: ev.sourceUrl, label: `treść ${kindLabel}`, external: true, primary: true }]
    : [];

  return (
    <NumberedRow
      idx={idx}
      // Hide the ordinal index — DelayStamp below is the visual hook.
      indexLabel={<DelayStamp days={q.answer_delayed_days} />}
      indexSize={0}
      meta={
        <>
          <div>{kindLabel} {q.num}</div>
          <div>wysłana {formatDate(q.sent_date)}</div>
        </>
      }
    >
      <CardTitle
        subtitle={
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-destructive font-medium">
            do: {recipient}
          </span>
        }
      >
        <CitationText term={ev.term}>{q.title}</CitationText>
      </CardTitle>
      {primaryAuthor && (
        <div className="mb-3 flex items-center gap-3 flex-wrap">
          <MPAvatar
            mpId={primaryAuthor.mp_id}
            name={primaryAuthor.first_last_name}
            photoUrl={primaryAuthor.photo_url}
            klub={primaryAuthor.klub}
            district={primaryAuthor.district}
            size={36}
          />
          {extraAuthors.length > 0 && (
            <span className="font-sans text-[11px] text-muted-foreground">
              + {extraAuthors.length} {extraAuthors.length === 1 ? "współautor" : "współautorów"}
            </span>
          )}
        </div>
      )}
      <FooterLinks links={links} />
    </NumberedRow>
  );
}

// ---------- Viral quote card ----------

function ViralCard({ ev, idx }: { ev: Extract<WeeklyEvent, { eventType: "viral_quote" }>; idx: number }) {
  const s = ev.payload;
  const links: FooterLink[] = [
    { href: `/mowa/${s.statement_id}`, label: "czytaj wypowiedź", primary: true },
  ];
  return (
    <NumberedRow
      idx={idx}
      asideExtra={
        <div className="mb-2">
          <MPAvatar
            mpId={s.mp_id}
            name={s.speaker_name}
            photoUrl={s.photo_url}
            klub={s.klub}
            district={s.district}
            size={48}
          />
        </div>
      }
      meta={
        <>
          {s.function && <div>{s.function}</div>}
          <div className="mt-1">{formatDate(s.date)}</div>
        </>
      }
    >
      {s.viral_quote && (
        <blockquote
          className="font-serif italic m-0 mb-4 relative"
          style={{
            fontSize: 22,
            lineHeight: 1.4,
            padding: "8px 0 8px 28px",
            textWrap: "pretty",
            borderLeft: "3px solid var(--destructive)",
          }}
        >
          {/* Oversized opening quote-mark — type-specific visual flourish. */}
          <span
            aria-hidden
            className="font-serif text-destructive absolute"
            style={{
              fontSize: 56,
              lineHeight: 0.8,
              left: 14,
              top: 4,
              opacity: 0.18,
              fontStyle: "normal",
            }}
          >
            “
          </span>
          <CitationText term={ev.term}>{s.viral_quote}</CitationText>
        </blockquote>
      )}
      {s.summary_one_line && (
        <div className="font-sans text-xs text-muted-foreground mb-2">
          <CitationText term={ev.term}>{s.summary_one_line}</CitationText>
        </div>
      )}
      <div className="flex flex-wrap gap-2 font-sans text-[10px] mb-1">
        {(s.topic_tags ?? []).slice(0, 3).map((t) => {
          const meta = (TOPICS as Record<string, { label: string; icon: string; color: string } | undefined>)[t];
          return (
            <span
              key={t}
              className="rounded-full border border-border"
              style={{ padding: "1px 8px", color: meta?.color ?? "var(--secondary-foreground)" }}
            >
              {meta?.icon} {meta?.label ?? t}
            </span>
          );
        })}
      </div>
      <FooterLinks links={links} />
    </NumberedRow>
  );
}

// ---------- Archive ----------

function ArchiveIndex({ sittings, currentSitting }: { sittings: SittingInfo[]; currentSitting: number }) {
  const populated = sittings.filter((s) => s.eventCount > 0);
  const [open, setOpen] = useState(false);
  if (populated.length <= 1) return null;
  const count = populated.length;
  const countLabel = count === 1 ? "posiedzenie" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 10 || count % 100 >= 20) ? "posiedzenia" : "posiedzeń";
  return (
    <div className="border-t border-border mt-2">
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 py-6">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
        >
          Archiwum · {count} {countLabel} {open ? "↑" : "↓"}
        </button>
        {open && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 mt-4">
            {populated.map((s) => {
              const isCurrent = s.sittingNum === currentSitting;
              const topicsLabel = s.topTopics
                .slice(0, 3)
                .map((t) => TOPICS[t]?.label)
                .filter(Boolean)
                .join(" · ");
              return (
                <Link
                  key={s.sittingNum}
                  href={`/tygodnik/p/${s.sittingNum}`}
                  className="block px-3 py-2 rounded border transition-colors"
                  style={{
                    borderColor: isCurrent ? "var(--destructive)" : "var(--border)",
                    background: isCurrent ? "var(--muted)" : "transparent",
                  }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-muted-foreground">Nr</span>
                    <span className="font-serif italic" style={{ fontSize: 18, color: isCurrent ? "var(--destructive)" : "var(--foreground)" }}>
                      {s.sittingNum}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground ml-auto">
                      {s.eventCount} {s.eventCount === 1 ? "wydarzenie" : s.eventCount < 5 ? "wydarzenia" : "wydarzeń"}
                    </span>
                  </div>
                  <div className="font-sans text-[11px] text-secondary-foreground mt-1 leading-tight">
                    {formatDateRange(s.firstDate, s.lastDate)}
                  </div>
                  {topicsLabel && (
                    <div className="font-sans text-[10px] text-muted-foreground mt-1 leading-tight truncate">
                      {topicsLabel}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- BriefList (main) ----------

export function BriefList({
  events,
  sitting,
  sittings,
}: {
  events: WeeklyEvent[];
  sitting: SittingInfo;
  sittings: SittingInfo[];
}) {
  const { personas, topics, hydrated } = useProfile();
  const [showAll, setShowAll] = useState(false);

  const partitioned = useMemo(() => partitionEvents(events), [events]);

  // Merge votes into prints: when a vote event links to a print already in the
  // feed, attach the voting summary to that print's BriefItem and drop the
  // separate "głosowania" card. Eliminates the duplicate item the user flagged
  // (same title + impact_punch shown twice). Only votes with no matching feed
  // print remain in their own section.
  const { printItems, unmergedVotes } = useMemo(() => {
    const items = partitioned.prints.map((ev) => printEventToBriefItem(ev));
    const itemByNumber = new Map<string, BriefItem>();
    for (const it of items) itemByNumber.set(it.number, it);

    const unmerged: Array<Extract<WeeklyEvent, { eventType: "vote" }>> = [];
    for (const v of partitioned.votes) {
      const linked = v.payload.linked_prints?.[0];
      const matchedItem = linked ? itemByNumber.get(linked.number) : undefined;
      if (matchedItem && !matchedItem.voting) {
        matchedItem.voting = {
          votingId: v.payload.voting_id,
          votingNumber: v.payload.voting_number,
          yes: v.payload.yes,
          no: v.payload.no,
          abstain: v.payload.abstain,
          notParticipating: v.payload.not_participating,
        };
      } else {
        unmerged.push(v);
      }
    }
    return { printItems: items, unmergedVotes: unmerged };
  }, [partitioned.prints, partitioned.votes]);

  // Filter chips apply ONLY to the print section. Other sections ignore them.
  // Topic chip selection also matches prints surfaced via persona_tags only —
  // see lib/topic-persona-map.ts (citizen review 2026-05-08).
  const filteredPrints = useMemo(() => {
    if (showAll || (topics.length === 0 && personas.length === 0)) return printItems;
    const topicSet = new Set<TopicId>(topics);
    return printItems.filter((it) => {
      const topicHit = topics.length > 0
        && (it.topics.some((t) => topicSet.has(t)) || personasImplyAnyTopic(it.personas, topicSet));
      const personaHit = personas.length > 0 && it.personas.some((p) => personas.includes(p));
      return topicHit || personaHit;
    });
  }, [printItems, topics, personas, showAll]);

  const filterActive = topics.length > 0 || personas.length > 0;

  useEffect(() => {
    if (!hydrated) return;
    trackEventOncePerSession("tsejm.analytics.tygodnik_first_view", "tygodnik_first_view", {
      filters_active: filterActive,
    });
  }, [hydrated, filterActive]);

  const sittingIdx = sittings.findIndex((s) => s.sittingNum === sitting.sittingNum);
  const newerSitting = sittingIdx > 0
    ? sittings.slice(0, sittingIdx).reverse().find((s) => s.eventCount > 0) ?? null
    : null;
  const olderSitting = sittingIdx >= 0
    ? sittings.slice(sittingIdx + 1).find((s) => s.eventCount > 0) ?? null
    : null;
  const dateRange = formatDateRange(sitting.firstDate, sitting.lastDate);

  const totalEvents = events.length;
  const lightWeek = totalEvents > 0 && totalEvents < 6;

  return (
    <div className="bg-background font-serif text-foreground">
      {/* Masthead */}
      <div className="border-b border-rule">
       <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-4 pb-3 md:pt-8 md:pb-5">
        <div className="flex items-baseline justify-between gap-3 md:gap-4 flex-wrap mb-1.5 md:mb-2.5">
          <h1
            className="font-serif font-medium m-0"
            style={{
              // Mobile clamp tightened so the H1 fits one line on 375px and
              // doesn't dominate the viewport. Desktop range matches PageHeading "lg".
              fontSize: "clamp(1.875rem, 5vw, 3.25rem)",
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
            }}
          >
            Twój<span className="italic text-destructive"> Tygodnik</span>
          </h1>
          <div className="font-mono text-[10.5px] md:text-[11px] text-muted-foreground tracking-wide">
            {partitioned.prints.length} {partitioned.prints.length === 1 ? "projekt" : "projektów"}
            {" · "}
            {partitioned.votes.length} {partitioned.votes.length === 1 ? "głosowanie" : "głosowań"}
            {" · "}
            {partitioned.viralQuotes.length} {partitioned.viralQuotes.length === 1 ? "wystąpienie" : "wystąpień"}
            {hydrated && filterActive && partitioned.prints.length > 0 && (
              // Desktop only — on mobile this CTA moves below the prints
              // section to free up above-the-fold real estate.
              <button
                onClick={() => setShowAll((v) => !v)}
                className="hidden md:inline ml-3 cursor-pointer text-destructive underline decoration-dotted underline-offset-4"
              >
                {showAll ? "✓ wszystkie projekty" : "pokaż wszystkie projekty"}
              </button>
            )}
          </div>
        </div>

        {lightWeek && (
          <div
            className="font-serif italic text-secondary-foreground mb-3"
            style={{ fontSize: 14, lineHeight: 1.55, textWrap: "pretty" }}
          >
            Tym razem to {totalEvents} {totalEvents === 1 ? "rzecz" : "rzeczy"}. W typowym tygodniu pojawia się od 5 do 20 rzeczy wartych przeczytania — żadnego wypełniacza.
          </div>
        )}

        {/* Issue band — single-line on mobile via smaller font + tighter gap */}
        <div className="flex items-baseline gap-2 md:gap-3 flex-wrap mb-2.5 md:mb-4 font-sans text-[11.5px] md:text-[12.5px]">
          {olderSitting ? (
            <Link
              href={`/tygodnik/p/${olderSitting.sittingNum}`}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title={`Posiedzenie ${olderSitting.sittingNum} · ${formatDateRange(olderSitting.firstDate, olderSitting.lastDate)}`}
            >
              ← Nr {olderSitting.sittingNum}
            </Link>
          ) : (
            <span className="text-border">← Nr —</span>
          )}
          <span className="text-foreground font-medium">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground mr-1.5 md:mr-2">Nr</span>
            <span
              className="font-serif italic text-destructive"
              style={{ fontSize: "clamp(15px, 4vw, 18px)" }}
            >
              {sitting.sittingNum}
            </span>
            <span className="text-muted-foreground mx-1.5 md:mx-2">·</span>
            <span className="text-secondary-foreground">{dateRange}</span>
          </span>
          {newerSitting ? (
            <Link
              href={`/tygodnik/p/${newerSitting.sittingNum}`}
              className="text-muted-foreground hover:text-destructive transition-colors"
              title={`Posiedzenie ${newerSitting.sittingNum} · ${formatDateRange(newerSitting.firstDate, newerSitting.lastDate)}`}
            >
              Nr {newerSitting.sittingNum} →
            </Link>
          ) : (
            <span className="text-border">Nr — →</span>
          )}
        </div>

        <FilterBar />
       </div>
      </div>

      {/* Sections */}
      <div className="px-4 md:px-8 lg:px-14 max-w-[1240px] mx-auto">
        {filteredPrints.length > 0 && (
          <>
            <SectionHeader icon="📜" label="Nowe projekty" count={filteredPrints.length} />
            {filteredPrints.map((it, i) => (
              <ItemView key={it.id} item={it} idx={i} personas={personas} />
            ))}
            {hydrated && filterActive && (
              // Mobile-only CTA — desktop has this inline next to the counter.
              <div className="md:hidden mt-2 mb-2 px-1 text-center">
                <button
                  onClick={() => setShowAll((v) => !v)}
                  className="cursor-pointer font-sans text-[12px] text-destructive underline decoration-dotted underline-offset-4"
                >
                  {showAll ? "✓ wszystkie projekty" : "pokaż wszystkie projekty"}
                </button>
              </div>
            )}
          </>
        )}

        {unmergedVotes.length > 0 && (
          <>
            <SectionHeader icon="⚖" label="Pozostałe głosowania" count={unmergedVotes.length} />
            {unmergedVotes.map((ev, i) => (
              <VotingHemicycleCard
                key={ev.payload.voting_id}
                idx={i}
                voting={{
                  voting_id: ev.payload.voting_id,
                  voting_number: ev.payload.voting_number,
                  title: ev.payload.title,
                  date: ev.payload.date,
                  yes: ev.payload.yes,
                  no: ev.payload.no,
                  abstain: ev.payload.abstain,
                  not_participating: ev.payload.not_participating,
                  term: ev.term,
                }}
                clubs={ev.payload.club_tally ?? []}
                linkedPrint={ev.payload.linked_prints?.[0] ? {
                  number: ev.payload.linked_prints[0].number,
                  short_title: ev.payload.linked_prints[0].short_title,
                  impact_punch: ev.payload.linked_prints[0].impact_punch ?? null,
                } : null}
              />
            ))}
          </>
        )}

        <EliInforceSections events={partitioned.eliInforce} />

        {partitioned.lateInterpellations.length > 0 && (
          <>
            <SectionHeader icon="🔥" label="Opóźnione odpowiedzi ministrów" count={partitioned.lateInterpellations.length} />
            {partitioned.lateInterpellations.map((ev, i) => <InterpellationCard key={ev.payload.question_id} ev={ev} idx={i} />)}
          </>
        )}

        {partitioned.viralQuotes.length > 0 && (
          <>
            <SectionHeader icon="📺" label="Powiedziane w Sejmie" count={partitioned.viralQuotes.length} />
            {partitioned.viralQuotes.map((ev, i) => <ViralCard key={ev.payload.statement_id} ev={ev} idx={i} />)}
          </>
        )}
      </div>

      {filteredPrints.length === 0 && partitioned.prints.length > 0 && (
        <div className="px-4 md:px-8 lg:px-14 py-12 text-center text-muted-foreground font-serif italic" style={{ fontSize: 16 }}>
          Brak projektów dla wybranych filtrów.{" "}
          <button onClick={() => setShowAll(true)} className="text-destructive underline decoration-dotted underline-offset-4 cursor-pointer not-italic">
            pokaż wszystkie
          </button>
        </div>
      )}

      {totalEvents === 0 && (
        <div className="px-4 md:px-8 lg:px-14 py-24 text-center text-muted-foreground font-serif italic" style={{ fontSize: 18 }}>
          To posiedzenie nie ma jeszcze opracowanych wydarzeń.
          {olderSitting && (
            <>
              {" "}
              <Link href={`/tygodnik/p/${olderSitting.sittingNum}`} className="text-destructive underline decoration-dotted underline-offset-4 not-italic">
                Zobacz Nr {olderSitting.sittingNum}
              </Link>
            </>
          )}
        </div>
      )}

      <ArchiveIndex sittings={sittings} currentSitting={sitting.sittingNum} />

      <Ornament char="∼ ✶ ∼" pad={48} />

      <div className="max-w-[700px] mx-auto px-4 md:px-8 lg:px-14 pb-20 text-center">
        <p className="font-serif italic text-secondary-foreground m-0 mb-5" style={{ fontSize: 18, lineHeight: 1.6 }}>
          To wszystko z bieżących prac Sejmu. Następny list w piątek po kolejnym posiedzeniu, około godziny 19:00.
        </p>
        <div className="font-sans text-xs text-muted-foreground tracking-wide flex justify-center gap-4 flex-wrap">
          <span>Wygenerowane z {totalEvents} wydarzeń sejmowych</span>
          <span className="text-border">·</span>
          <span className="text-destructive">RSS · ICS · e-mail</span>
        </div>
      </div>
    </div>
  );
}
