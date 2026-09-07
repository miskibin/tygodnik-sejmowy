import type { MetadataRoute } from "next";

const SITE_URL = "https://tygodniksejmowy.pl";

// Block crawlers from API endpoints (no SEO value, save crawl budget) and the
// operator panel, but allow everything user-facing. AdsBot still indexes API
// routes by default in Google so explicit Disallow is the right call.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/", "/admin/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
