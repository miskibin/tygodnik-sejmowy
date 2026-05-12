import { getBriefItems } from "@/lib/db/prints";
import { TOPICS } from "@/lib/topics";
import { PERSONAS } from "@/lib/personas";
import { buildRss, type RssItem } from "@/lib/rss";

const SITE_URL = "https://tygodniksejmowy.pl";
const FEED_URL = `${SITE_URL}/rss.xml`;
const MAX_DESC = 500;

export const revalidate = 1800;

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1).trimEnd() + "…";
}

function topicLabel(id: string): string {
  const t = (TOPICS as Record<string, { label?: string } | undefined>)[id];
  return t?.label ?? id;
}

function personaLabel(id: string): string {
  const p = (PERSONAS as Record<string, { label?: string } | undefined>)[id];
  return p?.label ?? id;
}

export async function GET() {
  const briefs = await getBriefItems();

  const items: RssItem[] = briefs.map((b) => {
    const url = `${SITE_URL}/druk/${b.term}/${encodeURIComponent(b.number)}`;
    const punch = b.impactPunch ?? "";
    const summary = b.summaryPlain ?? "";
    const desc = truncate([punch, summary].filter(Boolean).join(" — "), MAX_DESC);
    const cats = [
      ...b.topics.map(topicLabel),
      ...b.personas.map(personaLabel),
    ];
    return {
      title: b.shortTitle || b.title,
      link: url,
      guid: url,
      description: desc,
      pubDate: b.changeDate ? new Date(b.changeDate) : null,
      categories: cats,
    };
  });

  const xml = buildRss(
    {
      title: "Tygodnik Sejmowy — druki",
      link: SITE_URL,
      description:
        "Druki sejmowe X kadencji w wyborze redakcji Tygodnika Sejmowego.",
      language: "pl-pl",
      selfLink: FEED_URL,
    },
    items,
  );

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
