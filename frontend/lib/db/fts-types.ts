export type FtsKind = "print" | "promise" | "statement" | "voting" | "committee" | "mp";
export type FtsScope = FtsKind | "all";

export type FtsHit = {
  kind: FtsKind;
  id: string;
  label: string;
  headline: string;
  href: string | null;
  meta: string | null;
};

export const FTS_KIND_LABEL: Record<FtsKind, string> = {
  print: "Druki",
  promise: "Obietnice",
  statement: "Wystąpienia",
  voting: "Głosowania",
  committee: "Komisje",
  mp: "Posłowie",
};
