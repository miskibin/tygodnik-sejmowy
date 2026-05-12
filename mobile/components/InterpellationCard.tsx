import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "@/lib/format";
import type { LateInterpellationPayload } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export function InterpellationCard({
  payload,
  sourceUrl,
}: {
  payload: LateInterpellationPayload;
  sourceUrl: string;
}) {
  const kindLabel = payload.kind === "interpellation" ? "Interpelacja" : "Zapytanie";
  const recipient = payload.recipient_titles?.[0] ?? "—";
  const primary = payload.authors?.[0]?.first_last_name ?? null;
  const extra = (payload.authors ?? []).length - 1;

  function onPress() {
    if (sourceUrl) WebBrowser.openBrowserAsync(sourceUrl);
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.head}>
        <View style={styles.delay}>
          <Text style={styles.delayNum}>{payload.answer_delayed_days}</Text>
          <Text style={styles.delayLabel}>dni opóźnienia</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>
            {kindLabel.toUpperCase()} {payload.num}
          </Text>
          <Text style={styles.date}>wysłana {formatShortDate(payload.sent_date)}</Text>
        </View>
      </View>
      <Text style={styles.title} numberOfLines={4}>
        {payload.title}
      </Text>
      <Text style={styles.recipient}>do: {recipient}</Text>
      {primary ? (
        <Text style={styles.author}>
          {primary}
          {extra > 0 ? ` + ${extra} ${extra === 1 ? "współautor" : "współautorów"}` : ""}
        </Text>
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
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  delay: {
    width: 64,
    paddingVertical: spacing.xs,
    alignItems: "center",
    backgroundColor: "#f0d8d4",
    borderRadius: radius.sm,
  },
  delayNum: { fontFamily: fonts.serif, fontSize: fontSize.xl, color: colors.destructive, lineHeight: fontSize.xl },
  delayLabel: { fontFamily: fonts.sans, fontSize: 9, color: colors.destructive, letterSpacing: 0.3 },
  kicker: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, letterSpacing: 1, color: colors.accent },
  date: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted, marginTop: 2 },
  title: { fontFamily: fonts.serif, fontSize: fontSize.md, lineHeight: fontSize.md * 1.3, color: colors.ink },
  recipient: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, color: colors.destructive, letterSpacing: 0.6 },
  author: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
});
