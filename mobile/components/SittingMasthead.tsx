import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatDateRange } from "@/lib/format";
import type { SittingInfo } from "@/lib/types";
import { colors, fonts, fontSize, spacing } from "@/theme";

export function SittingMasthead({ sitting }: { sitting: SittingInfo }) {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>TYGODNIK SEJMOWY</Text>
      <Text style={styles.title}>Wydanie nr {sitting.sittingNum}</Text>
      <Text style={styles.range}>{formatDateRange(sitting.firstDate, sitting.lastDate)}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>{sitting.printCount} druków</Text>
        <Text style={styles.dot}>·</Text>
        <Pressable onPress={() => router.push("/tygodnik/archive")} hitSlop={8}>
          <Text style={styles.link}>Archiwum</Text>
        </Pressable>
        <Text style={styles.dot}>·</Text>
        <Pressable onPress={() => router.push("/preferencje" as never)} hitSlop={8}>
          <Text style={styles.link}>Preferencje</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.xxl,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  range: {
    fontFamily: fonts.serifRegular,
    fontSize: fontSize.md,
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  meta: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.inkMuted },
  dot: { color: colors.inkMuted },
  link: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.sm,
    color: colors.ink,
    textDecorationLine: "underline",
  },
});
