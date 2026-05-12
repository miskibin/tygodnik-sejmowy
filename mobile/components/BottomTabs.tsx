import { useRouter, usePathname } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";

import { colors, fonts, fontSize, spacing } from "@/theme";

type TabId = "decyzje" | "posel";

const TABS: { id: TabId; label: string; href: string; match: RegExp }[] = [
  { id: "decyzje", label: "Decyzje", href: "/tygodnik", match: /^\/(tygodnik|druk)/ },
  { id: "posel", label: "Mój poseł", href: "/posel", match: /^\/posel/ },
];

export function BottomTabs() {
  const router = useRouter();
  const path = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {TABS.map((t) => {
        const active = t.match.test(path);
        return (
          <Pressable
            key={t.id}
            onPress={() => router.push(t.href as never)}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.6 }]}
            hitSlop={6}
          >
            <View style={styles.icon}>
              <TabIcon id={t.id} color={active ? colors.accent : colors.inkMuted} />
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function TabIcon({ id, color }: { id: TabId; color: string }) {
  if (id === "decyzje") {
    return (
      <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
        <Rect x="3.5" y="3" width="15" height="16" rx="1.5" stroke={color} strokeWidth="1.6" />
        <Path d="M7 8 L15 8" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <Path d="M7 11 L15 11" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
        <Path d="M7 14 L12 14" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path
        d="M11 11.2 a3.4 3.4 0 1 0 0 -6.8 a3.4 3.4 0 0 0 0 6.8 z"
        stroke={color}
        strokeWidth="1.6"
      />
      <Path
        d="M4 19 c0 -3.7 3.2 -6 7 -6 c3.8 0 7 2.3 7 6"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.paper,
    paddingTop: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: spacing.xs,
  },
  icon: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  label: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: 2,
  },
  labelActive: {
    fontFamily: fonts.serifRegular,
    fontStyle: "italic",
    color: colors.accent,
  },
});
