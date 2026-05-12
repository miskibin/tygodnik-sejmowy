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

import { PrintCard } from "@/components/PrintCard";
import { SittingMasthead } from "@/components/SittingMasthead";
import { getMainVotingByPrintIds } from "@/lib/queries/votings";
import { getPrintEventsBySitting, getSittingsIndex } from "@/lib/queries/tygodnik";
import { getProfile } from "@/lib/profile";
import type { PrintEvent, SittingInfo } from "@/lib/types";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

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
    queryKey: ["sitting-prints", 10, sittingNum],
    queryFn: () => getPrintEventsBySitting(10, sittingNum),
    enabled: Number.isFinite(sittingNum),
  });

  const profileQ = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
    staleTime: 0,
  });

  const printIds = useMemo(
    () => (eventsQ.data ?? []).map((e) => e.payload.print_id),
    [eventsQ.data],
  );

  const votingsQ = useQuery({
    queryKey: ["votings-for-prints", printIds],
    queryFn: () => getMainVotingByPrintIds(printIds),
    enabled: printIds.length > 0,
  });

  const refreshing = sittingQ.isFetching || eventsQ.isFetching || votingsQ.isFetching;

  function refresh() {
    qc.invalidateQueries({ queryKey: ["sittings-index", 10] });
    qc.invalidateQueries({ queryKey: ["sitting-prints", 10, sittingNum] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  const userTopics = profileQ.data?.topics ?? [];
  const allEvents: PrintEvent[] = eventsQ.data ?? [];
  const matchedEvents = useMemo(() => {
    if (userTopics.length === 0) return allEvents;
    return allEvents.filter((e) =>
      (e.payload.topic_tags ?? []).some((t) => userTopics.includes(t)),
    );
  }, [allEvents, userTopics]);

  const filterActive = userTopics.length > 0 && !showAll && matchedEvents.length > 0;
  const events = filterActive ? matchedEvents : allEvents;

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
  const votings = votingsQ.data;

  return (
    <>
      <Stack.Screen options={{ title: sitting ? `Wydanie ${sitting.sittingNum}` : "Tygodnik" }} />
      <FlatList
        data={events}
        keyExtractor={(e) => String(e.payload.print_id)}
        renderItem={({ item }) => {
          const voting = votings?.get(item.payload.print_id) ?? null;
          const highlighted =
            userTopics.length > 0 &&
            (item.payload.topic_tags ?? []).some((t) => userTopics.includes(t));
          return <PrintCard event={item} voting={voting} highlighted={highlighted && showAll} />;
        }}
        ListHeaderComponent={
          <>
            {sitting ? <SittingMasthead sitting={sitting} /> : null}
            {userTopics.length > 0 && allEvents.length > 0 ? (
              <FilterBanner
                matched={matchedEvents.length}
                total={allEvents.length}
                showAll={showAll}
                onToggle={() => setShowAll((v) => !v)}
              />
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              {filterActive ? "Brak druków pasujących do Twoich tematów." : "Brak druków w tym wydaniu."}
            </Text>
            {filterActive ? (
              <Pressable onPress={() => setShowAll(true)} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Pokaż wszystkie</Text>
              </Pressable>
            ) : null}
          </View>
        }
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.ink} colors={[colors.ink]} />
        }
      />
    </>
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
  empty: { padding: spacing.xl, alignItems: "center", gap: spacing.md },
  emptyText: { fontFamily: fonts.sans, color: colors.inkMuted, textAlign: "center" },
  emptyBtn: {
    backgroundColor: colors.ink,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.md,
  },
  emptyBtnText: { color: colors.paper, fontFamily: fonts.sansBold },
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
