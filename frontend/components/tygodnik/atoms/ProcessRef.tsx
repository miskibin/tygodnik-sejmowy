import Link from "next/link";

// Outlined mono-uppercase link badge — "PROCES N" reference (destructive
// accent), distinct from PrintRef so the process vs. print distinction
// stays visible on dense agenda rows.

export function ProcessRef({ term, number }: { term: number; number: string }) {
  return (
    <Link
      href={`/proces/${term}/${number}`}
      className="no-underline hover:bg-muted transition-colors font-medium"
      style={{
        fontSize: 11,
        color: "var(--destructive-deep)",
        padding: "3px 8px",
        border: "1px solid var(--destructive-deep)",
      }}
    >
      proces {number}
    </Link>
  );
}
