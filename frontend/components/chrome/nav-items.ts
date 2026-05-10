// Three-pillar primary nav matches the manifesto ("3 do 7 rzeczy" — keep
// top-level lean). Sondaże/Atlas/Mowa are exploration tools, not core
// product, so they live under "Więcej". /szukaj is hidden until the
// PostgREST `polish_fts_search` RPC ships on prod (migration 0073) — no
// dead "Wkrótce" link in the masthead.
export const PRIMARY_NAV = [
  { href: "/tygodnik",  label: "Tygodnik" },
  { href: "/posel",     label: "Twój poseł" },
  { href: "/obietnice", label: "Obietnice" },
] as const;

export const SECONDARY_NAV = [
  { href: "/atlas",        label: "Atlas",       hint: "wykresy" },
  { href: "/sondaze",      label: "Sondaże",     hint: "poparcie partii" },
  { href: "/watek",        label: "Wątek",       hint: "pełen cykl" },
  { href: "/mowa",         label: "Mowa",        hint: "transkrypcje" },
  { href: "/komisja",      label: "Komisja",     hint: "posiedzenia" },
  { href: "/budzet",       label: "Budżet",      hint: "finanse" },
  { href: "/alerty",       label: "Alerty",      hint: "subskrypcje" },
] as const;

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
