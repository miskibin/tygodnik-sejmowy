"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { PATRONITE_SUPPORT_URL, trackPatroniteSupportClick } from "@/lib/analytics";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel" | "children"> & {
  /** Short id for GA4 breakdown, e.g. `masthead_desktop`. */
  placement: string;
  children: ReactNode;
};

/** One `gtag` event per tap — no beacons, no nav tracking. */
export function PatroniteTrackedLink({ placement, onClick, children, ...rest }: Props) {
  return (
    <a
      {...rest}
      href={PATRONITE_SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) trackPatroniteSupportClick(placement);
      }}
    >
      {children}
    </a>
  );
}
