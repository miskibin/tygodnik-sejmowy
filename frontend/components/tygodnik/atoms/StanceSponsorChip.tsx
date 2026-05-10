import { sponsorAuthorityLabel } from "@/lib/labels";

// Sponsor strip — stance pill removed 2026-05-10.
//
// The bare "rozszerza/ogranicza" verb without a direct object reads as AI
// slop on every card (citizen review found 8/8 cards displaying it). The
// chip needs a `stance_object` field from enrichment ("rozszerza prawa
// ucznia") before it can be rendered honestly. Until that ETL change
// lands, only the sponsor is shown.
//
// Props for `stance`/`stanceConfidence` kept so callers don't have to
// change while the enrichment story catches up.

export function StanceSponsorChip({
  stance: _stance,
  stanceConfidence: _stanceConfidence,
  sponsorAuthority,
}: {
  stance: string | null;
  stanceConfidence: number | null;
  sponsorAuthority: string | null;
}) {
  const sponsorText = sponsorAuthorityLabel(sponsorAuthority);
  if (!sponsorText) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3 font-sans text-[11px]">
      <span className="inline-flex items-center gap-1.5 text-secondary-foreground">
        <span className="font-mono text-[9px] tracking-[0.14em] uppercase text-muted-foreground">
          wniósł
        </span>
        <span>{sponsorText}</span>
      </span>
    </div>
  );
}
