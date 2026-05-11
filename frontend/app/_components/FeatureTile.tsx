import Link from "next/link";
import type { ReactNode } from "react";

type Props = {
  num: string;
  kicker: string;
  title: string;
  description: string;
  preview: ReactNode;
  href: string | null;
  ctaLabel?: string;
  className?: string;
};

export function FeatureTile({
  num,
  kicker,
  title,
  description,
  preview,
  href,
  ctaLabel,
  className = "",
}: Props) {
  const isLive = href !== null;

  return (
    <article
      className={`bg-background p-6 md:p-7 flex flex-col min-h-[280px] ${className}`}
    >
      <header className="flex items-baseline justify-between mb-4">
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground">
          {num}
        </span>
        <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-destructive">
          {kicker}
        </span>
      </header>

      <h2 className="font-serif text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-none m-0 mb-5">
        {title}
      </h2>

      <div className="mb-5 min-h-[72px]">{preview}</div>

      <p className="font-sans text-[12.5px] leading-[1.55] text-secondary-foreground m-0 mb-4 flex-1">
        {description}
      </p>

      <footer className="border-t border-dashed border-border pt-3 mt-auto">
        {isLive ? (
          <Link
            href={href!}
            className="font-sans text-[11.5px] tracking-wide text-destructive hover:underline"
          >
            {ctaLabel ?? "otwórz →"}
          </Link>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            wkrótce
          </span>
        )}
      </footer>
    </article>
  );
}
