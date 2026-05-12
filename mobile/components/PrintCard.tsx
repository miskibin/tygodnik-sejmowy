import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "@/lib/format";
import { TOPIC_LABEL } from "@/lib/profile";
import {
  SPONSOR_LABEL,
  affectedGroupLabel,
  processChip,
  type LinkedVoting,
  type PrintEvent,
} from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

const SEVERITY_COLOR: Record<"low" | "medium" | "high", string> = {
  low: "#e8e1d2",
  medium: "#f0d8c0",
  high: "#f0c4b8",
};

export function PrintCard({
  event,
  voting,
  highlighted,
}: {
  event: PrintEvent;
  voting?: LinkedVoting | null;
  highlighted?: boolean;
}) {
  const router = useRouter();
  const p = event.payload;
  const title = p.short_title || p.title;
  const sponsorKey = (p.sponsor_authority ?? null) as keyof typeof SPONSOR_LABEL | null;
  const sponsor = sponsorKey ? SPONSOR_LABEL[sponsorKey] ?? null : null;
  const topics = (p.topic_tags ?? []).filter((t) => !!TOPIC_LABEL[t]).slice(0, 4);
  const affected = (p.affected_groups ?? []).slice(0, 3);
  const stateChip = processChip(p.current_stage_type, p.process_passed);

  return (
    <Pressable
      onPress={() => router.push(`/druk/${event.term}/${p.number}`)}
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.cardHighlighted,
        pressed && { opacity: 0.7 },
      ]}
    >
      <View style={styles.head}>
        <Text style={styles.number}>Druk {p.number}</Text>
        {p.change_date ? <Text style={styles.date}>{formatShortDate(p.change_date)}</Text> : null}
      </View>

      <Text style={styles.title}>{title}</Text>

      {p.impact_punch ? (
        <Text style={styles.punch} numberOfLines={5}>
          {p.impact_punch.replace(/[*_#`]/g, "")}
        </Text>
      ) : null}

      {affected.length > 0 ? (
        <View style={styles.affectedRow}>
          {affected.map((g) => (
            <View
              key={g.tag}
              style={[styles.affectedChip, { backgroundColor: SEVERITY_COLOR[g.severity] }]}
            >
              <Text style={styles.affectedText}>{affectedGroupLabel(g.tag)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {p.citizen_action ? (
        <View style={styles.callout}>
          <Text style={styles.calloutLabel}>CO MOŻESZ ZROBIĆ</Text>
          <Text style={styles.calloutText} numberOfLines={3}>
            {p.citizen_action}
          </Text>
        </View>
      ) : null}

      {voting ? <VotingBar voting={voting} /> : null}

      <View style={styles.tags}>
        {sponsor ? (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{sponsor}</Text>
          </View>
        ) : null}
        {topics.map((t) => (
          <View key={t} style={[styles.chip, styles.chipTopic]}>
            <Text style={styles.chipText}>{TOPIC_LABEL[t]}</Text>
          </View>
        ))}
        {stateChip ? (
          <View
            style={[
              styles.chip,
              stateChip.kind === "ok" && styles.chipSuccess,
              stateChip.kind === "warn" && styles.chipWarn,
            ]}
          >
            <Text
              style={[
                styles.chipText,
                stateChip.kind === "ok" && { color: colors.success },
                stateChip.kind === "warn" && { color: colors.destructive },
              ]}
            >
              {stateChip.label}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

function VotingBar({ voting }: { voting: LinkedVoting }) {
  const total = voting.yes + voting.no + voting.abstain;
  const yesPct = total > 0 ? (voting.yes / total) * 100 : 0;
  const noPct = total > 0 ? (voting.no / total) * 100 : 0;
  const absPct = total > 0 ? (voting.abstain / total) * 100 : 0;
  return (
    <View style={styles.voting}>
      <View style={styles.votingHead}>
        <Text style={styles.votingLabel}>GŁOSOWANIE NR {voting.votingNumber}</Text>
        <Text style={styles.votingDate}>{formatShortDate(voting.date)}</Text>
      </View>
      <View style={styles.votingBar}>
        <View style={[styles.votingSeg, { backgroundColor: colors.success, flex: yesPct || 0.0001 }]} />
        <View style={[styles.votingSeg, { backgroundColor: colors.inkMuted, flex: absPct || 0.0001 }]} />
        <View style={[styles.votingSeg, { backgroundColor: colors.destructive, flex: noPct || 0.0001 }]} />
      </View>
      <View style={styles.votingLegend}>
        <Text style={[styles.votingNum, { color: colors.success }]}>{voting.yes} za</Text>
        <Text style={[styles.votingNum, { color: colors.inkMuted }]}>{voting.abstain} wstrz.</Text>
        <Text style={[styles.votingNum, { color: colors.destructive }]}>{voting.no} przeciw</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardHighlighted: { borderColor: colors.accent, borderWidth: 2 },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  number: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1,
    color: colors.accent,
  },
  date: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.3,
    color: colors.ink,
  },
  punch: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
    color: colors.inkSoft,
  },
  affectedRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  affectedChip: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  affectedText: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    color: colors.ink,
  },
  callout: {
    backgroundColor: colors.muted,
    padding: spacing.md,
    borderRadius: radius.sm,
    gap: 2,
  },
  calloutLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  calloutText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.4,
    color: colors.ink,
  },
  voting: {
    backgroundColor: colors.paper,
    borderRadius: radius.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  votingHead: { flexDirection: "row", justifyContent: "space-between" },
  votingLabel: { fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1, color: colors.inkMuted },
  votingDate: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  votingBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: colors.muted,
  },
  votingSeg: { height: "100%" },
  votingLegend: { flexDirection: "row", justifyContent: "space-between" },
  votingNum: { fontFamily: fonts.sansBold, fontSize: fontSize.xs },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  chipTopic: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border },
  chipSuccess: { backgroundColor: "#e1ecdc" },
  chipWarn: { backgroundColor: "#f0d8d4" },
  chipText: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, color: colors.inkSoft },
});
