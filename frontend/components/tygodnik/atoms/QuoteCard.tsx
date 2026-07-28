import { MPAvatarPhoto } from "@/components/tygodnik/MPAvatar";
import { ClubBadge } from "@/components/clubs/ClubBadge";
import { Kicker } from "./SectionHead";

// Editorial mini-card showing a viral pull-quote with speaker attribution.
// Used in /posiedzenie agenda rows when a point has no associated voting.

export function QuoteCard({
  text,
  speaker,
  speakerFunction,
  club,
  viralScore,
}: {
  text: string;
  speaker: string;
  speakerFunction?: string | null;
  club?: string | null;
  viralScore?: string | null;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderLeft: "3px solid var(--destructive-deep)",
        background: "var(--secondary)",
      }}
    >
      <Kicker className="mb-2">
        cytat punktu{viralScore ? ` · viral ${viralScore}` : ""}
      </Kicker>
      <p
        className="italic m-0 mb-2.5"
        style={{
          fontSize: 15,
          lineHeight: 1.4,
          color: "var(--foreground)",
          textWrap: "pretty",
        }}
      >
        „{text}”
      </p>
      <div className="flex items-center gap-2 flex-wrap">
        <MPAvatarPhoto name={speaker} size={28} />
        <div
          className="font-sans"
          style={{ fontSize: 11.5, color: "var(--secondary-foreground)" }}
        >
          <b style={{ color: "var(--foreground)" }}>{speaker}</b>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            {speakerFunction && (
              <span style={{ color: "var(--muted-foreground)" }}>{speakerFunction}</span>
            )}
            {club && <ClubBadge klub={club} size="xs" />}
          </div>
        </div>
      </div>
    </div>
  );
}
