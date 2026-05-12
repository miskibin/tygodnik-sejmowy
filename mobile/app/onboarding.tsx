import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  DEFAULT_PROFILE,
  formatPostcodeInput,
  isValidPostcode,
  markOnboardingSeen,
  setProfile,
  TOPICS,
  type Profile,
} from "@/lib/profile";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

const { width: SCREEN_W } = Dimensions.get("window");

type IntroSlide = {
  kind: "intro";
  eyebrow: string;
  title: string;
  body: string;
};

type Slide = IntroSlide | { kind: "postcode" } | { kind: "topics" };

const SLIDES: Slide[] = [
  {
    kind: "intro",
    eyebrow: "Witaj",
    title: "Sejm — co tydzień, w pigułce",
    body:
      "Najważniejsze druki z mijającego posiedzenia, streszczone w kilku zdaniach. Bez żargonu.",
  },
  {
    kind: "intro",
    eyebrow: "Jak czytamy",
    title: "Wpływ, nie nagłówek",
    body:
      "Każdy druk dostaje ocenę — kogo dotyczy, co zmienia, kto za nim stoi. Sortujemy po realnym znaczeniu.",
  },
  { kind: "postcode" },
  { kind: "topics" },
];

export default function Onboarding() {
  const [index, setIndex] = useState(0);
  const [profile, setLocalProfile] = useState<Profile>(DEFAULT_PROFILE);
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Slide>>(null);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== index) {
      setIndex(i);
      Keyboard.dismiss();
    }
  }

  async function onNext() {
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      await setProfile(profile);
      await markOnboardingSeen();
      router.replace("/tygodnik");
    }
  }

  function renderItem({ item }: { item: Slide }) {
    if (item.kind === "intro") return <IntroView item={item} />;
    if (item.kind === "postcode") {
      return (
        <PostcodeView
          value={profile.postcode}
          onChange={(postcode) => setLocalProfile((p) => ({ ...p, postcode }))}
        />
      );
    }
    return (
      <TopicsView
        selected={profile.topics}
        onToggle={(id) =>
          setLocalProfile((p) => ({
            ...p,
            topics: p.topics.includes(id)
              ? p.topics.filter((t) => t !== id)
              : [...p.topics, id],
          }))
        }
      />
    );
  }

  const current = SLIDES[index];
  const ctaLabel = index < SLIDES.length - 1
    ? current.kind === "postcode" || current.kind === "topics"
      ? "Dalej"
      : "Dalej"
    : "Zacznij";
  const showSkip = current.kind === "postcode" || current.kind === "topics";

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <View style={styles.ctaRow}>
          {showSkip ? (
            <Pressable
              onPress={onNext}
              style={({ pressed }) => [styles.skip, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Text style={styles.skipText}>Pomiń</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onNext}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function IntroView({ item }: { item: IntroSlide }) {
  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <Text style={styles.eyebrow}>{item.eyebrow.toUpperCase()}</Text>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.body}>{item.body}</Text>
    </View>
  );
}

function PostcodeView({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const valid = text.length === 0 || isValidPostcode(text);

  function handleChange(raw: string) {
    const formatted = formatPostcodeInput(raw);
    setText(formatted);
    onChange(formatted.length === 0 ? null : formatted);
  }

  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <Text style={styles.eyebrow}>O TOBIE · 1/2</Text>
      <Text style={styles.title}>Twój kod pocztowy</Text>
      <Text style={styles.body}>
        Pozwoli nam podświetlać posłów z Twojego okręgu i sprawy, które dotyczą Twojego regionu.
        Możesz pominąć — niczego nie wysyłamy.
      </Text>
      <TextInput
        style={[styles.input, !valid && styles.inputError]}
        value={text}
        onChangeText={handleChange}
        placeholder="00-000"
        placeholderTextColor={colors.inkMuted}
        keyboardType="number-pad"
        maxLength={6}
        autoComplete="postal-code"
        textContentType="postalCode"
      />
      {!valid ? <Text style={styles.errText}>Format: XX-XXX</Text> : null}
    </View>
  );
}

function TopicsView({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <Text style={styles.eyebrow}>O TOBIE · 2/2</Text>
      <Text style={styles.title}>Co Cię interesuje?</Text>
      <Text style={styles.body}>
        Wybierz tematy, które chcesz widzieć na początku. Reszta nadal jest dostępna —
        możesz zmienić w każdej chwili.
      </Text>
      <View style={styles.chipGrid}>
        {TOPICS.map((t) => {
          const isSel = selected.includes(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => onToggle(t.id)}
              style={({ pressed }) => [
                styles.topicChip,
                isSel && styles.topicChipActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.topicChipText, isSel && styles.topicChipTextActive]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  slide: { flex: 1, justifyContent: "flex-start", paddingHorizontal: spacing.xl, paddingTop: spacing.xxl },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.2,
    color: colors.accent,
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.xxl,
    lineHeight: fontSize.xxl * 1.15,
    color: colors.ink,
    marginBottom: spacing.lg,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
    color: colors.inkSoft,
    marginBottom: spacing.xl,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fonts.sansBold,
    fontSize: fontSize.lg,
    color: colors.ink,
    backgroundColor: colors.card,
    letterSpacing: 2,
  },
  inputError: { borderColor: colors.destructive },
  errText: {
    fontFamily: fonts.sans,
    fontSize: fontSize.xs,
    color: colors.destructive,
    marginTop: spacing.xs,
  },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  topicChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topicChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  topicChipText: { fontFamily: fonts.sansBold, fontSize: fontSize.sm, color: colors.inkSoft },
  topicChipTextActive: { color: colors.paper },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.lg },
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.ink, width: 24 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cta: {
    flex: 1,
    backgroundColor: colors.ink,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  ctaText: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: fontSize.md, letterSpacing: 0.5 },
  skip: { paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  skipText: { color: colors.inkMuted, fontFamily: fonts.sansBold, fontSize: fontSize.sm },
});
