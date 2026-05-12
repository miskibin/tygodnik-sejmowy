import { StyleSheet, Text, View } from "react-native";

import { formatShortDate } from "@/lib/format";
import { stageTypeLabel, type ProcessStage } from "@/lib/types";
import { colors, fonts, fontSize, spacing } from "@/theme";

export function ProcessStages({ stages }: { stages: ProcessStage[] }) {
  if (stages.length === 0) {
    return <Text style={styles.empty}>Brak etapów procesu.</Text>;
  }
  return (
    <View style={styles.root}>
      {stages.map((s, idx) => (
        <Stage key={`${s.ord}-${idx}`} stage={s} last={idx === stages.length - 1} />
      ))}
    </View>
  );
}

function Stage({ stage, last }: { stage: ProcessStage; last: boolean }) {
  const isDone = !!stage.stageDate;
  return (
    <View style={styles.row}>
      <View style={styles.gutter}>
        <View style={[styles.dot, isDone ? styles.dotDone : styles.dotPending]} />
        {!last ? <View style={styles.line} /> : null}
      </View>
      <View style={[styles.body, { paddingLeft: stage.depth * 8 }]}>
        <Text style={styles.name}>{stage.stageName || stageTypeLabel(stage.stageType)}</Text>
        {stage.stageDate ? <Text style={styles.date}>{formatShortDate(stage.stageDate)}</Text> : null}
        {stage.decision ? <Text style={styles.decision}>{stage.decision}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginVertical: spacing.sm },
  empty: { fontFamily: fonts.sans, color: colors.inkMuted, fontSize: fontSize.sm },
  row: { flexDirection: "row", alignItems: "stretch", minHeight: 44 },
  gutter: { width: 24, alignItems: "center" },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  dotDone: { backgroundColor: colors.ink },
  dotPending: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
  },
  line: {
    flex: 1,
    width: 1,
    backgroundColor: colors.border,
    marginTop: 2,
  },
  body: { flex: 1, paddingBottom: spacing.md },
  name: { fontFamily: fonts.sansBold, fontSize: fontSize.sm, color: colors.ink },
  date: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted, marginTop: 2 },
  decision: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkSoft, marginTop: 2 },
});
