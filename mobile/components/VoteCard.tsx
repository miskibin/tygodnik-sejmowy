import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "@/lib/format";
import type { VoteEventPayload } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export function VoteCard({
  term,
  payload,
}: {
  term: number;
  payload: VoteEventPayload;
}) {
  const router = useRouter();
  const total = payload.yes + payload.no + payload.abstain;
  const yesPct = total > 0 ? (payload.yes / total) * 100 : 0;
  const noPct = total > 0 ? (payload.no / total) * 100 : 0;
  const absPct = total > 0 ? (payload.abstain / total) * 100 : 0;
  const linked = payload.linked_prints?.[0];
  const passed = payload.yes > payload.no;

  function onPress() {
    if (linked) router.push(`/druk/${term}/${linked.number}`);
    else WebBrowser.openBrowserAsync(`https://sejmograf.pl/glosowanie/${payload.voting_id}`);
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.head}>
        <Text style={styles.kicker}>GŁOSOWANIE NR {payload.voting_number}</Text>
        <Text style={styles.date}>{formatShortDate(payload.date)}</Text>
      </View>
      <Text style={styles.title} numberOfLines={3}>
        {payload.title}
      </Text>

      {linked?.impact_punch ? (
        <View style={styles.callout}>
          <Text style={styles.calloutLabel}>DOTYCZY CIĘ, JEŚLI</Text>
          <Text style={styles.calloutText} numberOfLines={3}>
            {linked.impact_punch.replace(/[*_#`]/g, "")}
          </Text>
        </View>
      ) : null}

      <View style={styles.bar}>
        <View style={[styles.seg, { backgroundColor: colors.success, flex: yesPct || 0.0001 }]} />
        <View style={[styles.seg, { backgroundColor: colors.inkMuted, flex: absPct || 0.0001 }]} />
        <View style={[styles.seg, { backgroundColor: colors.destructive, flex: noPct || 0.0001 }]} />
      </View>

      <View style={styles.legend}>
        <Text style={[styles.num, { color: colors.success }]}>{payload.yes} za</Text>
        <Text style={[styles.num, { color: colors.inkMuted }]}>{payload.abstain} wstrz.</Text>
        <Text style={[styles.num, { color: colors.destructive }]}>{payload.no} przeciw</Text>
      </View>

      <View style={styles.footer}>
        <View style={[styles.chip, passed ? styles.chipOk : styles.chipNo]}>
          <Text style={[styles.chipText, { color: passed ? colors.success : colors.destructive }]}>
            {passed ? "Przyjęto" : "Odrzucono"}
          </Text>
        </View>
        {linked ? (
          <Text style={styles.linked} numberOfLines={1}>
            druk {linked.number} · {linked.short_title ?? ""}
          </Text>
        ) : null}
      </View>
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
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  kicker: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, letterSpacing: 1, color: colors.accent },
  date: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  title: { fontFamily: fonts.serif, fontSize: fontSize.md, lineHeight: fontSize.md * 1.3, color: colors.ink },
  callout: {
    backgroundColor: colors.muted,
    padding: spacing.md,
    borderRadius: radius.sm,
    gap: 2,
  },
  calloutLabel: { fontFamily: fonts.sansBold, fontSize: 10, letterSpacing: 1.2, color: colors.accent },
  calloutText: { fontFamily: fonts.sans, fontSize: fontSize.sm, lineHeight: fontSize.sm * 1.4, color: colors.ink },
  bar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    backgroundColor: colors.muted,
  },
  seg: { height: "100%" },
  legend: { flexDirection: "row", justifyContent: "space-between" },
  num: { fontFamily: fonts.sansBold, fontSize: fontSize.xs },
  footer: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chip: { paddingVertical: 3, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  chipOk: { backgroundColor: "#e1ecdc" },
  chipNo: { backgroundColor: "#f0d8d4" },
  chipText: { fontFamily: fonts.sansBold, fontSize: fontSize.xs },
  linked: { flex: 1, fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
});
