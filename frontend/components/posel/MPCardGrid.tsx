import Link from "next/link";
import type { ReactNode } from "react";
import { ClubBadge } from "@/components/clubs/ClubBadge";

// Single canonical MP card for grid contexts (/posel index, /komisja/[id]
// member roster). Replaces the prior duplicate inline `MpCard` and
// `MemberCard` components which differed only in photo size — same border,
// same hover, same flex layout, same ClubBadge + district mono row.
//
// Variants are NOT split into separate components: photoSize="sm" gives
// the smaller komisja roster footprint (44x56), photoSize="md" gives the
// /posel index (48x60). `subline` is the optional bottom row used by the
// komisja card to show the committee role under the district line.

const PHOTO_DIMS: Record<"sm" | "md", { w: number; h: number }> = {
  sm: { w: 44, h: 56 },
  md: { w: 48, h: 60 },
};

const NAME_TEXT_CLASS: Record<"sm" | "md", string> = {
  sm: "font-serif text-[14px] font-medium leading-tight truncate",
  md: "font-serif text-sm font-medium leading-tight truncate",
};

export type MPCardGridProps = {
  mpId: number;
  name: string;
  photoUrl?: string | null;
  clubRef?: string | null;
  clubName?: string | null;
  district?: number | string | null;
  subline?: ReactNode;
  photoSize?: "sm" | "md";
  href?: string;
  className?: string;
};

export function MPCardGrid({
  mpId,
  name,
  photoUrl,
  clubRef,
  clubName,
  district,
  subline,
  photoSize = "md",
  href,
  className,
}: MPCardGridProps) {
  const dims = PHOTO_DIMS[photoSize];
  const districtLabel =
    district == null
      ? null
      : typeof district === "number"
        ? `· okr. ${district}`
        : district;

  return (
    <Link
      href={href ?? `/posel/${mpId}`}
      className={`block border border-border hover:border-destructive bg-background p-3 transition-colors${className ? ` ${className}` : ""}`}
    >
      <div className="flex items-center gap-3">
        {photoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={photoUrl}
            alt=""
            style={{ width: dims.w, height: dims.h }}
            className="object-cover bg-border flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div
            style={{ width: dims.w, height: dims.h }}
            className="bg-border flex-shrink-0"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className={NAME_TEXT_CLASS[photoSize]}>{name}</div>
          <div className="font-mono text-[10px] text-muted-foreground mt-1 flex items-center gap-1.5 min-w-0">
            {clubRef ? (
              <ClubBadge
                klub={clubRef}
                size="xs"
                withLabel={photoSize === "md"}
                tooltip={clubName ?? undefined}
              />
            ) : (
              <span>—</span>
            )}
            {districtLabel != null ? (
              <span className="truncate">{districtLabel}</span>
            ) : null}
          </div>
          {subline ? (
            <div className="font-mono text-[10px] text-muted-foreground mt-1 truncate">
              {subline}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
