import "server-only";

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Minimal shared-password gate for /admin/*. No accounts, no session store:
// the cookie carries an HMAC of a fixed subject keyed by the password, so the
// password itself never leaves the server and a leaked cookie cannot be turned
// back into it. Rotating ETL_DASHBOARD_PASSWORD invalidates every cookie.

export const ETL_COOKIE_NAME = "etl_session";
export const ETL_COOKIE_PATH = "/admin";
const ETL_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const TOKEN_SUBJECT = "tygodnik-sejmowy:etl-dashboard:v1";

/** Configured dashboard password, or null when the feature is not deployed. */
export function etlPassword(): string | null {
  const raw = process.env.ETL_DASHBOARD_PASSWORD;
  if (!raw || raw.trim() === "") return null;
  return raw;
}

/** Cookie value for a password: hex HMAC-SHA256(TOKEN_SUBJECT) keyed by it. */
function sessionToken(password: string): string {
  return createHmac("sha256", password).update(TOKEN_SUBJECT).digest("hex");
}

// Compare via fixed-length digests so timingSafeEqual never sees mismatched
// buffer lengths (it throws) and the length itself leaks nothing.
function constantTimeEquals(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

export function checkPassword(submitted: string): boolean {
  const expected = etlPassword();
  if (!expected) return false;
  return constantTimeEquals(submitted, expected);
}

/** True when the request carries a cookie matching the current password. */
export async function hasEtlSession(): Promise<boolean> {
  const expected = etlPassword();
  if (!expected) return false;
  const cookie = (await cookies()).get(ETL_COOKIE_NAME)?.value;
  if (!cookie) return false;
  return constantTimeEquals(cookie, sessionToken(expected));
}

export async function setEtlSession(password: string): Promise<void> {
  (await cookies()).set(ETL_COOKIE_NAME, sessionToken(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: ETL_COOKIE_PATH,
    maxAge: ETL_COOKIE_MAX_AGE,
  });
}

export async function clearEtlSession(): Promise<void> {
  (await cookies()).set(ETL_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: ETL_COOKIE_PATH,
    maxAge: 0,
  });
}
