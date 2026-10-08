import Link from "next/link";
import { notFound } from "next/navigation";
import { getLawDocument, getLawLinks } from "@/lib/db/law";
import { isLegalBasis, validDate, validEli } from "@/lib/law-types";
import { supabase } from "@/lib/supabase";
import { articleFootnote, lawBlocks } from "@/lib/law-reader";
import { LawText } from "../../../_components/LawText";
import { LawContents } from "../../../_components/LawContents";
import styles from "../../../_components/reader.module.css";

export const dynamic = "force-dynamic";

export default async function LawActPage({ params, searchParams }: {
  params: Promise<{ publisher: string; year: string; position: string }>;
  searchParams: Promise<{ version?: string; compare?: string }>;
}) {
  const { publisher, year, position } = await params;
  const root = `${publisher}/${year}/${position}`;
  if (!validEli(root)) notFound();
  const { version, compare } = await searchParams;
  if ((version && !/^[a-f0-9]{64}$/.test(version)) || (compare && !/^[a-f0-9]{64}$/.test(compare))) notFound();
  const [document, previous] = await Promise.all([getLawDocument(root, version), compare ? getLawDocument(root, compare) : Promise.resolve(null)]);
  if (!document) {
    if (version || compare) notFound();
    const { data: act, error } = await supabase().from("acts").select("title,source_url,entry_into_force,status").eq("eli_id", root).maybeSingle();
    if (error) throw error;
    if (!act) notFound();
    return <main className="mx-auto w-full max-w-4xl px-5 py-10">
      <Link href="/prawo" className="text-sm underline">Prawo</Link>
      <h1 className="mt-6 font-serif text-3xl leading-tight">{act.title}</h1>
      <p className="mt-6 leading-7">W bazie są metadane tego aktu. Tekst przepisów i jego aktualność nie zostały jeszcze potwierdzone.</p>
      {act.entry_into_force && <p className="mt-4 text-sm">Ogólna data wejścia w życie według ELI: {act.entry_into_force}. Wyjątki wymagają sprawdzenia dokumentu.</p>}
      <a className="mt-6 inline-block underline" href={act.source_url || `https://api.sejm.gov.pl/eli/acts/${root}`}>Otwórz oficjalne źródło ELI</a>
    </main>;
  }
  if (compare && !previous) notFound();
  const date = validDate();
  const verified = document.units.length > 0 && document.units.every(u => isLegalBasis(u, date));
  const prior = new Map(previous?.units.map(u => [u.article_number, u]) ?? []);
  const shownVersions = document.versions.filter((v, i, all) => {
    const sameSource = (candidate: typeof v) => candidate.document_eli_id === v.document_eli_id && candidate.source_sha256 === v.source_sha256;
    return sameSource(document.selected) ? v.id === document.selected.id : all.findIndex(sameSource) === i;
  });
  const links = await getLawLinks(document.units);
  const blocks = new Map(document.units.map(unit => [unit.id, lawBlocks(unit)]));
  const ids = new Set(document.units.flatMap(unit => [unit.anchor, ...blocks.get(unit.id)!.map(b => b.id)]));
  const totals = new Map<string | null, number>();
  for (const unit of document.units) totals.set(unit.article_number, (totals.get(unit.article_number) ?? 0) + 1);
  const variants = new Map<string | null, number>();
  const entries = document.units.map(unit => {
    const variant = (variants.get(unit.article_number) ?? 0) + 1;
    variants.set(unit.article_number, variant);
    return { id: unit.anchor, label: unit.label + (unit.article_number && totals.get(unit.article_number)! > 1 ? ` (${variant}/${totals.get(unit.article_number)})` : ""), context: unit.context.filter(Boolean) };
  });
  let annotations: { document_text?: string; preamble?: string; footnotes?: { page: number; text: string }[]; attachments?: { page: number; text: string }[] } = {};
  try { annotations = JSON.parse(document.selected.notes || "{}"); } catch { /* Older snapshots have no source appendix. */ }
  return <main className={styles.reader}>
    <Link href="/prawo" className={styles.breadcrumb}>Prawo</Link>
    <header className={styles.header}>
      <h1>{document.title}</h1>
      <div className={styles.versionInfo}>
        <p className={styles.status}>{verified ? `Wersja potwierdzona dla ${date}` : `Aktualność niepotwierdzona dla ${date}`}</p>
        <p>Dokument {document.selected.document_eli_id} · opublikowany {document.selected.document_date ?? "—"} · pobrany {document.selected.captured_at.slice(0, 10)}</p>
        <a href={document.selected.source_url}>Oficjalny dokument ELI</a>
        <details className={styles.provenance}><summary>Źródło i weryfikacja tekstu</summary>
          <p>{document.selected.extraction_quality === "structured" ? "Zachowano strukturę artykułów z oficjalnego HTML." : "Ekstrakcja tekstu wymaga kontroli. Tekst nie jest zweryfikowaną podstawą odpowiedzi."}</p>
          <p>SHA-256: {document.selected.source_sha256}</p><p>Wersja: {document.selected.id}</p>
        </details>
      </div>
      <form className={styles.versions}>
        <label>Dokument<select name="version" defaultValue={document.selected.id}>{shownVersions.map(v => <option key={v.id} value={v.id}>{v.document_eli_id} · {v.document_date ?? "brak daty"}</option>)}</select></label>
        {shownVersions.length > 1 && <label>Porównaj dokument<select name="compare" defaultValue={compare ?? ""}><option value="">Bez porównania</option>{shownVersions.map(v => <option key={v.id} value={v.id}>{v.document_eli_id} · {v.document_date ?? "brak daty"}</option>)}</select></label>}
        <button>Pokaż</button>
      </form>
      {previous && <p className={styles.compareNote}>Porównanie pobranych dokumentów {previous.selected.document_eli_id} i {document.selected.document_eli_id}. Nie odtwarza to automatycznie brzmienia prawa pomiędzy tymi dokumentami.</p>}
    </header>
    <div className={styles.layout}>
      <div className={styles.document}>
        {document.units.map((unit, index) => {
          const old = prior.get(unit.article_number), context = entries[index].context;
          const changedContext = context.join(" / ") !== (entries[index - 1]?.context.join(" / ") ?? "");
          return <div key={unit.id}>
            {changedContext && context.length > 0 && <section className={styles.chapter}>
              {context.length > 1 && <p>{context.slice(0, -1).join(" · ")}</p>}
              <h2>{context.at(-1)}</h2>
            </section>}
            <article id={unit.anchor} className={styles.article} data-law-article>
              <h3><a href={`#${encodeURIComponent(unit.anchor)}`}>{entries[index].label}</a>{articleFootnote(unit.body) && <sup><a href={annotations.footnotes?.length ? "#source-notes" : unit.source_url} aria-label="Przypis źródłowy">{articleFootnote(unit.body)}</a></sup>}</h3>
              {unit.article_number && totals.get(unit.article_number)! > 1 && <p className={styles.variantNote}>W tym dokumencie są różne brzmienia tego artykułu. Sprawdź warunki w <a href={annotations.footnotes?.length ? "#source-notes" : unit.source_url}>przypisach źródłowych</a>.</p>}
              <LawText unit={unit} blocks={blocks.get(unit.id)!} links={links} ids={ids} />
              {previous && old && old.body_sha256 !== unit.body_sha256 && totals.get(unit.article_number) === 1 && <details className={styles.comparison}><summary>Brzmienie w porównywanym dokumencie</summary>
                <LawText unit={old} blocks={lawBlocks({ ...old, anchor: `compare-${unit.anchor}` })} links={{ acts: [], metadata: [] }} ids={new Set()} />
              </details>}
              {previous && !old && <p className={styles.variantNote}>Brak tej jednostki w porównywanym dokumencie.</p>}
              <div className={styles.articleActions}>
                <span>{isLegalBasis(unit, date) ? `Wersja potwierdzona · ${date}` : `Aktualność niepotwierdzona · ${date}`}</span>
                <a href={unit.extraction_method === "html_structured" && unit.extraction_quality === "structured" ? `${unit.source_url}#${encodeURIComponent(unit.anchor)}` : unit.source_url}>Źródło przepisu</a>
                <a href={`https://chat.tygodniksejmowy.pl/?law_unit=${unit.id}&law_version=${unit.version_id}&law_date=${date}`}>Zapytaj Asystenta</a>
              </div>
            </article>
          </div>;
        })}
        {annotations.preamble && <details className={styles.extras}><summary>Obwieszczenie i przepisy przytoczone przed tekstem ustawy</summary><pre>{annotations.preamble}</pre></details>}
        {(annotations.footnotes?.length ?? 0) > 0 && <details id="source-notes" className={styles.extras}><summary>Przypisy źródłowe</summary>
          {annotations.footnotes!.map(note => <section key={note.page}><a href={`${document.selected.source_url}#page=${note.page}`}>Strona {note.page} dokumentu ELI</a><pre>{note.text}</pre></section>)}
        </details>}
        {(annotations.attachments?.length ?? 0) > 0 && <details className={styles.extras}><summary>Załączniki do ustawy</summary>
          {annotations.attachments!.map((attachment, index) => <section key={index}><a href={`${document.selected.source_url}#page=${attachment.page}`}>Strona {attachment.page} dokumentu ELI</a><pre>{attachment.text}</pre></section>)}
        </details>}
        {annotations.document_text && <details className={styles.extras}><summary>Pełny odczyt dokumentu źródłowego</summary><pre>{annotations.document_text}</pre></details>}
        {document.processes.length > 0 && <details className={styles.extras}><summary>Powiązane prace Sejmu</summary><p>Procesy dotyczą aktu lub powiązanych z nim dokumentów. Zakres zmian w artykułach wymaga sprawdzenia treści.</p>
          {document.processes.map((p: { term: number; number: string; title: string; linked_eli: string; relation: string }) => <p key={`${p.term}/${p.number}/${p.linked_eli}`}><Link href={`/proces/${p.term}/${p.number}`}>Druk {p.term}/{p.number} · {p.title}</Link></p>)}
        </details>}
      </div>
      <LawContents entries={entries} />
    </div>
  </main>;
}
