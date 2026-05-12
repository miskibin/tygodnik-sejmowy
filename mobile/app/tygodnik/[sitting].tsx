import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
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

import { BottomTabs } from "@/components/BottomTabs";
import { EliCard } from "@/components/EliCard";
import { InterpellationCard } from "@/components/InterpellationCard";
import { PrintCard } from "@/components/PrintCard";
import { SectionHeader } from "@/components/SectionHeader";
import { SittingMasthead } from "@/components/SittingMasthead";
import { SupportCard } from "@/components/SupportCard";
import { ViralQuoteCard } from "@/components/ViralQuoteCard";
import { VoteCard } from "@/components/VoteCard";
import { getEventsBySitting, partitionEvents } from "@/lib/queries/events";
import { getSittingsIndex } from "@/lib/queries/tygodnik";
import { getProfile } from "@/lib/profile";
import type { PrintEvent, SittingInfo, WeeklyEvent } from "@/lib/types";
import { ACT_KIND_NEW_LAW } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

type Row =
  | { kind: "masthead" }
  | { kind: "filter"; matched: number; total: number; showAll: boolean }
  | { kind: "section"; icon: string; label: string; count: number }
  | { kind: "print"; event: Extract<WeeklyEvent, { eventType: "print" }>; voting: VoteRef | null; highlighted: boolean }
  | { kind: "vote"; event: Extract<WeeklyEvent, { eventType: "vote" }> }
  | { kind: "eli"; event: Extract<WeeklyEvent, { eventType: "eli_inforce" }> }
  | { kind: "interp"; event: Extract<WeeklyEvent, { eventType: "late_interpellation" }> }
  | { kind: "viral"; event: Extract<WeeklyEvent, { eventType: "viral_quote" }> }
  | { kind: "support" };

type VoteRef = {
  votingId: number;
  votingNumber: number;
  date: string;
  title: string;
  yes: number;
  no: number;
  abstain: number;
  notParticipating: number;
};

export default function TygodnikSitting() {
  const params = useLocalSearchParams<{ sitting: string }>();
  const sittingNum = Number(params.sitting);
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const sittingQ = useQuery({
    queryKey: ["sittings-index", 10],
    queryFn: () => getSittingsIndex(10),
    select: (rows): SittingInfo | undefined => rows.find((r) => r.sittingNum === sittingNum),
  });

  const eventsQ = useQuery({
    queryKey: ["sitting-events-rich", 10, sittingNum],
    queryFn: () => getEventsBySitting(10, sittingNum),
    enabled: Number.isFinite(sittingNum),
  });

  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    staleTime: 0,
  });

  const refreshing = sittingQ.isFetching || eventsQ.isFetching;
  function refresh() {
    qc.invalidateQueries({ queryKey: ["sittings-index", 10] });
    qc.invalidateQueries({ queryKey: ["sitting-events-rich", 10, sittingNum] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  const userTopics = profileQ.data?.topics ?? [];

  const rows = useMemo<Row[]>(() => {
    if (!eventsQ.data) return [];
    const parts = partitionEvents(eventsQ.data);

    // Merge votes into prints.
    const printNums = new Set(parts.prints.map((p) => p.payload.number));
    const voteByPrint = new Map<string, VoteRef>();
    const unmergedVotes: typeof parts.votes = [];
    for (const v of parts.votes) {
      const linked = v.payload.linked_prints?.[0];
      if (linked && printNums.has(linked.number)) {
        voteByPrint.set(linked.number, {
          votingId: v.payload.voting_id,
          votingNumber: v.payload.voting_number,
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

    // Filter prints by user topics unless showAll.
    const allPrints = parts.prints;
    const matchedPrints = userTopics.length > 0
      ? allPrints.filter((e) => (e.payload.topic_tags ?? []).some((t) => userTopics.includes(t)))
      : allPrints;
    const filterActive = userTopics.length > 0 && !showAll && matchedPrints.length > 0;
    const visiblePrints = filterActive ? matchedPrints : allPrints;

    const out: Row[] = [{ kind: "masthead" }];
    if (userTopics.length > 0 && allPrints.length > 0) {
      out.push({
        kind: "filter",
        matched: matchedPrints.length,
        total: allPrints.length,
        showAll,
      });
    }

    if (visiblePrints.length > 0) {
      out.push({ kind: "section", icon: "📜", label: "Nowe projekty", count: visiblePrints.length });
      for (const ev of visiblePrints) {
        const highlighted =
          userTopics.length > 0
          && (ev.payload.topic_tags ?? []).some((t) => userTopics.includes(t));
        out.push({
          kind: "print",
          event: ev,
          voting: voteByPrint.get(ev.payload.number) ?? null,
          highlighted: highlighted && showAll,
        });
      }
    }

    if (unmergedVotes.length > 0) {
      out.push({ kind: "section", icon: "⚖", label: "Pozostałe głosowania", count: unmergedVotes.length });
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
      out.push({ kind: "section", icon: "⏱", label: "Wchodzi w życie", count: newLaw.length });
      for (const ev of newLaw) out.push({ kind: "eli", event: ev });
    }
    if (updates.length > 0) {
      out.push({ kind: "section", icon: "📎", label: "Aktualizacje prawa", count: updates.length });
      for (const ev of updates) out.push({ kind: "eli", event: ev });
    }

    if (parts.lateInterpellations.length > 0) {
      out.push({
        kind: "section",
        icon: "🔥",
        label: "Opóźnione odpowiedzi ministrów",
        count: parts.lateInterpellations.length,
      });
      for (const ev of parts.lateInterpellations) out.push({ kind: "interp", event: ev });
    }

    if (parts.viralQuotes.length > 0) {
      out.push({ kind: "section", icon: "📺", label: "Powiedziane w Sejmie", count: parts.viralQuotes.length });
      for (const ev of parts.viralQuotes) out.push({ kind: "viral", event: ev });
    }

    out.push({ kind: "support" });
    return out;
  }, [eventsQ.data, userTopics, showAll]);

  if (sittingQ.isLoading || eventsQ.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (eventsQ.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Nie udało się pobrać wydania.</Text>
        <Text style={styles.errDetail}>{(eventsQ.error as Error)?.message ?? ""}</Text>
      </View>
    );
  }

  const sitting = sittingQ.data;

  return (
    <View style={{ flex: 1, backgroundColor: colors.paper }}>
      <Stack.Screen options={{ title: sitting ? `Wydanie ${sitting.sittingNum}` : "Tygodnik" }} />
      <FlatList
        data={rows}
        keyExtractor={(r, i) => {
          switch (r.kind) {
            case "masthead":
              return "masthead";
            case "filter":
              return "filter";
            case "section":
              return `s-${r.label}`;
            case "print":
              return `p-${r.event.payload.print_id}`;
            case "vote":
              return `v-${r.event.payload.voting_id}`;
            case "eli":
              return `e-${r.event.payload.act_id}`;
            case "interp":
              return `i-${r.event.payload.question_id}`;
            case "viral":
              return `q-${r.event.payload.statement_id}`;
            case "support":
              return "support";
            default:
              return `x-${i}`;
          }
        }}
        renderItem={({ item }) => {
          switch (item.kind) {
            case "masthead":
              return sitting ? <SittingMasthead sitting={sitting} /> : null;
            case "filter":
              return (
                <FilterBanner
                  matched={item.matched}
                  total={item.total}
                  showAll={item.showAll}
                  onToggle={() => setShowAll((v) => !v)}
                />
              );
            case "section":
              return <SectionHeader icon={item.icon} label={item.label} count={item.count} />;
            case "print":
              return (
                <PrintCard
                  event={item.event as PrintEvent}
                  voting={
                    item.voting
                      ? {
                          votingId: item.voting.votingId,
                          role: "main",
                          votingNumber: item.voting.votingNumber,
                          sitting: sitting?.sittingNum ?? 0,
                          date: item.voting.date,
                          title: item.voting.title,
                          yes: item.voting.yes,
                          no: item.voting.no,
                          abstain: item.voting.abstain,
                          notParticipating: item.voting.notParticipating,
                        }
                      : null
                  }
                  highlighted={item.highlighted}
                />
              );
            case "vote":
              return <VoteCard term={item.event.term} payload={item.event.payload} />;
            case "eli":
              return <EliCard payload={item.event.payload} sourceUrl={item.event.sourceUrl} />;
            case "interp":
              return <InterpellationCard payload={item.event.payload} sourceUrl={item.event.sourceUrl} />;
            case "viral":
              return <ViralQuoteCard payload={item.event.payload} />;
            case "support":
              return <SupportCard />;
            default:
              return null;
          }
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Brak wydarzeń w tym wydaniu.</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} colors={[colors.ink]} />
        }
      />
      <BottomTabs />
    </View>
  );
}

function FilterBanner({
  matched,
  total,
  showAll,
  onToggle,
}: {
  matched: number;
  total: number;
  showAll: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.banner}>
      <Text style={styles.bannerText}>
        {showAll
          ? `${matched} z ${total} pasuje do Twoich tematów`
          : `Filtrujemy: ${matched} z ${total} druków`}
      </Text>
      <Pressable onPress={onToggle} hitSlop={6}>
        <Text style={styles.bannerLink}>{showAll ? "Tylko moje" : "Pokaż wszystkie"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  err: { fontFamily: fonts.serif, fontSize: fontSize.lg, color: colors.ink },
  errDetail: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.inkMuted, textAlign: "center" },
  empty: { padding: spacing.xl, alignItems: "center" },
  emptyText: { fontFamily: fonts.sans, color: colors.inkMuted, textAlign: "center" },
  banner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.muted,
    borderRadius: radius.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  bannerText: { fontFamily: fonts.sans, fontSize: fontSize.sm, color: colors.inkSoft, flex: 1 },
  bannerLink: { fontFamily: fonts.sansBold, fontSize: fontSize.sm, color: colors.accent },
});
