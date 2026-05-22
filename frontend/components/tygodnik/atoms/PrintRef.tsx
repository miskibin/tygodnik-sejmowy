import Link from "next/link";

// Outlined mono-uppercase link badge — "DRUK N" reference that lands on
// the process detail page.

export function PrintRef({ term, number }: { term: number; number: string }) {
  return (
    <Link
      href={`/proces/${term}/${number}`}
      className="font-mono uppercase no-underline hover:bg-muted transition-colors"
      style={{
        fontSize: 9.5,
        color: "var(--secondary-foreground)",
        padding: "3px 8px",
        letterSpacing: "0.14em",
        border: "1px solid var(--border)",
      }}
    >
      druk {number}
    </Link>
  );
}
