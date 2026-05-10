// Shim — kept for one cycle while atlas callsites migrate to the unified
// components/clubs/ClubBadge. New code MUST import ClubBadge directly.
import { ClubBadge } from "@/components/clubs/ClubBadge";

type Props = {
  klub: string;
  size?: number;
  className?: string;
  withLabel?: boolean;
  /** Override the displayed label. Ignored — kept for back-compat. */
  label?: string;
  title?: string;
};

export function ClubLogo({ klub, size = 22, className, withLabel = false, title }: Props) {
  // Atlas uses numeric sizes (18/20/22/26/28). Map to the closest token.
  const sizeToken =
    size <= 14 ? "xs" : size <= 18 ? "sm" : size <= 22 ? "md" : "lg";
  return (
    <ClubBadge
      klub={klub}
      size={sizeToken}
      variant="logo"
      withLabel={withLabel}
      tooltip={title}
      className={className}
    />
  );
}
