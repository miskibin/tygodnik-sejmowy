import Link from "next/link";
import { RotateCwIcon } from "lucide-react";

import { logoutAction } from "../actions";

export const KINDS = ["daily", "sync"] as const;
export const LIMITS = [25, 50, 100] as const;

function href(kind: string | null, limit: number): string {
  const p = new URLSearchParams();
  if (kind) p.set("kind", kind);
  if (limit !== LIMITS[1]) p.set("limit", String(limit));
  const qs = p.toString();
  return qs ? `/admin/etl?${qs}` : "/admin/etl";
}

function Chip({
  active,
  children,
  ...rest
}: { active: boolean; children: React.ReactNode; href: string }) {
  return (
    <Link
      {...rest}
      className={`rounded px-2 py-1 font-mono text-[11px] transition-colors ${
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}

export function Filters({
  kind,
  limit,
  gated,
}: {
  kind: string | null;
  limit: number;
  gated: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          rodzaj
        </span>
        <Chip href={href(null, limit)} active={kind === null}>
          wszystkie
        </Chip>
        {KINDS.map((k) => (
          <Chip key={k} href={href(k, limit)} active={kind === k}>
            {k}
          </Chip>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          limit
        </span>
        {LIMITS.map((l) => (
          <Chip key={l} href={href(kind, l)} active={limit === l}>
            {l}
          </Chip>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Plain anchor: a full reload is the point — a soft nav to the
            current route can serve the RSC payload already in memory. */}
        <a
          href={href(kind, limit)}
          className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCwIcon className="size-3" aria-hidden="true" />
          Odśwież
        </a>
        {gated && (
          <form action={logoutAction}>
            <button
              type="submit"
              className="rounded bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              Wyloguj
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
