import { useQuery } from "@tanstack/react-query";
import { Redirect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { getLatestSittingWithEvents } from "@/lib/queries/tygodnik";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export default function TygodnikIndex() {
  const router = useRouter();
  const q = useQuery({
    queryKey: ["latest-sitting", 10],
    queryFn: () => getLatestSittingWithEvents(10),
  });

  if (q.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (q.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>Nie udało się pobrać danych.</Text>
        <Text style={styles.errDetail}>{(q.error as Error)?.message ?? ""}</Text>
        <Pressable onPress={() => q.refetch()} style={styles.retry}>
          <Text style={styles.retryText}>Spróbuj ponownie</Text>
        </Pressable>
      </View>
    );
  }

  if (!q.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.errText}>Brak posiedzeń.</Text>
      </View>
    );
  }

  return <Redirect href={`/tygodnik/${q.data.sittingNum}`} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  errText: { fontFamily: fonts.serif, fontSize: fontSize.lg, color: colors.ink },
  errDetail: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.inkMuted, textAlign: "center" },
  retry: {
    marginTop: spacing.md,
    backgroundColor: colors.ink,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  retryText: { color: colors.paper, fontFamily: fonts.sansBold },
});
