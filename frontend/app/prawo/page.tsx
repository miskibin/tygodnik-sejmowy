import Link from "next/link";
import { getLawRoots, searchLaw } from "@/lib/db/law";
import { validDate, validEli } from "@/lib/law-types";

export const metadata = { title: "Prawo" };
export const dynamic = "force-dynamic";

export default async function LawPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 400) : "";
  const root = typeof params.eli === "string" && validEli(params.eli) ? params.eli : undefined;
  const article = typeof params.article === "string" && /^[0-9a-z¹²³⁴⁵⁶⁷⁸⁹⁰]{1,20}$/.test(params.article) ? params.article : undefined;
  const title = typeof params.title === "string" ? params.title.slice(0, 200) : "";
  const page = typeof params.page === "string" && /^\d{1,5}$/.test(params.page) ? Math.max(1, Number(params.page)) : 1;
  const date = validDate();
  const [catalog, result] = await Promise.all([getLawRoots(page, title), query.length >= 2 || (root && article) ? searchLaw({ query: query || "przepis", root, article, date }) : Promise.resolve(null)]);
  function pageUrl(target: number) {
    const values = new URLSearchParams({ page: String(target) });
    if (title) values.set("title", title);
    return `/prawo?${values}`;
  }
  return <main className="mx-auto w-full max-w-4xl px-5 py-10">
    <h1 className="mb-8 font-serif text-4xl">Prawo</h1>
    <form action="/prawo" className="grid gap-3 border-b border-border pb-8 sm:grid-cols-2">
      <label className="sm:col-span-2">Szukaj przepisu<input name="q" defaultValue={query} placeholder="np. odstąpienie od umowy" minLength={2} maxLength={400} className="mt-2 w-full rounded-md border border-input bg-background p-3" /></label>
      <label>Identyfikator aktu ELI<input name="eli" defaultValue={root ?? ""} placeholder="np. DU/1974/141; puste: wszystkie ustawy" maxLength={24} className="mt-2 w-full rounded-md border border-input bg-background p-3" /></label>
      <label>Artykuł<input name="article" defaultValue={article} placeholder="np. 27" maxLength={20} className="mt-2 w-full rounded-md border border-input bg-background p-3" /></label>
      <button className="w-fit rounded-md bg-foreground px-5 py-3 text-background">Szukaj</button>
    </form>
    {result && <section className="my-8" aria-label="Wyniki wyszukiwania">
      <p className="mb-5 text-sm text-muted-foreground">{result.retrieval === "lexical" ? "Wyszukiwanie tekstowe" : "Wyszukiwanie tekstowe i semantyczne"} · stan sprawdzenia: {date}</p>
      {result.items.length === 0 ? <p>Brak wyników w obecnym zakresie bazy. Nie potwierdza to braku regulacji.</p> : result.items.map(unit => <article key={unit.id} className="border-b border-border py-6">
        <h2 className="text-xl font-medium"><Link href={unit.url.replace("https://tygodniksejmowy.pl", "")}>{unit.label} · {unit.act_title}</Link></h2>
        <p className="mt-2 text-sm text-muted-foreground">Dokument opublikowany: {unit.document_date ?? "brak daty"} · {unit.verified_for_date ? "wersja potwierdzona dla daty" : "aktualność niepotwierdzona"}</p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{unit.body.length <= 900 ? unit.body : "Pełny artykuł jest dostępny pod powyższym odnośnikiem."}</p>
        <a className="mt-3 inline-block text-sm underline" href={unit.source_url}>Dokument źródłowy ELI</a>
      </article>)}
    </section>}
    <section className="my-8"><h2 className="text-2xl font-medium">Akty w bazie</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Udostępniamy dokumenty źródłowe i ich wersje. Pokrycie nowelizacji, aktów wykonawczych i brzmienia na wybraną datę wymaga odrębnego potwierdzenia. Prawo UE, prawo miejscowe i orzecznictwo pozostają poza tym zbiorem.</p>
      <form action="/prawo" className="mt-5 flex gap-3"><label className="flex-1">Nazwa ustawy<input name="title" defaultValue={title} placeholder="np. ochrona danych osobowych" maxLength={200} className="mt-2 w-full rounded-md border border-input bg-background p-3" /></label><button className="self-end rounded-md bg-foreground px-4 py-3 text-background">Szukaj</button></form>
      <p className="mt-4 text-sm text-muted-foreground">{catalog.total} aktów{title ? " pasujących do nazwy" : " w katalogu"}</p>
      <ul className="mt-5 divide-y divide-border">{catalog.roots.map(root => <li key={root.eli_id} className="py-5">
        <Link className="text-lg underline underline-offset-4" href={`/prawo/${root.eli_id}`}>{root.acts?.title ?? root.family}</Link>
        <p className="mt-2 text-sm text-muted-foreground">{root.eli_id} · ostatnie pobranie: {root.checked_at.slice(0, 10)} · {root.last_error ? "część dokumentów wymaga ponownego pobrania" : "aktualność niepotwierdzona"}</p>
      </li>)}</ul>
      {catalog.total > 20 && <nav aria-label="Strony katalogu ustaw" className="mt-6 flex items-center gap-5">{page > 1 && <Link className="underline" href={pageUrl(page - 1)}>Poprzednia</Link>}<span className="text-sm text-muted-foreground">Strona {page} z {Math.ceil(catalog.total / 20)}</span>{page * 20 < catalog.total && <Link className="underline" href={pageUrl(page + 1)}>Następna</Link>}</nav>}
    </section>
    <section className="border-t border-border py-8"><h2 className="text-2xl font-medium">Opublikowane — przyszły termin wejścia w życie</h2>
      <p className="mt-3 text-sm text-muted-foreground">Daty ogólne z metadanych ELI; wyjątki dla poszczególnych przepisów wymagają sprawdzenia treści aktu.</p>
      <ul className="mt-5 divide-y divide-border">{catalog.future.map(act => <li key={act.eli_id} className="py-4"><time className="block text-sm text-muted-foreground">{act.entry_into_force}</time><a className="mt-1 inline-block underline" href={`https://api.sejm.gov.pl/eli/acts/${act.eli_id}`}>{act.title}</a></li>)}</ul>
    </section>
  </main>;
}
