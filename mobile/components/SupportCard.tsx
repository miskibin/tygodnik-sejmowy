import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, fonts, fontSize, radius, spacing } from "@/theme";

const PATRONITE_URL = "https://patronite.pl/tygodniksejmowy";

export function SupportCard({ compact = false }: { compact?: boolean }) {
  function onPress() {
    WebBrowser.openBrowserAsync(PATRONITE_URL);
  }
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.85 }]}>
      <LinearGradient
        colors={["#8a2a1f", "#b04030"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <Text style={styles.heart}>♥</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {compact ? "Wesprzyj Sejmograf" : "Sejmograf żyje dzięki Tobie"}
          </Text>
          <Text style={styles.body}>
            {compact ? "Patronite — od 5 zł / miesiąc" : "Projekt non-profit. Bez reklam. Wsparcie pokrywa serwery, OCR i czas pracy."}
          </Text>
        </View>
        <Text style={styles.cta}>→</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.md,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
  },
  heart: {
    fontSize: 32,
    color: "#fff",
    opacity: 0.9,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.md,
    color: "#fff",
    marginBottom: 2,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: "#fff",
    opacity: 0.88,
    lineHeight: fontSize.xs * 1.5,
  },
  cta: { fontSize: 22, color: "#fff" },
});
