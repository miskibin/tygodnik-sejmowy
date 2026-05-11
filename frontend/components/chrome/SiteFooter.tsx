import Link from "next/link";
import { PatroniteTrackedLink } from "./PatroniteTrackedLink";

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
  { href: "/watek", label: "Wątki" },
  { href: "/szukaj", label: "Szukaj" },
  { href: "/alerty", label: "Alerty" },
  { href: "/manifest", label: "Manifest" },
  { href: "/budzet", label: "Budżet" },
] as const;

export async function SiteFooter() {
  const year = new Date().getFullYear();

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
            Co Sejm zmienił w Twoim życiu w tym tygodniu — w prostym polskim, dopasowane do Twojego okręgu.
          </p>
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

        {/* Sources + copyright */}
        <div className="font-mono text-[11px] text-muted-foreground tracking-wide leading-[1.65]">
          <div className="uppercase tracking-[0.18em] text-muted-foreground mb-3">
            Źródła
          </div>
          <p className="m-0 mb-3">
            Dane: <span className="text-secondary-foreground">api.sejm.gov.pl</span>,{" "}
            <span className="text-secondary-foreground">ELI (Dz.U. / M.P.)</span>, oficjalne stenogramy.
          </p>
          <p className="m-0 mb-3">
            Wsparcie:{" "}
            <PatroniteTrackedLink placement="footer" className="text-destructive hover:underline">
              patronite.pl/tygodniksejmowy →
            </PatroniteTrackedLink>
          </p>
          <p className="m-0 mb-3">
            Kod źródłowy:{" "}
            <a
              href="https://github.com/miskibin/tygodnik-sejmowy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-destructive hover:underline"
            >
              github.com/miskibin/tygodnik-sejmowy →
            </a>
          </p>
          <p className="m-0 text-border">
            © {year} Tygodnik Sejmowy · public-good infrastructure
          </p>
        </div>
      </div>
    </footer>
  );
}
