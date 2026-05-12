import AsyncStorage from "@react-native-async-storage/async-storage";

export type Profile = {
  postcode: string | null;
  topics: string[];
};

const KEY_SEEN = "sejmograf:onboarding-seen";
const KEY_PROFILE = "sejmograf:profile";

export const DEFAULT_PROFILE: Profile = { postcode: null, topics: [] };

// Per-topic visual identity via glyph icons. Mirrors frontend/lib/topics.ts.
// Icons stay in the same accent color as the rest of the eyebrow so the
// newspaper feel holds — only the symbol changes per topic.
export const TOPICS: { id: string; label: string; icon: string }[] = [
  { id: "zdrowie",              label: "Zdrowie",              icon: "✚" },
  { id: "edukacja-rodzina",     label: "Edukacja i rodzina",   icon: "✦" },
  { id: "praca-zus",            label: "Praca i ZUS",          icon: "⚒" },
  { id: "emerytury",            label: "Emerytury",            icon: "◷" },
  { id: "mieszkanie-media",     label: "Mieszkanie",           icon: "⌂" },
  { id: "biznes-podatki",       label: "Biznes i podatki",     icon: "◧" },
  { id: "transport",            label: "Transport",            icon: "◎" },
  { id: "srodowisko-klimat",    label: "Środowisko i klimat",  icon: "❀" },
  { id: "rolnictwo-wies",       label: "Rolnictwo i wieś",     icon: "☘" },
  { id: "sady-prawa",           label: "Sądy i prawo",         icon: "⚖" },
  { id: "bezpieczenstwo-obrona", label: "Bezpieczeństwo",      icon: "⛨" },
];

export const TOPIC_LABEL: Record<string, string> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t.label]),
);

export const TOPIC_ICON: Record<string, string> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t.icon]),
);

export async function hasSeenOnboarding(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY_SEEN)) === "1";
  } catch {
    return false;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  await AsyncStorage.setItem(KEY_SEEN, "1");
}

export async function resetOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(KEY_SEEN);
}

export async function getProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PROFILE);
    if (!raw) return DEFAULT_PROFILE;
    const parsed = JSON.parse(raw) as Partial<Profile>;
    return {
      postcode: parsed.postcode ?? null,
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter((t) => typeof t === "string") : [],
    };
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function setProfile(p: Profile): Promise<void> {
  await AsyncStorage.setItem(KEY_PROFILE, JSON.stringify(p));
}

export async function resetAll(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_SEEN, KEY_PROFILE]);
}

const POSTCODE_RE = /^\d{2}-\d{3}$/;
export function isValidPostcode(s: string): boolean {
  return POSTCODE_RE.test(s);
}

export function formatPostcodeInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 5);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}
