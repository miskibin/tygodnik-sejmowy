import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { TOPICS } from "@/lib/profile";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

type PillsProps = {
  selected: string | null; // null = "wszystkie"
  onSelect: (topic: string | null) => void;
  counts: Record<string, number>;
  totalCount: number;
};

export function TopicFilterPills({ selected, onSelect, counts, totalCount }: PillsProps) {
  const items: { id: string | null; label: string; count: number }[] = [
    { id: null, label: "wszystkie", count: totalCount },
    ...TOPICS.map((t) => ({ id: t.id, label: t.label.toLowerCase(), count: counts[t.id] ?? 0 })),
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {items.map((it) => {
        const active = it.id === selected;
        // Hide zero-count topics so the strip stays clean.
        if (it.id !== null && it.count === 0) return null;
        return (
          <Pressable
            key={it.id ?? "all"}
            onPress={() => onSelect(it.id)}
            style={({ pressed }) => [
              styles.pill,
              active && styles.pillActive,
              pressed && { opacity: 0.7 },
            ]}
            hitSlop={4}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{it.label}</Text>
            <View style={[styles.count, active && styles.countActive]}>
              <Text style={[styles.countText, active && styles.countTextActive]}>{it.count}</Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  label: { fontFamily: fonts.sansBold, fontSize: fontSize.sm, color: colors.inkSoft },
  labelActive: { color: colors.paper },
  count: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: colors.muted,
    borderRadius: 10,
    alignItems: "center",
  },
  countActive: { backgroundColor: colors.paper },
  countText: { fontFamily: fonts.sansBold, fontSize: 10, color: colors.inkSoft },
  countTextActive: { color: colors.ink },
});
