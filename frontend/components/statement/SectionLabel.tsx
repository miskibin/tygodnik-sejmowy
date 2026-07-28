import type { LucideIcon } from "lucide-react";

// Section heading with a hairline border-top, to separate sections in a
// long-scroll page. Mirrors the SectionHead in voting/WhatsNextTimeline so
// /mowa and /glosowanie stay consistent.
export function SectionLabel({
  icon: Icon,
  label,
  subtitle,
}: {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
}) {
  return (
    <div className="mt-10 mb-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2.5">
        <Icon
          aria-hidden
          size={14}
          strokeWidth={1.75}
          className="text-muted-foreground shrink-0"
        />
        <h2 className="text-[14px] font-semibold text-foreground m-0">
          {label}
        </h2>
      </div>
      {subtitle && (
        <p className="text-[13px] text-muted-foreground mt-1.5 mb-0 leading-snug">
          {subtitle}
        </p>
      )}
    </div>
  );
}
