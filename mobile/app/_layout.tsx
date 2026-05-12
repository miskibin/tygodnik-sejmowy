import {
  Inter_400Regular,
  Inter_600SemiBold,
  useFonts,
} from "@expo-google-fonts/inter";
import {
  SourceSerif4_400Regular,
  SourceSerif4_600SemiBold,
} from "@expo-google-fonts/source-serif-4";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { asyncStoragePersister, queryClient } from "@/lib/queryClient";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    SourceSerif4_400Regular,
    SourceSerif4_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontsError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontsError]);

  if (!fontsLoaded && !fontsError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.paper }}>
      <SafeAreaProvider>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: asyncStoragePersister, maxAge: 24 * 60 * 60 * 1000 }}
        >
          <StatusBar style="dark" backgroundColor={colors.paper} />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.paper },
              headerTintColor: colors.ink,
              headerTitleStyle: { fontFamily: "SourceSerif4_600SemiBold" },
              contentStyle: { backgroundColor: colors.paper },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ headerShown: false }} />
            <Stack.Screen name="tygodnik/index" options={{ headerShown: false }} />
            <Stack.Screen
              name="tygodnik/[sitting]"
              options={{ title: "Tygodnik Sejmowy" }}
            />
            <Stack.Screen name="tygodnik/archive" options={{ title: "Archiwum" }} />
            <Stack.Screen name="preferencje" options={{ title: "Preferencje" }} />
            <Stack.Screen
              name="druk/[term]/[number]"
              options={{ title: "Druk", headerBackTitle: "Wstecz" }}
            />
          </Stack>
        </PersistQueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
