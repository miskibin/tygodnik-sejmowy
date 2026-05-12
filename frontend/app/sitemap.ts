import type { MetadataRoute } from "next";
import { getAllActiveMps } from "@/lib/db/mps";
import { getSittingsIndex } from "@/lib/db/prints";

const SITE_URL = "https://tygodniksejmowy.pl";

// Sitemap regenerates on each build (or on request — Next.js treats
// sitemap.ts as a Route Handler). Scope: static top-level routes +
// curated dynamic (active MPs + recent 50 sittings). Druki/mowy/wątki
// have thousands of long-tail URLs and are skipped to keep the sitemap
// scannable; Google still discovers them via internal links.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`,          lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: `${SITE_URL}/tygodnik`,  lastModified: now, changeFrequency: "weekly",  priority: 0.95 },
    { url: `${SITE_URL}/posel`,     lastModified: now, changeFrequency: "weekly",  priority: 0.9 },
    { url: `${SITE_URL}/obietnice`, lastModified: now, changeFrequency: "weekly",  priority: 0.85 },
    { url: `${SITE_URL}/atlas`,     lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/szukaj`,    lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/o-projekcie`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/komisja`,   lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${SITE_URL}/mowa`,      lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${SITE_URL}/watek`,     lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${SITE_URL}/druk`,      lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${SITE_URL}/alerty`,    lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/manifest`,  lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
  ];

  // Dynamic — tolerant of DB failure: if either query throws, fall back
  // to static-only so a flaky Supabase doesn't break sitemap.xml entirely.
  let mpRoutes: MetadataRoute.Sitemap = [];
  let sittingRoutes: MetadataRoute.Sitemap = [];
  try {
    const mps = await getAllActiveMps();
    mpRoutes = mps.map((m) => ({
      url: `${SITE_URL}/posel/${m.mpId}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // log via console so build still surfaces the issue
    console.error("[sitemap] getAllActiveMps failed; skipping MP routes");
  }
  try {
    const sittings = (await getSittingsIndex(10)).slice(0, 50);
    sittingRoutes = sittings.map((s) => ({
      url: `${SITE_URL}/tygodnik/p/${s.sittingNum}`,
      lastModified: s.lastDate ? new Date(s.lastDate) : now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    }));
  } catch {
    console.error("[sitemap] getSittingsIndex failed; skipping sitting routes");
  }

  return [...staticRoutes, ...mpRoutes, ...sittingRoutes];
}
