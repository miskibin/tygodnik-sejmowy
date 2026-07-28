import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

type Props = {
  num: string;
  kicker: string;
  title: string;
  description: string;
  preview: ReactNode;
  href: string | null;
  ctaLabel?: string;
  comingSoon?: boolean;
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
  comingSoon = false,
  className = "",
}: Props) {
  const isLive = href !== null && !comingSoon;

  return (
    <article
      className={`bg-background p-6 md:p-7 flex flex-col min-h-[280px] ${className}`}
    >
      <header className="flex items-baseline justify-between mb-4">
        <span className="text-[11px] text-muted-foreground font-medium">
          {num}
        </span>
        <div className="flex items-baseline gap-2">
          {comingSoon ? (
            <Badge
              variant="outline"
              className="text-[11px] font-medium"
            >
              wkrótce
            </Badge>
          ) : null}
          <span className="text-[11px] text-muted-foreground font-medium">
            {kicker}
          </span>
        </div>
      </header>

      <h2 className="text-[28px] md:text-[32px] font-medium tracking-[-0.02em] leading-none m-0 mb-5">
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
            className="font-sans text-[11.5px] tracking-wide text-foreground hover:underline"
          >
            {ctaLabel ?? "otwórz →"}
          </Link>
        ) : href ? (
          <Link
            href={href}
            className="font-sans text-[11.5px] tracking-wide text-muted-foreground hover:text-foreground hover:underline"
          >
            {ctaLabel ?? "co planujemy →"}
          </Link>
        ) : (
          <span className="text-[11px] text-muted-foreground font-medium">
            wkrótce
          </span>
        )}
      </footer>
    </article>
  );
}
