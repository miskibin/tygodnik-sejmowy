// Three-pillar primary nav matches the manifesto ("3 do 7 rzeczy" — keep
// top-level lean). Sondaże/Atlas/Mowa are exploration tools, not core
// product, so they live under "Więcej". Global /szukaj is reachable from
// the search button + Ctrl+K palette in the masthead, plus a SECONDARY_NAV
// entry below for discoverability.
export const PRIMARY_NAV = [
  { href: "/tygodnik",  label: "Tygodnik" },
  { href: "/posel",     label: "Twój poseł" },
  { href: "/obietnice", label: "Obietnice" },
] as const;

// Sidebar "Główne" gets two extra high-traffic explorer routes while desktop
// top nav stays lean (PRIMARY_NAV + Więcej).
export const SIDEBAR_MAIN_NAV = [
  ...PRIMARY_NAV,
  { href: "/atlas",   label: "Atlas" },
  { href: "/sondaze", label: "Sondaże" },
] as const;

export const SECONDARY_NAV = [
  { href: "/szukaj",       label: "Szukaj",      hint: "wyszukiwarka" },
  { href: "/atlas",        label: "Atlas",       hint: "wykresy" },
  { href: "/sondaze",      label: "Sondaże",     hint: "poparcie partii" },
  { href: "/proces",       label: "Procesy",     hint: "ścieżka ustaw" },
  { href: "/mowa",         label: "Mowa",        hint: "transkrypcje" },
  { href: "/komisja",      label: "Komisja",     hint: "posiedzenia" },
  { href: "/o-projekcie",  label: "O projekcie", hint: "warsztat" },
  { href: "/alerty",       label: "Alerty",      hint: "subskrypcje" },
] as const;

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
