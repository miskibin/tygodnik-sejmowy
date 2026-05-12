import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { BottomTabs } from "@/components/BottomTabs";
import { formatDateRange } from "@/lib/format";
import { getSittingsIndex } from "@/lib/queries/tygodnik";
import type { SittingInfo } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export default function Archive() {
  const router = useRouter();
  const q = useQuery({ queryKey: ["sittings-index", 10], queryFn: () => getSittingsIndex(10) });

  if (q.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <FlatList
        data={q.data ?? []}
        keyExtractor={(s) => String(s.sittingNum)}
        renderItem={({ item }) => <Row sitting={item} onPress={() => router.push(`/tygodnik/${item.sittingNum}`)} />}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={{ fontFamily: fonts.sans, color: colors.inkMuted }}>Brak wydań.</Text>
          </View>
        }
      />
      <BottomTabs />
    </View>
  );
}

function Row({ sitting, onPress }: { sitting: SittingInfo; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <View style={styles.num}>
        <Text style={styles.numText}>{sitting.sittingNum}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.range}>{formatDateRange(sitting.firstDate, sitting.lastDate)}</Text>
        <Text style={styles.count}>{sitting.eventCount} pozycji · {sitting.printCount} druków</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  num: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { fontFamily: fonts.sansBold, fontSize: fontSize.md, color: colors.paper },
  range: { fontFamily: fonts.serif, fontSize: fontSize.base, color: colors.ink },
  count: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted, marginTop: 2 },
});
