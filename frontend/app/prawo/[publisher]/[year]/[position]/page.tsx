import Link from "next/link";
import { notFound } from "next/navigation";
import { getLawDocument } from "@/lib/db/law";
import { isLegalBasis, validDate, validEli } from "@/lib/law-types";
import { supabase } from "@/lib/supabase";

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
  return <main className="mx-auto w-full max-w-4xl px-5 py-10">
    <Link href="/prawo" className="text-sm underline">Prawo</Link>
    <h1 className="mt-6 font-serif text-3xl leading-tight sm:text-4xl">{document.title}</h1>
    <div className="mt-6 border-y border-border py-5 text-sm leading-7">
      <p>{verified ? `Wersja potwierdzona dla ${date}` : `Aktualność niepotwierdzona dla ${date}`}</p>
      <p>Źródło: {document.selected.document_eli_id} · dokument opublikowany {document.selected.document_date ?? "—"} · pobrany {document.selected.captured_at.slice(0, 10)}</p>
      <p>{document.selected.extraction_quality === "structured" ? "Zachowano strukturę artykułów z oficjalnego HTML." : "Ekstrakcja PDF wymaga kontroli. Tekst nie jest zweryfikowaną podstawą odpowiedzi."}</p>
      <a className="underline" href={document.selected.source_url}>Otwórz oficjalny dokument ELI</a>
      <details className="mt-3"><summary>Pochodzenie wersji</summary><p className="mt-2 break-all">SHA-256: {document.selected.source_sha256}</p><p className="break-all">Wersja: {document.selected.id}</p></details>
    </div>
    <form className="my-6 grid gap-3 sm:grid-cols-2">
      <label>Dokument<select name="version" defaultValue={document.selected.id} className="mt-2 w-full rounded-md border border-input bg-background p-3">{document.versions.map(v => <option key={v.id} value={v.id}>{v.document_eli_id} · {v.document_date ?? "brak daty"} · {v.source_sha256.slice(0, 8)}</option>)}</select></label>
      {document.versions.length > 1 && <label>Porównaj dokument<select name="compare" defaultValue={compare ?? ""} className="mt-2 w-full rounded-md border border-input bg-background p-3"><option value="">Bez porównania</option>{document.versions.map(v => <option key={v.id} value={v.id}>{v.document_eli_id} · {v.document_date ?? "brak daty"}</option>)}</select></label>}
      <button className="w-fit rounded-md bg-foreground px-5 py-3 text-background">Pokaż</button>
    </form>
    {previous && <p className="mb-6 text-sm text-muted-foreground">Porównanie pobranych dokumentów {previous.selected.document_eli_id} i {document.selected.document_eli_id}. Nie odtwarza to automatycznie brzmienia prawa pomiędzy tymi dokumentami.</p>}
    <details className="mb-8 border-b border-border pb-5"><summary>Spis treści · {document.units.length} artykułów</summary><ol className="mt-4 columns-2 gap-8 sm:columns-3">{document.units.map(u => <li className="py-1" key={u.id}><a className="text-sm underline" href={`#${u.anchor}`}>{u.label}</a></li>)}</ol></details>
    {document.processes.length > 0 && <nav aria-label="Powiązane prace Sejmu" className="mb-8"><h2 className="text-xl">Powiązane prace Sejmu</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Procesy dotyczą aktu lub powiązanych z nim dokumentów. Zakres zmian w artykułach wymaga sprawdzenia treści.</p>{document.processes.map((p: {term: number; number: string; title: string; linked_eli: string; relation: string}) => <Link key={`${p.term}/${p.number}/${p.linked_eli}`} href={`/proces/${p.term}/${p.number}`} className="mt-3 block text-sm underline">Druk {p.term}/{p.number} · {p.title}<span className="mt-1 block text-xs text-muted-foreground">{p.relation} · {p.linked_eli}</span></Link>)}</nav>}
    {document.units.map(unit => {
      const old = prior.get(unit.article_number);
      const prompt = `Wyjaśnij ${unit.label} aktu ${unit.root_eli_id}. Pobierz jednostkę ${unit.id}, wersję ${unit.version_id}, i sprawdź aktualność na ${date}. Nie zakładaj, że tekst obowiązuje.`;
      return <article id={unit.anchor} key={unit.id} className="scroll-mt-24 border-b border-border py-8">
        <p className="mb-2 text-xs leading-6 text-muted-foreground">{unit.context.join(" · ")}</p>
        <h2 className="text-xl font-medium"><a href={`#${unit.anchor}`}>{unit.label}</a></h2>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">Dokument {unit.document_eli_id} · {isLegalBasis(unit, date) ? `wersja potwierdzona dla ${date}` : `aktualność niepotwierdzona dla ${date}`}</p>
        <p className="mt-4 whitespace-pre-wrap break-words text-base leading-8">{unit.body}</p>
        {previous && old && old.body_sha256 !== unit.body_sha256 && <details className="mt-5"><summary>Brzmienie w porównywanym dokumencie</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{old.body}</p></details>}
        {previous && !old && <p className="mt-3 text-sm text-muted-foreground">Brak tej jednostki w porównywanym dokumencie.</p>}
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <a className="underline" href={unit.extraction_method === "html_structured" ? `${unit.source_url}#${encodeURIComponent(unit.anchor)}` : unit.source_url}>Źródło przepisu</a>
          <a className="underline" href={`https://chat.tygodniksejmowy.pl/?law_unit=${unit.id}&law_version=${unit.version_id}&law_date=${date}&prompt=${encodeURIComponent(prompt)}`}>Zapytaj Asystenta</a>
        </div>
      </article>;
    })}
  </main>;
}
