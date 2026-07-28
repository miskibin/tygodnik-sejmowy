import Link from "next/link";
import type { ReactNode } from "react";

export type EmptyStateAction = {
  label: string;
  href: string;
  external?: boolean;
};

export function EmptyState({
  kicker,
  title,
  body,
  actions = [],
}: {
  kicker?: string;
  title: string;
  body?: ReactNode;
  actions?: EmptyStateAction[];
}) {
  return (
    <main className="bg-background text-foreground pb-20">
      <section className="border-b border-rule">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 pb-5">
          {kicker && (
            <div className="font-sans text-[11px] text-muted-foreground mb-2 font-medium">
              {kicker}
            </div>
          )}
          <h1
            className="font-medium tracking-[-0.03em] m-0 leading-[1.05]"
            style={{ fontSize: "clamp(1.875rem, 4.5vw, 2.75rem)" }}
          >
            {title}
          </h1>
        </div>
      </section>

      <div className="max-w-[760px] mx-auto px-4 md:px-8 lg:px-14 pt-10 md:pt-14">
        <div
          className="px-5 md:px-8 py-7 md:py-9 border-l-2"
          style={{ borderColor: "var(--border)", background: "var(--muted)" }}
        >
          {body && (
            <div className="text-[16px] leading-[1.6] text-secondary-foreground [&>p]:mb-3 [&>p:last-child]:mb-0">
              {typeof body === "string" ? <p>{body}</p> : body}
            </div>
          )}

          {actions.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 font-sans text-[13px]">
              {actions.map((a, i) => {
                const cls =
                  i === 0
                    ? "text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    : "text-muted-foreground underline decoration-dotted underline-offset-4 hover:text-foreground";
                if (a.external) {
                  return (
                    <a
                      key={`${a.href}-${i}`}
                      href={a.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cls}
                    >
                      ↗ {a.label}
                    </a>
                  );
                }
                return (
                  <Link key={`${a.href}-${i}`} href={a.href} className={cls}>
                    {a.label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
