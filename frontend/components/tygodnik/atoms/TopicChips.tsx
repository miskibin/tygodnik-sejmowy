import { cn } from "@/lib/utils";
import { TOPICS, type TopicId } from "@/lib/topics";

/** Topic taxonomy pills (icon + label), same glyphs/colors as FilterBar chips. */
export function TopicChips({
  topicIds,
  className,
  size = "md",
}: {
  topicIds: readonly TopicId[];
  className?: string;
  size?: "sm" | "md";
}) {
  if (topicIds.length === 0) return null;
  const sm = size === "sm";
  return (
    <div
      className={cn(
        "flex flex-wrap font-sans text-secondary-foreground",
        sm ? "gap-1 text-[10px]" : "gap-1.5 text-[12px]",
        className,
      )}
    >
      {topicIds.map((t) => {
        const meta = TOPICS[t];
        if (!meta) return null;
        return (
          <span
            key={t}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-border bg-transparent",
              sm ? "px-2 py-px" : "px-2.5 py-0.5",
            )}
          >
            <span
              className={cn("shrink-0", sm ? "opacity-80" : "opacity-75")}
              style={{ color: meta.color }}
              aria-hidden
            >
              {meta.icon}
            </span>
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
