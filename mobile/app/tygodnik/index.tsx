import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path } from "react-native-svg";

import { BottomTabs } from "@/components/BottomTabs";
import { EliCard } from "@/components/EliCard";
import { InterpellationCard } from "@/components/InterpellationCard";
import { PrintCard } from "@/components/PrintCard";
import { SupportCard } from "@/components/SupportCard";
import { TopicFilterPills } from "@/components/TopicFilterPills";
import { ViralQuoteCard } from "@/components/ViralQuoteCard";
import { VoteCard } from "@/components/VoteCard";
import { getEventsBySitting, partitionEvents } from "@/lib/queries/events";
import { getSittingsIndex } from "@/lib/queries/tygodnik";
import type {
  PrintEvent,
  SittingInfo,
  WeeklyEvent,
} from "@/lib/types";
import { ACT_KIND_NEW_LAW } from "@/lib/types";
import { colors, fonts, fontSize, spacing } from "@/theme";

const TERM = 10;
const POLISH_MONTHS = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

function formatSittingDateShort(first: string): string {
  if (!first) return "";
  const d = new Date(first);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getDate()} ${POLISH_MONTHS[d.getMonth()]}`;
}

type FeedRow =
  | { kind: "block-head"; sitting: SittingInfo; printCount: number }
  | { kind: "print"; event: Extract<WeeklyEvent, { eventType: "print" }>; voting: VoteData | null }
  | { kind: "vote"; event: Extract<WeeklyEvent, { eventType: "vote" }> }
  | { kind: "eli-head"; icon: string; label: string; count: number; sittingNum: number }
  | { kind: "eli"; event: Extract<WeeklyEvent, { eventType: "eli_inforce" }> }
  | { kind: "interp-head"; count: number; sittingNum: number }
  | { kind: "interp"; event: Extract<WeeklyEvent, { eventType: "late_interpellation" }> }
  | { kind: "viral-head"; count: number; sittingNum: number }
  | { kind: "viral"; event: Extract<WeeklyEvent, { eventType: "viral_quote" }> }
  | { kind: "support" }
  | { kind: "loadMore" }
  | { kind: "end" };

type VoteData = {
  votingId: number;
  role: string;
  votingNumber: number;
  sitting: number;
  date: string;
  title: string;
  yes: number;
  no: number;
  abstain: number;
  notParticipating: number;
};

export default function TygodnikFeed() {
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  const sittingsQ = useQuery({
    queryKey: ["sittings-index", TERM],
    queryFn: () => getSittingsIndex(TERM),
  });

  const populated = useMemo(
    () => (sittingsQ.data ?? []).filter((s) => s.eventCount > 0),
    [sittingsQ.data],
  );

  const feedQ = useInfiniteQuery({
    queryKey: ["tygodnik-feed", TERM, populated.map((s) => s.sittingNum).join(",")],
    enabled: populated.length > 0,
    initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const sitting = populated[pageParam];
      if (!sitting) return { events: [] as WeeklyEvent[], sitting: null, idx: pageParam };
      const events = await getEventsBySitting(TERM, sitting.sittingNum);
      return { events, sitting, idx: pageParam };
    },
    getNextPageParam: (last) => {
      const next = (last.idx ?? 0) + 1;
      return next < populated.length ? next : undefined;
    },
  });

  // Aggregate counts per topic across loaded sittings for the filter strip.
  // Only prints contribute to counts; same logic as the filter itself.
  const { topicCounts, totalPrintCount, latestSitting } = useMemo(() => {
    const counts: Record<string, number> = {};
    let total = 0;
    let latest: SittingInfo | null = null;
    for (const page of feedQ.data?.pages ?? []) {
      if (!page.sitting) continue;
      if (!latest) latest = page.sitting;
      const parts = partitionEvents(page.events);
      for (const ev of parts.prints) {
        total++;
        for (const t of ev.payload.topic_tags ?? []) counts[t] = (counts[t] ?? 0) + 1;
      }
    }
    return { topicCounts: counts, totalPrintCount: total, latestSitting: latest };
  }, [feedQ.data]);

  const rows = useMemo<FeedRow[]>(() => {
    const out: FeedRow[] = [];
    let supportInserted = false;

    for (const page of feedQ.data?.pages ?? []) {
      if (!page.sitting) continue;
      const parts = partitionEvents(page.events);

      // Merge vote → print.
      const printNums = new Set(parts.prints.map((p) => p.payload.number));
      const voteByPrint = new Map<string, VoteData>();
      const unmergedVotes: typeof parts.votes = [];
      for (const v of parts.votes) {
        const linked = v.payload.linked_prints?.[0];
        if (linked && printNums.has(linked.number)) {
          voteByPrint.set(linked.number, {
            votingId: v.payload.voting_id,
            role: linked.role,
            votingNumber: v.payload.voting_number,
            sitting: v.payload.sitting,
            date: v.payload.date,
            title: v.payload.title,
            yes: v.payload.yes,
            no: v.payload.no,
            abstain: v.payload.abstain,
            notParticipating: v.payload.not_participating,
          });
        } else {
          unmergedVotes.push(v);
        }
      }

      // Topic filter applies only to prints — citizen mental model says filter
      // narrows the headline section, not the whole brief.
      const filteredPrints = topicFilter
        ? parts.prints.filter((ev) => (ev.payload.topic_tags ?? []).includes(topicFilter))
        : parts.prints;

      out.push({ kind: "block-head", sitting: page.sitting, printCount: filteredPrints.length });
      for (const ev of filteredPrints) {
        out.push({
          kind: "print",
          event: ev,
          voting: voteByPrint.get(ev.payload.number) ?? null,
        });
      }

      // Topic filter hides the auxiliary sections too (they don't carry topic tags).
      if (!topicFilter) {
        if (unmergedVotes.length > 0) {
          for (const ev of unmergedVotes) out.push({ kind: "vote", event: ev });
        }

        const newLaw: typeof parts.eliInforce = [];
        const updates: typeof parts.eliInforce = [];
        for (const ev of parts.eliInforce) {
          const k = ev.payload.act_kind;
          if (k && ACT_KIND_NEW_LAW.has(k)) newLaw.push(ev);
          else updates.push(ev);
        }
        if (newLaw.length > 0) {
          out.push({ kind: "eli-head", icon: "⏱", label: "Wchodzi w życie", count: newLaw.length, sittingNum: page.sitting.sittingNum });
          for (const ev of newLaw) out.push({ kind: "eli", event: ev });
        }
        if (updates.length > 0) {
          out.push({ kind: "eli-head", icon: "📎", label: "Aktualizacje prawa", count: updates.length, sittingNum: page.sitting.sittingNum });
          for (const ev of updates) out.push({ kind: "eli", event: ev });
        }
        if (parts.lateInterpellations.length > 0) {
          out.push({ kind: "interp-head", count: parts.lateInterpellations.length, sittingNum: page.sitting.sittingNum });
          for (const ev of parts.lateInterpellations) out.push({ kind: "interp", event: ev });
        }
        if (parts.viralQuotes.length > 0) {
          out.push({ kind: "viral-head", count: parts.viralQuotes.length, sittingNum: page.sitting.sittingNum });
          for (const ev of parts.viralQuotes) out.push({ kind: "viral", event: ev });
        }
      }

      if (!supportInserted) {
        out.push({ kind: "support" });
        supportInserted = true;
      }
    }

    if (feedQ.hasNextPage) out.push({ kind: "loadMore" });
    else if ((feedQ.data?.pages.length ?? 0) > 0) out.push({ kind: "end" });
    return out;
  }, [feedQ.data, feedQ.hasNextPage, topicFilter]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["sittings-index", TERM] });
    qc.invalidateQueries({ queryKey: ["tygodnik-feed"] });
  }

  if (sittingsQ.isLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (sittingsQ.isError) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errText}>Nie udało się pobrać danych.</Text>
        <Pressable onPress={() => sittingsQ.refetch()} style={styles.retry}>
          <Text style={styles.retryText}>Spróbuj ponownie</Text>
        </Pressable>
        <BottomTabs />
      </View>
    );
  }

  if (populated.length === 0) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errText}>Brak posiedzeń.</Text>
        <BottomTabs />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => keyOf(r, i)}
        renderItem={({ item }) => <Row item={item} />}
        ListHeaderComponent={
          <FeedHeader
            sitting={latestSitting}
            topicFilter={topicFilter}
            onTopic={setTopicFilter}
            topicCounts={topicCounts}
            totalPrintCount={totalPrintCount}
          />
        }
        stickyHeaderIndices={[0]}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={sittingsQ.isRefetching} onRefresh={refresh} tintColor={colors.ink} colors={[colors.ink]} />
        }
        onEndReached={() => {
          if (feedQ.hasNextPage && !feedQ.isFetchingNextPage) feedQ.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
      />
      <BottomTabs />
    </View>
  );
}

function keyOf(r: FeedRow, i: number): string {
  switch (r.kind) {
    case "block-head":
      return `bh-${r.sitting.sittingNum}`;
    case "print":
      return `p-${r.event.payload.print_id}`;
    case "vote":
      return `v-${r.event.payload.voting_id}`;
    case "eli-head":
      return `eh-${r.sittingNum}-${r.label}`;
    case "eli":
      return `e-${r.event.payload.act_id}`;
    case "interp-head":
      return `ih-${r.sittingNum}`;
    case "interp":
      return `i-${r.event.payload.question_id}`;
    case "viral-head":
      return `vh-${r.sittingNum}`;
    case "viral":
      return `q-${r.event.payload.statement_id}`;
    case "support":
      return "support";
    case "loadMore":
      return "loadMore";
    case "end":
      return "end";
    default:
      return `x-${i}`;
  }
}

function Row({ item }: { item: FeedRow }) {
  switch (item.kind) {
    case "block-head":
      return <SectionLabel label="Decyzje tygodnia" right={`wszystkie ${item.printCount}`} />;
    case "print":
      return (
        <PrintCard
          event={item.event as PrintEvent}
          voting={
            item.voting
              ? {
                  votingId: item.voting.votingId,
                  role: item.voting.role as never,
                  votingNumber: item.voting.votingNumber,
                  sitting: item.voting.sitting,
                  date: item.voting.date,
                  title: item.voting.title,
                  yes: item.voting.yes,
                  no: item.voting.no,
                  abstain: item.voting.abstain,
                  notParticipating: item.voting.notParticipating,
                }
              : null
          }
        />
      );
    case "vote":
      return <VoteCard term={item.event.term} payload={item.event.payload} />;
    case "eli-head":
      return <SectionLabel label={item.label} right={String(item.count)} />;
    case "eli":
      return <EliCard payload={item.event.payload} sourceUrl={item.event.sourceUrl} />;
    case "interp-head":
      return <SectionLabel label="Opóźnione odpowiedzi" right={String(item.count)} />;
    case "interp":
      return <InterpellationCard payload={item.event.payload} sourceUrl={item.event.sourceUrl} />;
    case "viral-head":
      return <SectionLabel label="Powiedziane w Sejmie" right={String(item.count)} />;
    case "viral":
      return <ViralQuoteCard payload={item.event.payload} />;
    case "support":
      return <SupportCard />;
    case "loadMore":
      return (
        <View style={styles.loadMore}>
          <ActivityIndicator color={colors.inkMuted} />
          <Text style={styles.loadMoreText}>Wczytuję starsze posiedzenia…</Text>
        </View>
      );
    case "end":
      return (
        <View style={styles.end}>
          <Text style={styles.endText}>To wszystkie posiedzenia w tej kadencji.</Text>
        </View>
      );
    default:
      return null;
  }
}

function FeedHeader({
  sitting,
  topicFilter,
  onTopic,
  topicCounts,
  totalPrintCount,
}: {
  sitting: SittingInfo | null;
  topicFilter: string | null;
  onTopic: (t: string | null) => void;
  topicCounts: Record<string, number>;
  totalPrintCount: number;
}) {
  const insets = useSafeAreaInsets();
  const wyd = sitting ? `WYD. ${sitting.sittingNum}` : "TYGODNIK";
  const date = sitting ? formatSittingDateShort(sitting.firstDate) : "";

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.eyebrow}>
            {wyd}
            {date ? ` · ${date.toUpperCase()}` : ""}
          </Text>
          <Text style={styles.title}>Tygodnik</Text>
        </View>
        <View style={styles.searchBtn}>
          <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
            <Circle cx="8" cy="8" r="5.5" stroke={colors.ink} strokeWidth="1.6" />
            <Path d="M12 12 L16 16" stroke={colors.ink} strokeWidth="1.8" strokeLinecap="round" />
          </Svg>
        </View>
      </View>
      <TopicFilterPills
        selected={topicFilter}
        onSelect={onTopic}
        counts={topicCounts}
        totalCount={totalPrintCount}
      />
    </View>
  );
}

function SectionLabel({ label, right }: { label: string; right: string }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionText}>{label.toUpperCase()}</Text>
      <Text style={styles.sectionRight}>{right}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    padding: spacing.xl,
    gap: spacing.md,
  },
  errText: { fontFamily: fonts.serif, fontSize: fontSize.lg, color: colors.ink, textAlign: "center" },
  retry: {
    marginTop: spacing.md,
    backgroundColor: colors.ink,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 8,
  },
  retryText: { color: colors.paper, fontFamily: fonts.sansBold },
  header: {
    backgroundColor: colors.paper,
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.accent,
    marginBottom: 2,
  },
  title: { fontFamily: fonts.serif, fontSize: fontSize.xxl, color: colors.ink, letterSpacing: -0.5 },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.paper,
  },
  sectionText: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, letterSpacing: 1.5, color: colors.ink },
  sectionRight: { fontFamily: fonts.serifRegular, fontStyle: "italic", fontSize: fontSize.xs, color: colors.inkMuted },
  loadMore: { paddingVertical: spacing.xl, alignItems: "center", gap: spacing.xs },
  loadMoreText: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.inkMuted },
  end: { padding: spacing.xl, alignItems: "center" },
  endText: { fontFamily: fonts.serifRegular, fontSize: fontSize.sm, color: colors.inkMuted, fontStyle: "italic", textAlign: "center" },
});
