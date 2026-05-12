import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { TOPIC_ICON, TOPIC_LABEL } from "@/lib/profile";
import {
  affectedGroupLabel,
  processChip,
  type LinkedVoting,
  type PrintEvent,
} from "@/lib/types";
import { colors, fonts, fontSize, spacing } from "@/theme";

// Short status label for the eyebrow row (e.g. "MIESZKANIE · PRZYJĘTA").
// processChip returns longer labels suited for chips; here we want one word.
function shortStatus(stageType: string | null | undefined, passed: boolean | null | undefined): string | null {
  if (passed) return "PRZYJĘTA";
  switch (stageType) {
    case "PresidentSignature":
    case "ToPresident":
      return "U PREZYDENTA";
    case "Veto":
      return "WETO";
    case "SenatePosition":
    case "SenatePositionConsideration":
      return "W SENACIE";
    case "CommitteeReport":
      return "SPRAWOZDANIE";
    case "ThirdReading":
      return "III CZYTANIE";
    case "SecondReading":
      return "II CZYTANIE";
    case "FirstReading":
    case "Reading":
    case "SejmReading":
    case "ReadingReferral":
      return "I CZYTANIE";
    case "CommitteeWork":
    case "Referral":
      return "W KOMISJI";
    default:
      return null;
  }
}

function formatPopulation(n: number | null | undefined): string | null {
  if (!n || n <= 0) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")} mln`;
  if (n >= 1_000) return `${Math.round(n / 1_000)} tys.`;
  return String(n);
}

function severityLabel(sev: "low" | "medium" | "high"): string {
  return sev === "high" ? "WYSOKI" : sev === "medium" ? "ŚREDNI" : "NISKI";
}

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
  const topTopic = (p.topic_tags ?? []).find((t) => !!TOPIC_LABEL[t]) ?? null;
  const topicEyebrow = topTopic ? TOPIC_LABEL[topTopic].toUpperCase() : null;
  const topicIcon = topTopic ? TOPIC_ICON[topTopic] ?? null : null;
  const status = shortStatus(p.current_stage_type, p.process_passed) ?? processChip(p.current_stage_type, p.process_passed)?.label.toUpperCase();
  const statusKind = p.process_passed ? "ok" : processChip(p.current_stage_type, p.process_passed)?.kind ?? "info";

  const topAffected = [...(p.affected_groups ?? [])]
    .filter((g) => g.est_population && g.est_population > 0)
    .sort((a, b) => (b.est_population ?? 0) - (a.est_population ?? 0))[0]
    ?? (p.affected_groups ?? [])[0]
    ?? null;
  const populationLabel = topAffected ? formatPopulation(topAffected.est_population) : null;

  return (
    <Pressable
      onPress={() => router.push(`/druk/${event.term}/${p.number}`)}
      style={({ pressed }) => [
        styles.card,
        highlighted && styles.cardHighlighted,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.eyebrowRow}>
        {topicIcon ? (
          <Text style={styles.topicIcon}>{topicIcon}</Text>
        ) : null}
        {topicEyebrow ? (
          <Text style={styles.topic}>{topicEyebrow}</Text>
        ) : null}
        {topicEyebrow && status ? <Text style={styles.dot}> · </Text> : null}
        {status ? (
          <Text style={[styles.status, statusKind === "ok" ? styles.statusOk : statusKind === "warn" ? styles.statusWarn : styles.statusInfo]}>
            {status}
          </Text>
        ) : null}
      </View>

      <Text style={styles.title}>{title}</Text>

      {p.summary_plain || p.impact_punch ? (
        <Text style={styles.body} numberOfLines={4}>
          {(p.summary_plain ?? p.impact_punch ?? "").replace(/[*_#`]/g, "")}
        </Text>
      ) : null}

      {p.citizen_action || p.impact_punch ? (
        <View style={styles.callout}>
          <Text style={styles.calloutLabel}>DOTYCZY CIĘ, JEŚLI</Text>
          <Text style={styles.calloutText} numberOfLines={3}>
            „{(p.citizen_action ?? p.impact_punch ?? "").replace(/[*_#`]/g, "")}"
          </Text>
        </View>
      ) : null}

      {topAffected ? (
        <View style={styles.kpiStrip}>
          <View style={styles.kpiCol}>
            <Text style={styles.kpiKicker}>DOTKNIĘTYCH</Text>
            <Text style={styles.kpiValue}>
              {populationLabel ?? "—"}
              {populationLabel ? <Text style={styles.kpiUnit}> osób</Text> : null}
            </Text>
            <Text style={styles.kpiSub}>{affectedGroupLabel(topAffected.tag).toLowerCase()}</Text>
          </View>
          <View style={styles.kpiCol}>
            <Text style={styles.kpiKicker}>WPŁYW</Text>
            <Text style={styles.kpiValue}>{severityLabel(topAffected.severity)}</Text>
            <Text style={styles.kpiSub}>ocena redakcyjna</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.footerMeta}>
        druk {p.number}
        {voting ? ` · głos. #${voting.votingNumber}` : ""}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  cardHighlighted: { backgroundColor: colors.card },
  eyebrowRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  topicIcon: {
    fontSize: fontSize.md,
    color: colors.accent,
    marginRight: spacing.xs,
    lineHeight: fontSize.md,
  },
  topic: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, letterSpacing: 1.4, color: colors.accent },
  dot: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  status: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, letterSpacing: 1.4 },
  statusOk: { color: colors.success },
  statusWarn: { color: colors.destructive },
  statusInfo: { color: colors.inkSoft },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.xl,
    lineHeight: fontSize.xl * 1.2,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.6,
    color: colors.inkSoft,
  },
  callout: {
    backgroundColor: "#f4e3a8",
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    gap: 6,
  },
  calloutLabel: {
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  calloutText: {
    fontFamily: fonts.serifRegular,
    fontStyle: "italic",
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.5,
    color: colors.ink,
  },
  kpiStrip: {
    flexDirection: "row",
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xl,
  },
  kpiCol: { flex: 1, gap: 4 },
  kpiKicker: { fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.4, color: colors.inkMuted },
  kpiValue: { fontFamily: fonts.serif, fontSize: fontSize.lg, color: colors.accent },
  kpiUnit: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  kpiSub: { fontFamily: fonts.sans, fontSize: 10, color: colors.inkMuted },
  footerMeta: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.inkMuted,
    marginTop: spacing.xs,
  },
});
