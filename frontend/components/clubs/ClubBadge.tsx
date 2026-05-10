import Image from "next/image";
import { CLUB_LOGOS } from "@/lib/atlas/club-logos";
import { KLUB_COLORS, KLUB_LABELS } from "@/lib/atlas/constants";

// Single source of truth for klub identity rendering. Replaces the prior
// trio (components/voting/ClubLogo, components/atlas/ClubLogo,
// components/tygodnik/ClubBadge). All three rendered the same logo asset
// from public/club-logos/ but with mismatched APIs and styling — this
// flattens the three into one variant-driven component so the audit's
// "consistent klub badge across the app" goal holds.
//
// Variants:
//   "logo" — image when an asset exists, color square fallback
//            (atlas/heatmap/sankey style — square, paper bg, faint border).
//   "chip" — image-or-color-pill with klub initials/short label
//            (tygodnik table style — colored chip when no logo).
//   "auto" — logo when CLUB_LOGOS has an entry, otherwise chip with label.

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_PX: Record<Size, number> = { xs: 12, sm: 16, md: 20, lg: 28 };

const PLACEHOLDER_INITIALS: Record<string, string> = {
  "niez.": "NI",
  Republikanie: "RE",
};

export type ClubBadgeProps = {
  klub: string | null | undefined;
  // Optional escape hatches for callers that already resolved color/name
  // via a different path (e.g. server queries that join clubs.color directly).
  clubColor?: string;
  clubName?: string;
  size?: Size;
  withLabel?: boolean;
  variant?: "logo" | "chip" | "auto";
  tooltip?: string;
  className?: string;
};

export function ClubBadge({
  klub,
  clubColor,
  clubName,
  size = "sm",
  withLabel = false,
  variant = "auto",
  tooltip,
  className,
}: ClubBadgeProps) {
  if (!klub) return null;

  const px = SIZE_PX[size];
  const entry = CLUB_LOGOS[klub];
  const color = clubColor ?? KLUB_COLORS[klub] ?? "var(--muted-foreground)";
  const shortLabel = KLUB_LABELS[klub] ?? klub;
  const fullName = clubName ?? entry?.name ?? tooltip ?? shortLabel;
  const title = tooltip ?? fullName;

  const renderChip = variant === "chip" || (variant === "auto" && !entry);

  if (renderChip) {
    // No logo on file (or caller asked for chip explicitly). Colored pill
    // with the klub short label so identity stays legible.
    const padding =
      size === "xs" ? "1px 5px" : size === "lg" ? "4px 11px" : size === "md" ? "3px 9px" : "2px 7px";
    const fontSize = size === "xs" ? 9 : size === "lg" ? 13 : size === "md" ? 12 : 10.5;
    return (
      <span
        title={title}
        aria-label={fullName}
        className={`inline-flex items-center gap-1 rounded-sm font-mono font-semibold leading-none align-middle${className ? ` ${className}` : ""}`}
        style={{
          padding,
          fontSize,
          background: `${color}1a`,
          color,
          border: `1px solid ${color}55`,
        }}
      >
        <span
          className="inline-block rounded-full"
          style={{ width: 6, height: 6, background: color }}
          aria-hidden
        />
        {shortLabel}
      </span>
    );
  }

  // Logo path. When CLUB_LOGOS has an entry render the image; otherwise
  // (variant="logo" forced) draw an initials chip in club color so atlas
  // sankey/heatmap headers still look right when a logo is missing.
  const logo = entry ? (
    <Image
      src={`/club-logos/${entry.file}`}
      alt={fullName}
      title={title}
      width={px}
      height={px}
      className="object-contain rounded-sm"
      style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      unoptimized
    />
  ) : (
    <span
      title={title}
      aria-label={fullName}
      className="inline-flex items-center justify-center font-sans"
      style={{
        width: px,
        height: px,
        borderRadius: 4,
        background: color,
        color: "var(--background)",
        fontSize: px * 0.4,
        fontWeight: 600,
        letterSpacing: "0.02em",
      }}
    >
      {PLACEHOLDER_INITIALS[klub] ?? klub.slice(0, 2).toUpperCase()}
    </span>
  );

  if (!withLabel) {
    return (
      <span
        title={title}
        className={`inline-flex items-center align-middle${className ? ` ${className}` : ""}`}
      >
        {logo}
      </span>
    );
  }

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 align-middle${className ? ` ${className}` : ""}`}
    >
      {logo}
      <span className="font-mono text-[11px] text-secondary-foreground">{shortLabel}</span>
    </span>
  );
}
