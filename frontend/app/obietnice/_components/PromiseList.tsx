import Link from "next/link";
import type { PromiseHubRow } from "@/lib/db/promises";
import { PromiseRow } from "./PromiseRow";

export function PromiseList({ rows }: { rows: PromiseHubRow[] }) {
  if (rows.length === 0) {
    return (
      <div
        className="py-20 text-center text-muted-foreground font-serif italic"
        style={{ fontSize: 18 }}
      >
        Brak obietnic dla wybranych filtrów.{" "}
        <Link
          href="/obietnice"
          className="text-destructive underline decoration-dotted underline-offset-4 not-italic"
        >
          wyczyść filtry
        </Link>
      </div>
    );
  }
  return (
    <div>
      {rows.map((r, i) => (
        <PromiseRow key={r.id} row={r} idx={i} />
      ))}
    </div>
  );
}
