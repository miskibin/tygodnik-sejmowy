export const PRIMARY_NAV = [
  { href: "/tygodnik",  label: "Tygodnik" },
  { href: "/posel",     label: "Twój poseł" },
  { href: "/obietnice", label: "Obietnice" },
  { href: "/sondaze",   label: "Sondaże" },
  { href: "/atlas",     label: "Atlas" },
  { href: "/szukaj",    label: "Szukaj" },
] as const;

export const SECONDARY_NAV = [
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
