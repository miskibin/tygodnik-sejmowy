import Link from "next/link";

// Outlined mono-uppercase link badge — "PROCES N" reference (destructive
// accent), distinct from PrintRef so the process vs. print distinction
// stays visible on dense agenda rows.

export function ProcessRef({ term, number }: { term: number; number: string }) {
  return (
    <Link
      href={`/proces/${term}/${number}`}
      className="font-mono uppercase no-underline hover:bg-muted transition-colors"
      style={{
        fontSize: 9.5,
        color: "var(--destructive-deep)",
        padding: "3px 8px",
        letterSpacing: "0.14em",
        border: "1px solid var(--destructive-deep)",
      }}
    >
      proces {number}
    </Link>
  );
}
