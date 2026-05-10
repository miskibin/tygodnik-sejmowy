// Shim — kept for one cycle while callsites migrate to the unified
// components/clubs/ClubBadge. New code MUST import ClubBadge directly.
import { ClubBadge } from "@/components/clubs/ClubBadge";

export function ClubLogo({
  clubRef,
  clubColor,
  clubName,
  size = 28,
}: {
  clubRef: string;
  clubColor: string;
  clubName: string;
  size?: number;
}) {
  // Old API took numeric size; map to the closest token.
  const sizeToken = size <= 14 ? "xs" : size <= 18 ? "sm" : size <= 22 ? "md" : "lg";
  return (
    <ClubBadge
      klub={clubRef}
      clubColor={clubColor}
      clubName={clubName}
      size={sizeToken}
      variant="logo"
    />
  );
}
