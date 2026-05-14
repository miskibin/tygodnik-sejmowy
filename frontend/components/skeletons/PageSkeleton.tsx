import { Skeleton } from "@/components/ui/skeleton";

// Universal page skeleton — used by every route's loading.tsx.
// Shape: editorial masthead band (kicker + heading + subtitle) over a body
// of paragraph bars. Neutral enough to match index, detail and feature
// pages without per-route customization.

function Bar({
  w = "100%",
  h = 14,
  className = "",
}: {
  w?: string | number;
  h?: string | number;
  className?: string;
}) {
  return (
    <Skeleton
      className={`bg-muted ${className}`}
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: typeof h === "number" ? `${h}px` : h,
      }}
    />
  );
}

export function PageSkeleton() {
  return (
    <div className="bg-background font-serif" style={{ minHeight: "100vh" }}>
      <span className="sr-only">Wczytywanie…</span>
      <div className="border-b border-rule">
        <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 pt-8 pb-6">
          <Bar w={140} h={11} className="mb-3" />
          <Bar w="60%" h={40} className="mb-3" />
          <Bar w="40%" h={40} className="mb-5" />
          <Bar w="50%" h={14} />
        </div>
      </div>
      <div className="max-w-[1100px] mx-auto px-4 md:px-8 lg:px-14 py-8 md:py-12 flex flex-col gap-6">
        <Bar w="35%" h={18} className="mb-1" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="border-t border-border/60 pt-5 flex flex-col gap-3"
            style={{ minHeight: 140 }}
          >
            <Bar w="80%" h={20} />
            <Bar w="100%" h={12} />
            <Bar w="92%" h={12} />
            <Bar w="50%" h={12} />
          </div>
        ))}
      </div>
    </div>
  );
}
