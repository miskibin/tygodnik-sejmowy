"use client";

import { Masthead } from "./Masthead";

// Masthead now shows on every route including landing — keeps brand chrome
// consistent and lets the landing focus on the entry-point form below.
export function ChromeSlot() {
  return <Masthead />;
}
