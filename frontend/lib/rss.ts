import "server-only";

export type RssChannel = {
  title: string;
  link: string;
  description: string;
  language?: string;
  selfLink?: string;
  lastBuildDate?: Date;
};

export type RssItem = {
  title: string;
  link: string;
  guid: string;
  description: string;
  pubDate?: Date | null;
  categories?: string[];
};

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

export function buildRss(channel: RssChannel, items: RssItem[]): string {
  const built = rfc822(channel.lastBuildDate ?? new Date());
  const atomSelf = channel.selfLink
    ? `    <atom:link href="${escapeXml(channel.selfLink)}" rel="self" type="application/rss+xml" />\n`
    : "";

  const itemsXml = items
    .map((it) => {
      const cats = (it.categories ?? [])
        .filter(Boolean)
        .map((c) => `      <category>${escapeXml(c)}</category>`)
        .join("\n");
      const pub = it.pubDate ? `      <pubDate>${rfc822(it.pubDate)}</pubDate>\n` : "";
      return [
        "    <item>",
        `      <title>${escapeXml(it.title)}</title>`,
        `      <link>${escapeXml(it.link)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(it.guid)}</guid>`,
        `      <description>${cdata(it.description)}</description>`,
        cats,
        pub.trimEnd(),
        "    </item>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <description>${escapeXml(channel.description)}</description>
    <language>${escapeXml(channel.language ?? "pl-pl")}</language>
    <lastBuildDate>${built}</lastBuildDate>
${atomSelf}${itemsXml}
  </channel>
</rss>
`;
}
