import { StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, spacing } from "@/theme";

export function SectionHeader({
  icon,
  label,
  count,
}: {
  icon: string;
  label: string;
  count: number;
}) {
  return (
    <View style={styles.root}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: spacing.sm,
  },
  icon: { fontSize: fontSize.lg, color: colors.accent },
  label: {
    flex: 1,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.ink,
    textTransform: "uppercase",
  },
  count: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
});
