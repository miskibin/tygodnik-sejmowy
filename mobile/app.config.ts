import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";

// EAS CLI evaluates this config in a context that does not auto-load
// mobile/.env (only the dev/build runtime does). Pull it in explicitly
// so `eas init`, `eas build`, and `expo config` all see the same vars
// the dev server reads. EAS-managed env vars (set via `eas env:create`)
// still win — process.env is honored as-is when already populated.
const envPath = join(__dirname, ".env");
if (existsSync(envPath)) loadDotenv({ path: envPath });

// EAS builds bake EXPO_PUBLIC_* into the JS bundle at build time.
// Fail loud at config-evaluation time if either var is missing —
// silent fallbacks previously masked CI misconfig and shipped
// production-pointing binaries with no error.
function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is required (set in mobile/.env or EAS env). See mobile/.env.example.`,
    );
  }
  return v;
}

const config: ExpoConfig = {
  name: "Sejmograf",
  slug: "sejmograf",
  scheme: "sejmograf",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  android: {
    package: "pl.sejmograf.app",
    versionCode: 1,
    adaptiveIcon: {
      backgroundColor: "#f4efe4",
    },
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "pl.sejmograf.app",
  },
  plugins: [
    "expo-router",
    "expo-font",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    supabaseUrl: requiredEnv("EXPO_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requiredEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY"),
    eas: {
      projectId: "9db152fa-dde5-4745-8de0-18dbfe813af9",
    },
  },
};

export default config;
