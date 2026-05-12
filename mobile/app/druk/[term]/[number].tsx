import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { Markdown } from "@/components/Markdown";
import { ProcessStages } from "@/components/ProcessStages";
import { VotingSummary } from "@/components/VotingSummary";
import { formatShortDate } from "@/lib/format";
import { getPrint } from "@/lib/queries/prints";
import { CATEGORY_LABEL, SPONSOR_LABEL } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export default function DrukDetail() {
  const params = useLocalSearchParams<{ term: string; number: string }>();
  const term = Number(params.term);
  const number = String(params.number);

  const q = useQuery({
    queryKey: ["print", term, number],
    queryFn: () => getPrint(term, number),
    enabled: Number.isFinite(term) && !!number,
  });

  if (q.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (q.isError || !q.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Nie udało się pobrać druku.</Text>
        {q.error ? <Text style={styles.errDetail}>{(q.error as Error).message}</Text> : null}
      </View>
    );
  }

  const { print, stages, mainVoting, outcome, attachments } = q.data;
  const sejmUrl = `https://www.sejm.gov.pl/Sejm${print.term}.nsf/druk.xsp?nr=${print.number}`;
  const categoryLabel = print.documentCategory ? CATEGORY_LABEL[print.documentCategory] : null;
  const sponsorLabel = print.sponsorAuthority ? SPONSOR_LABEL[print.sponsorAuthority] : null;

  return (
    <>
      <Stack.Screen options={{ title: `Druk ${print.number}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          {categoryLabel ? <Text style={styles.eyebrow}>{categoryLabel.toUpperCase()}</Text> : null}
          <Text style={styles.title}>{print.shortTitle || print.title}</Text>
          {print.shortTitle && print.title && print.shortTitle !== print.title ? (
            <Text style={styles.fullTitle}>{print.title}</Text>
          ) : null}
          <Text style={styles.meta}>
            Druk {print.number} · kadencja {print.term}
            {print.changeDate ? ` · ${formatShortDate(print.changeDate)}` : ""}
          </Text>
          <Pressable onPress={() => WebBrowser.openBrowserAsync(sejmUrl)} hitSlop={6}>
            <Text style={styles.link}>Otwórz w Sejm.gov.pl ↗</Text>
          </Pressable>
        </View>

        {print.impactPunch ? (
          <Section title="Wpływ">
            <Markdown>{print.impactPunch}</Markdown>
            {print.citizenAction ? (
              <View style={styles.callout}>
                <Text style={styles.calloutLabel}>CO MOŻESZ ZROBIĆ</Text>
                <Text style={styles.calloutText}>{print.citizenAction}</Text>
              </View>
            ) : null}
          </Section>
        ) : null}

        {print.summaryPlain ? (
          <Section title="Streszczenie">
            <Markdown>{print.summaryPlain}</Markdown>
          </Section>
        ) : null}

        {sponsorLabel || print.sponsorMps.length > 0 ? (
          <Section title="Wnioskodawca">
            {sponsorLabel ? (
              <View style={styles.chipRow}>
                <View style={styles.chip}>
                  <Text style={styles.chipText}>{sponsorLabel}</Text>
                </View>
              </View>
            ) : null}
            {print.sponsorMps.length > 0 ? (
              <Text style={styles.body}>{print.sponsorMps.join(", ")}</Text>
            ) : null}
          </Section>
        ) : null}

        <Section title="Proces legislacyjny">
          <ProcessStages stages={stages} />
        </Section>

        {mainVoting ? (
          <Section title="Główne głosowanie">
            <VotingSummary voting={mainVoting} />
          </Section>
        ) : null}

        {outcome?.passed && outcome.act ? (
          <Section title="Wynik">
            <View style={styles.actBox}>
              <Text style={styles.actAddress}>{outcome.act.displayAddress || outcome.act.eliId}</Text>
              {outcome.act.title ? <Text style={styles.actTitle}>{outcome.act.title}</Text> : null}
              {outcome.act.publishedAt ? (
                <Text style={styles.actMeta}>
                  Opublikowano: {formatShortDate(outcome.act.publishedAt)}
                  {outcome.act.status ? ` · ${outcome.act.status}` : ""}
                </Text>
              ) : null}
              {outcome.act.sourceUrl ? (
                <Pressable onPress={() => WebBrowser.openBrowserAsync(outcome.act!.sourceUrl!)}>
                  <Text style={styles.link}>Otwórz w ISAP ↗</Text>
                </Pressable>
              ) : null}
            </View>
          </Section>
        ) : null}

        {attachments.length > 0 ? (
          <Section title="Pliki">
            {attachments.map((f) => (
              <Pressable
                key={f}
                onPress={() =>
                  WebBrowser.openBrowserAsync(
                    `https://api.sejm.gov.pl/sejm/term${print.term}/prints/${print.number}/${f}`,
                  )
                }
                style={styles.fileRow}
              >
                <Text style={styles.fileText}>{f} ↗</Text>
              </Pressable>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.paper, padding: spacing.xl, gap: spacing.sm },
  err: { fontFamily: fonts.serif, fontSize: fontSize.lg, color: colors.ink },
  errDetail: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.inkMuted, textAlign: "center" },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  headerCard: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.accent,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.xl,
    lineHeight: fontSize.xl * 1.2,
    color: colors.ink,
  },
  fullTitle: {
    fontFamily: fonts.serifRegular,
    fontSize: fontSize.sm,
    lineHeight: fontSize.sm * 1.45,
    color: colors.inkSoft,
  },
  meta: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  link: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.base,
    lineHeight: fontSize.base * 1.5,
    color: colors.inkSoft,
  },
  section: { gap: spacing.sm },
  sectionTitle: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.inkMuted,
    marginBottom: spacing.xs,
  },
  callout: {
    backgroundColor: colors.muted,
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    gap: 4,
  },
  calloutLabel: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    color: colors.accent,
  },
  calloutText: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.ink, lineHeight: fontSize.sm * 1.5 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
  },
  chipText: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, color: colors.inkSoft },
  actBox: {
    backgroundColor: colors.card,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  actAddress: { fontFamily: fonts.sansBold, fontSize: fontSize.base, color: colors.ink },
  actTitle: { fontFamily: fonts.serifRegular, fontSize: fontSize.sm, color: colors.inkSoft, lineHeight: fontSize.sm * 1.4 },
  actMeta: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  fileRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fileText: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.accent },
});
