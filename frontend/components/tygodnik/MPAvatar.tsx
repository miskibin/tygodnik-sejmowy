import Link from "next/link";
import { ClubBadge, type ClubBadgeProps } from "@/components/clubs/ClubBadge";

// Initials from full name; falls back to "?" for unknown speakers.
function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Photo-only round avatar primitive. Used both standalone (e.g. statement
// hero where name renders as H1 below) and inside MPAvatar.
export function MPAvatarPhoto({
  name,
  photoUrl,
  size = 36,
  shape = "circle",
}: {
  name: string | null | undefined;
  photoUrl?: string | null;
  size?: number;
  shape?: "circle" | "squircle";
}) {
  const radius = shape === "squircle" ? "0.5rem" : "9999px";
  return (
    <span
      className="relative inline-flex items-center justify-center overflow-hidden flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--muted)",
        border: "1px solid var(--border)",
      }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- Sejm photo CDN, no Next loader configured for it
        <img
          src={photoUrl}
          alt={name ?? "Poseł"}
          width={size}
          height={size}
          loading="lazy"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        <span
          className="font-mono font-semibold text-secondary-foreground"
          style={{ fontSize: Math.round(size * 0.32) }}
          aria-hidden
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}

export function MPAvatar({
  mpId,
  name,
  photoUrl,
  klub,
  district,
  size = 36,
  withClubBadge = true,
  shape = "circle",
  layout = "inline",
  clubBadgeSize,
}: {
  mpId?: number | null;
  name: string | null | undefined;
  photoUrl?: string | null;
  klub?: string | null;
  district?: number | null;
  size?: number;
  withClubBadge?: boolean;
  shape?: "circle" | "squircle";
  layout?: "inline" | "stacked";
  clubBadgeSize?: ClubBadgeProps["size"];
}) {
  const badgeSize: NonNullable<ClubBadgeProps["size"]> =
    clubBadgeSize ?? (layout === "stacked" ? "md" : "xs");
  const tooltip = [name, klub, district != null ? `okręg ${district}` : null]
    .filter(Boolean)
    .join(" · ");
  const inner = (
    <span
      className={
        layout === "stacked"
          ? "inline-flex flex-col items-start gap-1.5 min-w-0 w-full"
          : "inline-flex items-center gap-2 align-middle min-w-0"
      }
      title={tooltip || undefined}
    >
      <MPAvatarPhoto name={name} photoUrl={photoUrl} size={size} shape={shape} />
      <span
        className={`flex flex-col leading-tight min-w-0 ${layout === "stacked" ? "w-full" : ""}`}
      >
        <span
          className={
            layout === "stacked"
              ? "font-serif text-[14px] text-foreground break-words"
              : "font-serif text-[14px] text-foreground truncate"
          }
        >
          {name ?? "—"}
        </span>
        {withClubBadge && klub && (
          <span className={layout === "stacked" ? "mt-0.5" : "mt-0.5"}>
            <ClubBadge klub={klub} size={badgeSize} tooltip={`klub: ${klub}`} />
          </span>
        )}
      </span>
    </span>
  );
  if (mpId != null && mpId > 0) {
    return (
      <Link
        href={`/posel/${mpId}`}
        className="inline-block hover:opacity-80 transition-opacity"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
