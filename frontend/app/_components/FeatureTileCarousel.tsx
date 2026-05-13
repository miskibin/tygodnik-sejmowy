"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TWEEN_FACTOR_BASE = 0.72;

// Coverflow-style carousel for the landing's "Dalej w numerze" row. Center
// slide at full scale, neighbours scale down + tilt back in 3D + fade. Auto-
// advances every 4.5s; pauses on hover/focus. Respects prefers-reduced-motion
// (no autoplay, no tween — slides stay flat).
//
// Mobile (<768px): the 3D coverflow rendered poorly on small viewports —
// neighbours bled off-screen, autoplay fought touch-scroll, and the
// perspective transforms made the cards feel cramped. So we bypass embla
// entirely there and render a plain vertical stack. SSR uses the desktop
// branch; the mobile branch swaps in after mount (single layout shift, no
// FOUC since both layouts share tile chrome).
export function FeatureTileCarousel({ slides }: { slides: ReactNode[] }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    setIsMobile(m.matches);
    const onChange = () => setIsMobile(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);

  if (isMobile) {
    return (
      <div className="flex flex-col gap-px bg-border border border-border">
        {slides.map((slide, i) => (
          <div key={i} className="bg-background">
            {slide}
          </div>
        ))}
      </div>
    );
  }

  return <CoverflowCarousel slides={slides} />;
}

function CoverflowCarousel({ slides }: { slides: ReactNode[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: "center",
    containScroll: false,
    skipSnaps: false,
    duration: 28,
  });
  const tweenFactor = useRef(0);
  const tweenNodes = useRef<HTMLElement[]>([]);
  const [selected, setSelected] = useState(0);
  const [snapCount, setSnapCount] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    const onChange = () => setReduce(m.matches);
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, []);

  const setTweenNodes = useCallback((api: NonNullable<typeof emblaApi>) => {
    tweenNodes.current = api
      .slideNodes()
      .map((s) => s.querySelector("[data-cover-inner]") as HTMLElement)
      .filter(Boolean);
  }, []);

  const setTweenFactor = useCallback((api: NonNullable<typeof emblaApi>) => {
    tweenFactor.current = TWEEN_FACTOR_BASE * api.scrollSnapList().length;
  }, []);

  const tween = useCallback((api: NonNullable<typeof emblaApi>) => {
    if (reduce) return;
    const engine = api.internalEngine();
    const scrollProgress = api.scrollProgress();

    api.scrollSnapList().forEach((scrollSnap, snapIndex) => {
      let diffToTarget = scrollSnap - scrollProgress;
      const slidesInSnap = engine.slideRegistry[snapIndex] ?? [snapIndex];

      slidesInSnap.forEach((slideIndex: number) => {
        if (engine.options.loop) {
          engine.slideLooper.loopPoints.forEach((loopItem) => {
            const target = loopItem.target();
            if (slideIndex === loopItem.index && target !== 0) {
              const sign = Math.sign(target);
              if (sign === -1) diffToTarget = scrollSnap - (1 + scrollProgress);
              if (sign === 1) diffToTarget = scrollSnap + (1 - scrollProgress);
            }
          });
        }
        const tweenValue = 1 - Math.abs(diffToTarget * tweenFactor.current);
        const t = Math.max(0, Math.min(1, tweenValue));
        const scale = 0.72 + t * 0.28;            // 0.72 → 1.0
        const opacity = 0.28 + t * 0.72;          // 0.28 → 1.0
        const rotateY = (1 - t) * 22 * (diffToTarget > 0 ? -1 : 1);
        const translateZ = -120 * (1 - t);
        const node = tweenNodes.current[slideIndex];
        if (node) {
          node.style.transform = `perspective(1400px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`;
          node.style.opacity = String(opacity);
          node.style.zIndex = String(Math.round(t * 10));
        }
      });
    });
  }, [reduce]);

  useEffect(() => {
    if (!emblaApi) return;
    setTweenNodes(emblaApi);
    setTweenFactor(emblaApi);
    tween(emblaApi);
    setSnapCount(emblaApi.scrollSnapList().length);
    setSelected(emblaApi.selectedScrollSnap());

    const onReInit = () => {
      setTweenNodes(emblaApi);
      setTweenFactor(emblaApi);
      tween(emblaApi);
      setSnapCount(emblaApi.scrollSnapList().length);
    };
    const onScroll = () => tween(emblaApi);
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());

    emblaApi.on("reInit", onReInit);
    emblaApi.on("scroll", onScroll);
    emblaApi.on("slideFocus", onScroll);
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("reInit", onReInit);
      emblaApi.off("scroll", onScroll);
      emblaApi.off("slideFocus", onScroll);
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, setTweenNodes, setTweenFactor, tween]);

  // Autoplay: advance every 4.5s. Paused on hover/focus + prefers-reduced.
  useEffect(() => {
    if (!emblaApi || paused || reduce || snapCount < 2) return;
    const id = setInterval(() => {
      if (!emblaApi) return;
      emblaApi.scrollNext();
    }, 4500);
    return () => clearInterval(id);
  }, [emblaApi, paused, reduce, snapCount]);

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      style={{ perspective: "1400px" }}
    >
      <div className="overflow-hidden py-6" ref={emblaRef}>
        <div className="flex">
          {slides.map((slide, i) => (
            <div
              key={i}
              className="min-w-0 px-3 basis-[78%] sm:basis-[58%] md:basis-[44%] lg:basis-[36%]"
              style={{ flex: "0 0 auto" }}
            >
              <div
                data-cover-inner
                className="h-full will-change-transform"
                style={{
                  transformOrigin: "center center",
                  transition: reduce ? "none" : undefined,
                }}
              >
                <div className="h-full border border-border bg-background shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18)] rounded-sm overflow-hidden">
                  {slide}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={() => emblaApi?.scrollPrev()}
        className="absolute left-1 md:-left-2 lg:-left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-muted hover:text-destructive transition-colors z-20 cursor-pointer"
        aria-label="Poprzedni"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => emblaApi?.scrollNext()}
        className="absolute right-1 md:-right-2 lg:-right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-background border border-border shadow-sm flex items-center justify-center text-foreground hover:bg-muted hover:text-destructive transition-colors z-20 cursor-pointer"
        aria-label="Następny"
      >
        <ChevronRight size={18} />
      </button>

      {snapCount > 1 && (
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {Array.from({ length: snapCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Slajd ${i + 1}`}
              className="h-1.5 rounded-full transition-all cursor-pointer"
              style={{
                width: i === selected ? 24 : 6,
                background: i === selected ? "var(--destructive)" : "var(--border)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
