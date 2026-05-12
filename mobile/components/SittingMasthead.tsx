import { StyleSheet, Text, View } from "react-native";

import { formatDateRange } from "@/lib/format";
import type { SittingInfo } from "@/lib/types";
import { colors, fonts, fontSize, spacing } from "@/theme";

export function SittingMasthead({ sitting }: { sitting: SittingInfo }) {
  return (
    <View style={styles.root}>
      <Text style={styles.eyebrow}>
        WYD. {sitting.sittingNum} · {sitting.printCount} DRUKÓW
      </Text>
      <Text style={styles.title}>Tygodnik</Text>
      <Text style={styles.range}>{formatDateRange(sitting.firstDate, sitting.lastDate)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.sm,
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
    letterSpacing: -0.5,
  },
  range: { fontFamily: fonts.serifRegular, fontSize: fontSize.sm, color: colors.inkMuted, fontStyle: "italic" },
});
