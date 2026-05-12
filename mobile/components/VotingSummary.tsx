import { StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "@/lib/format";
import type { LinkedVoting } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export function VotingSummary({ voting }: { voting: LinkedVoting }) {
  const total = voting.yes + voting.no + voting.abstain;
  const yesPct = total > 0 ? (voting.yes / total) * 100 : 0;
  const noPct = total > 0 ? (voting.no / total) * 100 : 0;
  const abstainPct = total > 0 ? (voting.abstain / total) * 100 : 0;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{voting.title}</Text>
      <Text style={styles.meta}>
        Głosowanie nr {voting.votingNumber} · {formatShortDate(voting.date)}
      </Text>
      <View style={styles.bar}>
        <View style={[styles.seg, styles.yes, { flex: yesPct || 0.0001 }]} />
        <View style={[styles.seg, styles.abstain, { flex: abstainPct || 0.0001 }]} />
        <View style={[styles.seg, styles.no, { flex: noPct || 0.0001 }]} />
      </View>
      <View style={styles.legend}>
        <Cell label="Za" value={voting.yes} color={colors.success} />
        <Cell label="Wstrzymało" value={voting.abstain} color={colors.inkMuted} />
        <Cell label="Przeciw" value={voting.no} color={colors.destructive} />
      </View>
    </View>
  );
}

function Cell({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.cell}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.cellLabel}>{label}</Text>
      <Text style={styles.cellValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  title: { fontFamily: fonts.serif, fontSize: fontSize.md, color: colors.ink },
  meta: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: colors.muted,
    marginTop: spacing.xs,
  },
  seg: { height: "100%" },
  yes: { backgroundColor: colors.success },
  no: { backgroundColor: colors.destructive },
  abstain: { backgroundColor: colors.inkMuted },
  legend: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.xs,
  },
  cell: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  cellLabel: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkSoft },
  cellValue: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, color: colors.ink },
});
