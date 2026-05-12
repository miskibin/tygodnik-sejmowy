import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "@/lib/format";
import { TOPIC_LABEL } from "@/lib/profile";
import type { ViralQuotePayload } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export function ViralQuoteCard({
  payload,
}: {
  payload: ViralQuotePayload;
}) {
  const topics = (payload.topic_tags ?? []).filter((t) => !!TOPIC_LABEL[t]).slice(0, 3);
  function onPress() {
    WebBrowser.openBrowserAsync(`https://sejmograf.pl/mowa/${payload.statement_id}`);
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.head}>
        <Text style={styles.speaker}>{payload.speaker_name}</Text>
        <Text style={styles.date}>{formatShortDate(payload.date)}</Text>
      </View>
      {payload.function ? <Text style={styles.fn}>{payload.function}</Text> : null}
      {payload.viral_quote ? (
        <View style={styles.quoteWrap}>
          <Text style={styles.quoteMark}>“</Text>
          <Text style={styles.quote}>{payload.viral_quote}</Text>
        </View>
      ) : null}
      {payload.summary_one_line ? (
        <Text style={styles.summary} numberOfLines={2}>
          {payload.summary_one_line}
        </Text>
      ) : null}
      {topics.length > 0 ? (
        <View style={styles.tags}>
          {topics.map((t) => (
            <View key={t} style={styles.chip}>
              <Text style={styles.chipText}>{TOPIC_LABEL[t]}</Text>
            </View>
          ))}
        </View>
      ) : null}
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
  speaker: { fontFamily: fonts.sansBold, fontSize: fontSize.sm, color: colors.ink },
  date: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  fn: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  quoteWrap: {
    borderLeftWidth: 3,
    borderLeftColor: colors.destructive,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
    position: "relative",
  },
  quoteMark: {
    position: "absolute",
    top: -4,
    left: 8,
    fontFamily: fonts.serif,
    fontSize: 44,
    color: colors.destructive,
    opacity: 0.18,
  },
  quote: {
    fontFamily: fonts.serifRegular,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.4,
    color: colors.ink,
    fontStyle: "italic",
  },
  summary: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  chipText: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, color: colors.inkSoft },
});
