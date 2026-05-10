import Link from "next/link";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { MPAvatarPhoto } from "@/components/tygodnik/MPAvatar";
import { TopicChips, AddresseeChip } from "./TopicChips";
import { ToneBadge } from "./ToneBadge";
import { KLUB_LABELS } from "@/lib/atlas/constants";

// Magazine-hero photo. Render at desktop size; CSS scales down on mobile
// via the .ts-hero-avatar wrapper rule in globals.css. Keeps the layout
// from competing with the H1 on a 375px viewport.
const PHOTO_PX = 96;

export function StatementHero({
  speakerName,
  fn,
  klub,
  district,
  districtName,
  mpId,
  photoUrl,
  topicTags,
  tone,
  addressee,
  date,
  proceedingNumber,
  dayIdx,
}: {
  speakerName: string | null;
  fn: string | null;
  klub: string | null;
  district: number | null;
  districtName: string | null;
  mpId: number | null;
  photoUrl: string | null;
  topicTags: string[];
  tone: string | null;
  addressee: string | null;
  date: string | null;
  proceedingNumber: number | null;
  dayIdx: number | null;
}) {
  const dt = date
    ? new Date(date).toLocaleString("pl-PL", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";
  const sittingLine = proceedingNumber != null
    ? `Posiedzenie ${proceedingNumber}${dayIdx != null ? `, dzień ${dayIdx}` : ""}`
    : null;

  // Wrapper carries the oxblood-tinted halo: 1px paper offset then a 2px
  // ring at ~18% red opacity. Reads as an editorial frame, not a button.
  const photoEl = (
    <span
      className="ts-hero-avatar inline-block rounded-full"
      style={{
        boxShadow:
          "0 0 0 1px var(--muted), 0 0 0 2px color-mix(in srgb, var(--destructive) 18%, transparent)",
      }}
    >
      <MPAvatarPhoto name={speakerName} photoUrl={photoUrl} size={PHOTO_PX} />
    </span>
  );

  const klubLabel = klub ? (KLUB_LABELS[klub] ?? klub) : null;
  const districtText = district != null
    ? `okręg ${district}${districtName ? ` · ${districtName}` : ""}`
    : null;

  return (
    <header className="border-b border-border pb-4 mb-2">
      <div className="grid gap-4 md:gap-5 items-start grid-cols-[72px_1fr] md:grid-cols-[96px_1fr]">
        {mpId != null && mpId > 0 ? (
          <Link
            href={`/posel/${mpId}`}
            className="hover:opacity-90 transition-opacity rounded-full inline-block"
            aria-label={`Profil: ${speakerName ?? "poseł"}`}
          >
            {photoEl}
          </Link>
        ) : (
          photoEl
        )}
        <div className="min-w-0">
          <h1
            className="font-serif font-medium text-foreground m-0 mb-1.5 leading-[1.05]"
            style={{ fontSize: "clamp(1.5rem, 3vw, 2rem)", letterSpacing: "-0.02em" }}
          >
            {speakerName ?? "—"}
          </h1>
          {fn && (
            <div className="font-sans text-[12px] text-secondary-foreground mb-1.5">
              {fn}
            </div>
          )}
          {(klub || districtText) && (
            <div
              className="inline-flex items-center gap-2 mb-2 px-2 py-1 rounded-sm border border-border max-w-full"
              style={{ background: "var(--muted)" }}
            >
              {klub && (
                <ClubBadge
                  klub={klub}
                  size="md"
                  variant="logo"
                  tooltip={klub}
                />
              )}
              {klubLabel && (
                <span className="font-mono text-[10.5px] tracking-wide font-semibold text-foreground">
                  {klubLabel}
                </span>
              )}
              {districtText && (
                <>
                  <span className="text-border" aria-hidden>·</span>
                  <span className="font-sans text-[11px] text-muted-foreground truncate">
                    {districtText}
                  </span>
                </>
              )}
            </div>
          )}
          <div className="font-mono text-[10.5px] tracking-wide text-muted-foreground mb-2.5">
            {sittingLine && <>{sittingLine} · </>}{dt}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToneBadge tone={tone} />
            <AddresseeChip addressee={addressee} />
            <TopicChips tags={topicTags} />
          </div>
        </div>
      </div>
    </header>
  );
}
