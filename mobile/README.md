# Sejmograf — Android (Expo)

React Native MVP: onboarding + Tygodnik (prints only) + druk detail.

Talks to the same Supabase backend as `frontend/` (public reads, anon key).

## Run locally

```bash
cd mobile
npm install
# Copy your anon key into .env (already prefilled with the value from frontend/.env.local)
npx expo start --android
```

Requires Android Studio + an emulator OR a physical device with the Expo Go app
on the same network.

## Build APK

```bash
npx eas-cli build --platform android --profile preview
```

Produces an installable `.apk` you can side-load.

## Reset onboarding

App settings → clear app data, or call `resetOnboarding()` from `lib/onboarding.ts`.
