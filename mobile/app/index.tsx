import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import { hasSeenOnboarding } from "@/lib/profile";
import { colors } from "@/theme";

export default function Index() {
  const [target, setTarget] = useState<"onboarding" | "tygodnik" | null>(null);

  useEffect(() => {
    let cancelled = false;
    hasSeenOnboarding().then((seen) => {
      if (cancelled) return;
      setTarget(seen ? "tygodnik" : "onboarding");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!target) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return <Redirect href={target === "onboarding" ? "/onboarding" : "/tygodnik"} />;
}
