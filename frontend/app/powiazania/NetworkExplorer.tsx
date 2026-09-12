"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChevronRight, GitBranch, Info, Search, Users, Vote } from "lucide-react";
import { KLUB_COLORS } from "@/lib/atlas/constants";
import { sourceUrl, type Evidence, type NetworkNode, type NetworkSnapshot, type QuestionEdge, type VoteEdge } from "@/lib/network";

type Layer = "questions" | "votes";
type Connection = { peer: NetworkNode; edge: QuestionEdge | VoteEdge; score: number };
const date = (s: string | null) => s ? new Date(s).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "brak daty";
const percent = (n: number) => `${(n * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`;
const normalize = (s: string) => s.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
const initials = (name: string) => name.split(" ").filter(Boolean).map(n => n[0]).slice(0, 2).join("");
const clubColor = (node: NetworkNode) => KLUB_COLORS[node.current_club ?? ""] ?? "var(--muted-foreground)";
function isQuestion(edge: QuestionEdge | VoteEdge): edge is QuestionEdge { return "coauthored_count" in edge; }

function Avatar({ node, large = false }: { node: NetworkNode; large?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const photo = node.photo_url && /^https:\/\//i.test(node.photo_url) && failedUrl !== node.photo_url ? node.photo_url : null;
  return <span aria-hidden="true" className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-[3px] bg-background font-medium ${large ? "h-20 w-20 text-xl" : "h-14 w-14 text-sm"}`} style={{ borderColor: clubColor(node) }}>
    {photo ? (
      // Stored public portrait URLs, as used by the existing MP directory.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={photo} alt="" width={large ? 80 : 56} height={large ? 80 : 56} loading="lazy" decoding="async" ref={img => { if (img?.complete && img.naturalWidth === 0) setFailedUrl(photo); }} onError={() => setFailedUrl(photo)} className="h-full w-full object-cover object-[50%_20%]" />
    ) : initials(node.name)}
  </span>;
}

export function NetworkExplorer({ data, stale = false }: { data: NetworkSnapshot; stale?: boolean }) {
  const byId = useMemo(() => new Map(data.nodes.map(n => [n.mp_id, n])), [data.nodes]);
  const startingId = useMemo(() => {
    const degrees = new Map<number, number>();
    for (const e of data.layers.questions.edges) {
      const a = byId.get(e.a), b = byId.get(e.b);
      const multiplier = a?.current_club && b?.current_club && a.current_club !== b.current_club ? 10 : 1;
      degrees.set(e.a, (degrees.get(e.a) ?? 0) + e.weight * multiplier);
      degrees.set(e.b, (degrees.get(e.b) ?? 0) + e.weight * multiplier);
    }
    return [...degrees].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? data.nodes[0]?.mp_id;
  }, [data, byId]);
  const [selectedId, setSelectedId] = useState(startingId);
  const [layer, setLayer] = useState<Layer>("questions");
  const [query, setQuery] = useState("");
  const [outsideClub, setOutsideClub] = useState(false);
  const [peerId, setPeerId] = useState<number | null>(null);
  const explorerRef = useRef<HTMLElement>(null);
  const selected = byId.get(selectedId);
  const connections = useMemo(() => {
    const edges = layer === "questions" ? data.layers.questions.edges : data.layers.votes.edges;
    return edges.flatMap(edge => {
      const id = edge.a === selectedId ? edge.b : edge.b === selectedId ? edge.a : null;
      const peer = id === null ? undefined : byId.get(id);
      if (!peer || (outsideClub && (!peer.current_club || !selected?.current_club || peer.current_club === selected.current_club))) return [];
      return [{ peer, edge, score: isQuestion(edge) ? edge.weight : edge.excess }];
    }).sort((a, b) => b.score - a.score || a.peer.mp_id - b.peer.mp_id).slice(0, 8);
  }, [layer, data, selectedId, byId, outsideClub, selected]);
  const focused = connections.find(c => c.peer.mp_id === peerId) ?? connections[0];
  const searchResults = query.trim() ? data.nodes.filter(n => normalize(`${n.name} ${n.current_club ?? ""}`).includes(normalize(query.trim()))).slice(0, 12) : [];
  const deviation = data.layers.votes.mp_deviations.find(d => d.mp_id === selectedId);
  const selectPerson = (id: number) => {
    setSelectedId(id); setPeerId(null); setQuery("");
    if (window.matchMedia("(max-width: 767px)").matches) {
      explorerRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
    }
  };

  if (!selected) return <p role="status">W tym okresie nie ma danych o posłach.</p>;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-muted-foreground sm:text-sm">
        <span>{date(data.window.from)} — {date(data.window.to)}</span>
        <span>{data.sampling.questions.selected.toLocaleString("pl-PL")} interpelacji i zapytań w próbie</span>
        <span>{data.sampling.votings.selected} głosowań w próbie</span>
        <span>Obliczono {date(data.generated_at)}{stale ? " · dane wymagają odświeżenia" : ""}</span>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section ref={explorerRef} className="min-w-0 scroll-mt-20 overflow-hidden rounded-2xl border border-border" aria-label="Mapa powiązań">
          <div className="flex flex-wrap gap-3 border-b border-border bg-card p-4 sm:p-5">
            <div className="relative min-w-0 flex-1 basis-64">
              <label htmlFor="network-search" className="sr-only">Szukaj posła lub klubu</label>
              <Search className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" size={17} aria-hidden="true" />
              <input id="network-search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Szukaj posła lub klubu…" autoComplete="off" aria-controls="network-search-results" className="h-11 w-full rounded-lg border border-input bg-background pl-10 pr-3 text-base outline-offset-2 focus-visible:outline-2 md:text-sm" />
              {query.trim() && <div id="network-search-results" className="absolute inset-x-0 top-12 z-20 max-h-72 overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg" aria-label="Wyniki wyszukiwania">
                {searchResults.length ? searchResults.map(n => <button key={n.mp_id} onClick={() => selectPerson(n.mp_id)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-muted focus-visible:bg-muted"><span>{n.name}</span><span className="text-xs text-muted-foreground">{n.current_club ?? "brak klubu"}</span></button>) : <p className="p-3 text-sm text-muted-foreground" role="status">Nie znaleziono osoby ani klubu.</p>}
              </div>}
            </div>
            <div className="flex w-full rounded-lg bg-muted p-1 sm:w-auto" aria-label="Rodzaj powiązania">
              {([ ["questions", "Wspólne sprawy", Users], ["votes", "Głosowania", Vote] ] as const).map(([id, label, Icon]) => (
                <button key={id} onClick={() => { setLayer(id); setPeerId(null); }} aria-pressed={layer === id} className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md px-2 text-sm sm:flex-none sm:whitespace-nowrap sm:px-3 ${layer === id ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon size={15} className="shrink-0" aria-hidden="true" />{label}</button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 text-xs text-muted-foreground">
            <span>Najmocniejsze dostępne relacje · do 8 osób</span>
            <label className="flex min-h-11 cursor-pointer items-center gap-2"><input type="checkbox" checked={outsideClub} onChange={e => setOutsideClub(e.target.checked)} className="h-4 w-4 accent-foreground" />Tylko inne kluby obecnie</label>
          </div>

          <div className="relative hidden h-[530px] md:block">
            <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
              <defs><pattern id="network-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="var(--border)" /></pattern></defs>
              <rect width="100%" height="100%" fill="url(#network-dots)" />
              {connections.map((c, i) => {
                const angle = i * Math.PI * 2 / connections.length - Math.PI / 2;
                return <line key={c.peer.mp_id} x1="50%" y1="50%" x2={`${50 + Math.cos(angle) * 34}%`} y2={`${50 + Math.sin(angle) * 35}%`} stroke={focused?.peer.mp_id === c.peer.mp_id ? "var(--foreground)" : "var(--border)"} strokeWidth={focused?.peer.mp_id === c.peer.mp_id ? 2 : 1.5} strokeDasharray={layer === "votes" ? "5 5" : undefined} />;
              })}
            </svg>
            <div className="absolute left-1/2 top-1/2 z-10 flex w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
              <Avatar node={selected} large />
              <span className="mt-2 rounded bg-background px-2 text-sm font-semibold">{selected.name}</span>
              <span className="mt-1 rounded bg-background px-2 text-xs text-muted-foreground">{selected.current_club ?? "Klub nieznany"}</span>
            </div>
            {connections.map((c, i) => {
              const angle = i * Math.PI * 2 / connections.length - Math.PI / 2;
              return <button key={c.peer.mp_id} aria-pressed={focused?.peer.mp_id === c.peer.mp_id} aria-label={`Pokaż relację: ${selected.name} i ${c.peer.name}`} onClick={() => setPeerId(c.peer.mp_id)} className={`absolute z-10 flex w-36 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-xl p-2 text-center transition-colors hover:bg-muted focus-visible:outline-2 ${focused?.peer.mp_id === c.peer.mp_id ? "bg-muted" : ""}`} style={{ left: `${50 + Math.cos(angle) * 34}%`, top: `${50 + Math.sin(angle) * 35}%` }}>
                <Avatar node={c.peer} /><span className="mt-1 rounded bg-background/95 px-1 text-xs font-medium">{c.peer.name}</span><span className="mt-0.5 rounded bg-background/95 px-1 text-[11px] text-muted-foreground">{c.peer.current_club ?? "Klub nieznany"}</span>
              </button>;
            })}
          </div>

          <div className="p-4 md:hidden"><div className="mb-4 flex items-center gap-3"><Avatar node={selected} /><div className="min-w-0"><p className="font-semibold">{selected.name}</p><p className="text-xs text-muted-foreground">{selected.current_club ?? "Klub nieznany"}</p></div></div>
            {connections.length > 0 && <p className="mb-3 text-xs text-muted-foreground">Dotknij osoby, aby rozwinąć wspólne działania i źródła.</p>}
            {connections.map(c => <div key={c.peer.mp_id} className="border-t border-border">
              <button onClick={() => setPeerId(peerId === c.peer.mp_id ? null : c.peer.mp_id)} aria-expanded={peerId === c.peer.mp_id} aria-controls={`network-mobile-${c.peer.mp_id}`} className={`flex w-full items-center gap-3 px-2 py-3 text-left ${peerId === c.peer.mp_id ? "bg-muted" : ""}`}><Avatar node={c.peer} /><span className="min-w-0 flex-1"><span className="block text-sm font-medium">{c.peer.name}</span><span className="text-xs text-muted-foreground">{c.peer.current_club ?? "Klub nieznany"} · {isQuestion(c.edge) ? `${c.edge.coauthored_count} wspólnych spraw` : `${percent(c.edge.agreement)} zgodnych głosów`}</span></span><ChevronRight size={16} className={`shrink-0 ${peerId === c.peer.mp_id ? "rotate-90" : ""}`} /></button>
              <div id={`network-mobile-${c.peer.mp_id}`} hidden={peerId !== c.peer.mp_id}>{peerId === c.peer.mp_id && <ConnectionDetail connection={c} selected={selected} onExplore={selectPerson} compact />}</div>
            </div>)}
          </div>
          {!connections.length && <p className="px-5 pb-6 text-sm text-muted-foreground" role="status">Brak relacji spełniających te warunki w dostępnej próbie. Zmień osobę, warstwę lub filtr. Brak wyniku nie oznacza braku współpracy.</p>}
          <p className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">Kolory i etykiety oznaczają obecny klub.<span className="hidden md:inline"> Położenie osób służy czytelności, nie mierzy odległości politycznej.</span></p>
        </section>

        <aside className="min-w-0 space-y-5" aria-label="Wyjaśnienie powiązania" aria-live="polite">
          <div className="hidden md:block">{focused ? <ConnectionDetail connection={focused} selected={selected} onExplore={selectPerson} /> : <div className="rounded-2xl border border-border p-6"><GitBranch size={22} className="mb-4 text-muted-foreground" /><h2 className="text-lg font-medium">Wybierz relację</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Zobacz wspólne działania i źródła.</p></div>}</div>
          {deviation && deviation.n > 0 && <div className="rounded-2xl bg-muted/60 p-5"><p className="mb-2 text-xs text-muted-foreground">{selected.name} · głosowania w próbie</p><h3 className="text-base font-medium">Inaczej niż większość klubu</h3><p className="mt-3 text-2xl font-semibold tabular-nums">{deviation.deviations} <span className="text-base font-normal text-muted-foreground">z {deviation.n} głosowań</span></p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Porównanie z klubem w dniu głosowania. Pomijamy remisy, nieobecności i zbyt małe grupy. To opis zachowania w próbie.</p></div>}
          <Link href={`/posel/${selected.mp_id}`} className="flex items-center justify-between px-1 py-3 text-sm hover:underline">Profil: {selected.name} <ArrowUpRight size={16} /></Link>
        </aside>
      </div>

      <details className="mt-8 border-t border-border py-5">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><Info size={16} />Jak czytać tę mapę i skąd pochodzą dane?</summary>
        <div className="mt-5 grid gap-6 text-sm leading-relaxed text-muted-foreground md:grid-cols-2">
          <div><h3 className="mb-2 font-medium text-foreground">Wspólne sprawy</h3><p>Łączymy autorów tej samej interpelacji lub zapytania poselskiego. Powtarzająca się współpraca zwiększa siłę relacji, a dokument podpisany przez dużą grupę waży mniej. Analizujemy do {data.sampling.questions.scan_limit} najnowszych dokumentów z tego okresu. Lista źródeł pokazuje do pięciu przykładów.</p><p className="mt-2">Filtr innych klubów porównuje obecne kluby. Nie rozstrzyga, do jakich klubów należeli autorzy w chwili złożenia dokumentu.</p></div>
          <div><h3 className="mb-2 font-medium text-foreground">Podobieństwo głosów</h3><p>Porównujemy zgodność pary z oczekiwaną zgodnością ich klubów w tych samych głosowaniach, korzystając z przynależności zapisanej przy każdym głosie. Wymagamy co najmniej 20 porównywalnych głosowań. Nadwyżka jest opisową miarą, nie testem istotności ani dowodem współpracy.</p><p className="mt-2">Próba obejmuje do {data.sampling.votings.limit} najnowszych kwalifikujących się głosowań. Nie opisuje całej kadencji. Podobne głosy nie wskazują motywacji ani przyszłej zmiany partii.</p></div>
          {data.limitations.length > 0 && <ul className="list-disc space-y-2 pl-5 md:col-span-2">{data.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>}
        </div>
      </details>
    </div>
  );
}

function ConnectionDetail({ connection, selected, onExplore, compact = false }: { connection: Connection; selected: NetworkNode; onExplore: (id: number) => void; compact?: boolean }) {
  const { edge, peer } = connection;
  const question = isQuestion(edge);
  const evidence: Evidence[] = edge.evidence;
  return <section className={compact ? "bg-muted/40 px-3 py-5" : "rounded-2xl border border-border bg-card p-5 sm:p-6"}>
    <p className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">Podstawa powiązania</p>
    {!compact && <div className="mb-5 flex items-center gap-3"><Avatar node={peer} /><div><h2 className="font-semibold">{peer.name}</h2><p className="text-xs text-muted-foreground">{peer.current_club ?? "Klub nieznany"}</p></div></div>}
    <p className="text-4xl font-semibold tracking-tight tabular-nums">{question ? edge.coauthored_count : percent(edge.agreement)}</p>
    <p className="mt-2 text-sm leading-relaxed">{question ? `wspólnych interpelacji i zapytań z osobą: ${selected.name}.` : `zgodnych głosów z osobą: ${selected.name}, w ${edge.n} porównywalnych głosowaniach.`}</p>
    {!question && <div className="mt-4 rounded-lg bg-muted p-3 text-sm"><p>Typowa zgodność ich klubów: <strong>{percent(edge.baseline_agreement)}</strong></p><p className="mt-1">Nadwyżka zgodności: <strong>{edge.excess >= 0 ? "+" : ""}{(edge.excess * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} pkt proc.</strong></p></div>}
    <div className="mt-6 border-t border-border pt-4"><h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Źródła i przykłady</h3>
      {evidence.length ? <><EvidenceList evidence={evidence.slice(0, 2)} />{evidence.length > 2 && <details className="mt-4"><summary className="cursor-pointer text-xs font-medium underline underline-offset-4">Więcej przykładów ({evidence.length - 2})</summary><div className="mt-4"><EvidenceList evidence={evidence.slice(2)} /></div></details>}</> : <p className="text-sm text-muted-foreground">Brak źródeł do wyświetlenia.</p>}
    </div>
    <button onClick={() => onExplore(peer.mp_id)} className="mt-6 inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-lg bg-primary px-4 py-3 text-left text-sm font-medium text-primary-foreground">Zobacz powiązania tej osoby <ArrowRight size={16} /></button>
  </section>;
}

function EvidenceList({ evidence }: { evidence: Evidence[] }) {
  return <ol className="space-y-4">{evidence.map((e, i) => <li key={`${e.url}-${i}`}><p className="mb-1 text-xs text-muted-foreground">{date(e.date)}</p>{sourceUrl(e.url) ? <a href={sourceUrl(e.url)} target="_blank" rel="noopener noreferrer" className="group inline-flex gap-2 text-sm leading-relaxed hover:underline"><span className="line-clamp-3">{e.title}</span><ArrowUpRight className="mt-1 shrink-0 text-muted-foreground" size={14} aria-hidden="true" /></a> : <p className="text-sm">{e.title}</p>}</li>)}</ol>;
}
