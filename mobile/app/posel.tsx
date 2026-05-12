import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BottomTabs } from "@/components/BottomTabs";
import { getProfile } from "@/lib/profile";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export default function PoselScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profileQ = useQuery({ queryKey: ["profile"], queryFn: getProfile, staleTime: 0 });
  const postcode = profileQ.data?.postcode ?? null;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.lg }]}
      >
        <Text style={styles.eyebrow}>TWÓJ OKRĘG</Text>
        <Text style={styles.title}>Mój poseł</Text>

        {postcode ? (
          <View style={styles.card}>
            <Text style={styles.cardEyebrow}>KOD POCZTOWY</Text>
            <Text style={styles.cardCode}>{postcode}</Text>
            <Text style={styles.cardBody}>
              Mapowanie kod → okręg → posłowie pojawi się w kolejnej wersji aplikacji.
              Tymczasem zajrzyj do pełnego atlasu w wersji webowej.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardBody}>
              Nie masz jeszcze ustawionego kodu pocztowego. Po dodaniu pokażemy Ci posłów
              z Twojego okręgu i ich aktywność w Sejmie.
            </Text>
            <Pressable
              onPress={() => router.push("/preferencje" as never)}
              style={({ pressed }) => [styles.cta, pressed && { opacity: 0.8 }]}
            >
              <Text style={styles.ctaText}>Ustaw kod pocztowy</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.soon}>
          <Text style={styles.soonLabel}>WKRÓTCE</Text>
          <Text style={styles.soonItem}>· Lista posłów z Twojego okręgu</Text>
          <Text style={styles.soonItem}>· Frekwencja i lojalność klubowa</Text>
          <Text style={styles.soonItem}>· Historia głosowań i wypowiedzi</Text>
        </View>
      </ScrollView>
      <BottomTabs />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  title: { fontFamily: fonts.serif, fontSize: fontSize.xxl, color: colors.ink },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardEyebrow: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, letterSpacing: 1.2, color: colors.inkMuted },
  cardCode: { fontFamily: fonts.serif, fontSize: fontSize.xxl, color: colors.ink, letterSpacing: 3 },
  cardBody: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: fontSize.sm * 1.5 },
  cta: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
  },
  ctaText: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: fontSize.sm },
  soon: {
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  soonLabel: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
  },
  soonItem: { fontFamily: fonts.serifRegular, fontSize: fontSize.sm, color: colors.inkSoft, fontStyle: "italic" },
});
