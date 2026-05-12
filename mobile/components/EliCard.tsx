import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "@/lib/format";
import type { EliInforcePayload } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export function EliCard({
  payload,
  sourceUrl,
}: {
  payload: EliInforcePayload;
  sourceUrl: string;
}) {
  const title = payload.short_title ?? payload.title;

  function onPress() {
    if (sourceUrl) WebBrowser.openBrowserAsync(sourceUrl);
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
      <View style={styles.head}>
        <Text style={styles.kicker}>
          {payload.publisher} {payload.year}/{payload.position}
        </Text>
        {payload.legal_status_date ? (
          <Text style={styles.date}>od {formatShortDate(payload.legal_status_date)}</Text>
        ) : null}
      </View>
      <Text style={styles.title}>{title}</Text>
      {payload.display_address ? (
        <Text style={styles.addr}>
          {payload.display_address} · {payload.type}
        </Text>
      ) : null}
      {payload.keywords && payload.keywords.length > 0 ? (
        <View style={styles.tags}>
          {payload.keywords.slice(0, 5).map((k) => (
            <View key={k} style={styles.chip}>
              <Text style={styles.chipText}>{k}</Text>
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
  kicker: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, letterSpacing: 1, color: colors.accent },
  date: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  title: { fontFamily: fonts.serif, fontSize: fontSize.md, lineHeight: fontSize.md * 1.3, color: colors.ink },
  addr: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingVertical: 3,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  chipText: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, color: colors.inkSoft },
});
