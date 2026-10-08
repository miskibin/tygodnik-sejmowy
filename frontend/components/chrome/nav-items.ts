export const PRIMARY_NAV = [
  { href: "/tygodnik", label: "Tygodnik" },
  { href: "/proces", label: "Procesy" },
  { href: "/prawo", label: "Prawo" },
  { href: "/posel", label: "Posłowie" },
] as const;
export const SIDEBAR_MAIN_NAV = PRIMARY_NAV;
export const SECONDARY_GROUPS = [
  { label: "Prace Sejmu", items: [
    { href: "/posiedzenie", label: "Posiedzenia" },
    { href: "/komisja", label: "Komisje" },
    { href: "/mowa", label: "Wypowiedzi" },
    { href: "/glosowanie", label: "Głosowania" },
  ] },
  { label: "Analizy", items: [
    { href: "/obietnice", label: "Obietnice" },
    { href: "/sondaze", label: "Sondaże" },
    { href: "/atlas", label: "Atlas" },
    { href: "/powiazania", label: "Powiązania" },
  ] },
  { label: "Serwis", items: [
    { href: "/o-projekcie", label: "O projekcie" },
    { href: "/preferencje", label: "Preferencje" },
    { href: "/alerty", label: "Alerty" },
  ] },
] as const;
export const SECONDARY_NAV = SECONDARY_GROUPS.flatMap(group => [...group.items]);

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
