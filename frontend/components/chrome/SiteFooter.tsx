import Link from "next/link";
import { Heart, Bug, Rss, Globe } from "lucide-react";
import { PatroniteTrackedLink } from "./PatroniteTrackedLink";
import { GithubIcon, YoutubeIcon, XIcon } from "./BrandIcons";
import { getLastDataUpdate } from "@/lib/db/freshness";

const PL_DATE = new Intl.DateTimeFormat("pl-PL", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Warsaw",
});

function relativeLabel(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "przed chwilą";
  if (mins < 60) return `${mins} min temu`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} godz. temu`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days} dni temu`;
  return PL_DATE.format(d).split(",")[0]!.trim();
}

// Global site footer mounted in app/layout.tsx beneath ChromeSlot. Mostly
// server-rendered; Patronite CTA uses a tiny client link for one GA event.
// credit and copyright — bespoke footers on /manifest and /alerty are kept
// only when they carry page-specific CTAs.

const SITEMAP = [
  { href: "/tygodnik", label: "Tygodnik" },
  { href: "/posel", label: "Twój poseł" },
  { href: "/obietnice", label: "Obietnice" },
  { href: "/atlas", label: "Atlas" },
  { href: "/mowa", label: "Mowa" },
  { href: "/komisja", label: "Komisje" },
  { href: "/proces", label: "Procesy" },
  { href: "/szukaj", label: "Szukaj" },
  { href: "/alerty", label: "Alerty" },
  { href: "/manifest", label: "Manifest" },
  { href: "/o-projekcie", label: "O projekcie" },
] as const;

export async function SiteFooter() {
  const lastUpdate = await getLastDataUpdate();
  return (
    <footer
      role="contentinfo"
      className="border-t border-rule bg-muted mt-12"
    >
      <div className="max-w-[1200px] mx-auto px-4 md:px-8 lg:px-14 py-12 grid gap-10 md:gap-8 grid-cols-1 md:grid-cols-3">
        {/* Wordmark + tagline */}
        <div>
          <Link href="/" className="inline-flex items-baseline gap-2">
            <span className="font-serif text-[22px] font-medium tracking-tight text-foreground leading-none">
              Tygodnik<span className="italic text-destructive"> Sejmowy</span>
            </span>
          </Link>
          <p className="font-serif italic text-[13.5px] text-secondary-foreground mt-3 mb-0 leading-snug max-w-[320px]">
            Cotygodniowy przegląd prac Sejmu RP. Wydanie piątkowe, dopasowane do okręgu.
          </p>
          {lastUpdate && (
            <div className="mt-4 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.14em] uppercase text-muted-foreground">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-destructive/70" aria-hidden />
              <span>Aktualizacja danych</span>
              <span className="text-secondary-foreground" title={PL_DATE.format(lastUpdate)}>
                <time dateTime={lastUpdate.toISOString()}>{relativeLabel(lastUpdate)}</time>
              </span>
            </div>
          )}
        </div>

        {/* Sitemap */}
        <nav aria-label="Stopka" className="font-sans text-[13px]">
          <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-muted-foreground mb-3">
            Działy
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 m-0 p-0 list-none">
            {SITEMAP.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-secondary-foreground hover:text-destructive"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Links */}
        <div className="font-mono text-[11px] text-muted-foreground tracking-wide leading-[1.65]">
          <div className="uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Linki
          </div>
          <div className="flex items-center gap-3 mb-4">
            <a
              href="https://x.com/sejmstats"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter): sejmstats"
              title="X / Twitter"
              data-umami-event="footer_x_click"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <XIcon className="w-[18px] h-[18px]" />
            </a>
            <a
              href="https://www.youtube.com/watch?v=7URNcMg_9Ow"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube"
              title="YouTube"
              data-umami-event="footer_youtube_click"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <YoutubeIcon className="w-[18px] h-[18px]" />
            </a>
            <a
              href="https://github.com/miskibin/tygodnik-sejmowy"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Kod źródłowy na GitHubie"
              title="GitHub — kod źródłowy"
              data-umami-event="footer_github_click"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <GithubIcon className="w-[18px] h-[18px]" />
            </a>
            <a
              href="https://github.com/miskibin/tygodnik-sejmowy/issues/new"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Zgłoś błąd lub pomysł"
              title="Zgłoś błąd lub pomysł"
              data-umami-event="footer_bug_click"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Bug className="w-[18px] h-[18px]" aria-hidden />
            </a>
            <a
              href="/rss.xml"
              aria-label="Kanał RSS"
              title="RSS"
              data-umami-event="footer_rss_click"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <Rss className="w-[18px] h-[18px]" aria-hidden />
            </a>
          </div>
          <ul className="m-0 p-0 list-none space-y-2">
            <li className="group flex items-start gap-2">
              <Heart className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-destructive transition-colors" aria-hidden />
              <div>
                <span>Wsparcie: </span>
                <PatroniteTrackedLink placement="footer" className="text-destructive hover:underline">
                  patronite.pl/tygodniksejmowy
                </PatroniteTrackedLink>
              </div>
            </li>
            <li className="group flex items-start gap-2">
              <Globe className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground group-hover:text-destructive transition-colors" aria-hidden />
              <div>
                <a
                  href="https://radoskop.pl/"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-umami-event="footer_radoskop_click"
                  className="text-destructive hover:underline"
                >
                  radoskop.pl
                </a>
                <span className="text-muted-foreground"> — ta sama idea dla rad miast i województw</span>
              </div>
            </li>
            <li className="flex items-start gap-2 pt-2 mt-1 border-t border-border/60">
              <span className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <div>
                <Link
                  href="/polityka-prywatnosci"
                  className="text-muted-foreground hover:text-destructive transition-colors"
                >
                  Polityka prywatności
                </Link>
                <span className="text-muted-foreground"> — cookieless, brak danych osobowych</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
