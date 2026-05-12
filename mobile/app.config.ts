import type { ExpoConfig } from "expo/config";

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
  },
};

export default config;
