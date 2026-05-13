"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";

// Mirror of ViralStatementCard from lib/db/statements (server-only). Kept as a
// local shape so this client component doesn't pull `import "server-only"`.
export type ViralCarouselQuote = {
  id: number;
  speakerName: string | null;
  function: string | null;
  clubRef: string | null;
  viralQuote: string;
  viralReason: string | null;
  tone: string | null;
  topicTags: string[];
  date: string | null;
  proceedingNumber: number | null;
  viralScore: number | null;
};

type Props = {
  quotes: ViralCarouselQuote[];
  /** ms between auto-advances. 0 disables auto-play. */
  autoplayMs?: number;
  heading?: string;
  subtitle?: string;
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long" });
  } catch {
    return null;
  }
}

export function ViralCarousel({
  quotes,
  autoplayMs = 5000,
  heading = "Najgłośniej w Sejmie",
  subtitle = "Cytaty z mównicy uszeregowane przez model względem rezonansu.",
}: Props) {
  const [api, setApi] = useState<CarouselApi | null>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setIndex(api.selectedScrollSnap());
    const onSelect = () => setIndex(api.selectedScrollSnap());
    api.on("select", onSelect);
    api.on("reInit", () => setCount(api.scrollSnapList().length));
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  useEffect(() => {
    if (!api || autoplayMs <= 0 || paused || count < 2) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => {
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    }, autoplayMs);
    return () => clearInterval(id);
  }, [api, autoplayMs, paused, count]);

  if (quotes.length === 0) return null;

  return (
    <section className="px-4 md:px-8 lg:px-14 py-12 md:py-20 border-b border-rule bg-muted/30">
      <div className="max-w-[1100px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-8 md:mb-10">
          <h2
            className="font-serif font-medium tracking-[-0.025em] leading-none m-0"
            style={{ fontSize: "clamp(1.75rem, 4.5vw, 3rem)" }}
          >
            Najgłośniej <span className="italic text-destructive">w Sejmie</span>
          </h2>
          <p className="font-serif italic text-[14px] md:text-[15px] text-secondary-foreground m-0 max-w-[420px]">
            {subtitle}
          </p>
        </div>

        <div
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocusCapture={() => setPaused(true)}
          onBlurCapture={() => setPaused(false)}
        >
          <Carousel
            setApi={setApi}
            opts={{ align: "start", loop: true }}
            className="relative"
          >
            <CarouselContent className="-ml-4">
              {quotes.map((q) => {
                const klubColor = q.clubRef
                  ? KLUB_COLORS[q.clubRef] ?? "var(--muted-foreground)"
                  : "var(--muted-foreground)";
                const klubLabel = q.clubRef
                  ? KLUB_LABELS[q.clubRef] ?? q.clubRef
                  : null;
                const date = fmtDate(q.date);
                return (
                  <CarouselItem
                    key={q.id}
                    className="pl-4 md:basis-1/2 lg:basis-1/3 basis-full"
                  >
                    <Link
                      href={`/mowa/${q.id}`}
                      className="group block h-full bg-background border border-rule rounded-lg p-5 md:p-6 hover:border-destructive transition-colors relative overflow-hidden"
                    >
                      <span
                        aria-hidden
                        className="absolute left-0 top-0 h-full w-[3px]"
                        style={{ background: klubColor, opacity: 0.65 }}
                      />
                      <div className="flex items-center justify-between mb-3 font-mono text-[10px] tracking-[0.16em] uppercase text-muted-foreground">
                        <span style={{ color: klubColor }}>
                          {klubLabel ?? "—"}
                        </span>
                        {date && <span>{date}</span>}
                      </div>
                      <blockquote
                        className="font-serif italic text-foreground leading-[1.25] line-clamp-5 mb-4"
                        style={{
                          fontSize: "clamp(1rem, 1.4vw, 1.18rem)",
                          textWrap: "balance",
                        }}
                      >
                        <span
                          aria-hidden
                          className="select-none mr-1 font-serif italic"
                          style={{ color: klubColor, opacity: 0.4 }}
                        >
                          “
                        </span>
                        {q.viralQuote}
                      </blockquote>
                      <div className="flex items-baseline justify-between mt-auto pt-3 border-t border-border">
                        <span className="font-sans text-[12.5px] text-foreground/85 truncate pr-2">
                          {q.speakerName ?? "anonim"}
                        </span>
                        <span
                          className="font-mono text-[10px] tracking-wide text-muted-foreground group-hover:text-destructive transition-colors shrink-0"
                          aria-hidden
                        >
                          przeczytaj →
                        </span>
                      </div>
                    </Link>
                  </CarouselItem>
                );
              })}
            </CarouselContent>
            <CarouselPrevious className="hidden md:flex -left-4 lg:-left-12" />
            <CarouselNext className="hidden md:flex -right-4 lg:-right-12" />
          </Carousel>
        </div>

        {count > 1 && (
          <div className="mt-6 flex items-center justify-center gap-1.5">
            {Array.from({ length: count }).map((_, i) => (
              <button
                key={i}
                onClick={() => api?.scrollTo(i)}
                aria-label={`Przejdź do cytatu ${i + 1}`}
                className="h-1.5 rounded-full transition-all"
                style={{
                  width: i === index ? 22 : 6,
                  background:
                    i === index ? "var(--destructive)" : "var(--border)",
                }}
              />
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            href="/mowa"
            className="font-mono text-[12px] tracking-[0.16em] uppercase text-destructive hover:underline decoration-dotted underline-offset-4"
          >
            cała mowa sejmowa →
          </Link>
        </div>
      </div>
    </section>
  );
}

