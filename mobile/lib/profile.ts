import AsyncStorage from "@react-native-async-storage/async-storage";

export type Profile = {
  postcode: string | null;
  topics: string[];
};

const KEY_SEEN = "sejmograf:onboarding-seen";
const KEY_PROFILE = "sejmograf:profile";

export const DEFAULT_PROFILE: Profile = { postcode: null, topics: [] };

export const TOPICS: { id: string; label: string }[] = [
  { id: "zdrowie", label: "Zdrowie" },
  { id: "edukacja-rodzina", label: "Edukacja i rodzina" },
  { id: "praca-zus", label: "Praca i ZUS" },
  { id: "emerytury", label: "Emerytury" },
  { id: "mieszkanie-media", label: "Mieszkanie" },
  { id: "biznes-podatki", label: "Biznes i podatki" },
  { id: "transport", label: "Transport" },
  { id: "srodowisko-klimat", label: "Środowisko i klimat" },
  { id: "rolnictwo-wies", label: "Rolnictwo i wieś" },
  { id: "sady-prawa", label: "Sądy i prawo" },
  { id: "bezpieczenstwo-obrona", label: "Bezpieczeństwo" },
];

export const TOPIC_LABEL: Record<string, string> = Object.fromEntries(
  TOPICS.map((t) => [t.id, t.label]),
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
