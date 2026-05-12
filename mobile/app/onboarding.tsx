import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
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
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  IllustrationCompass,
  IllustrationDoc,
  IllustrationPin,
  IllustrationTopics,
} from "@/components/OnboardingIllustration";
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
  illust: "compass" | "doc";
};

type Slide =
  | IntroSlide
  | { kind: "postcode" }
  | { kind: "topics" };

const SLIDES: Slide[] = [
  {
    kind: "intro",
    eyebrow: "Witaj",
    title: "Sejm — co tydzień, w pigułce",
    body:
      "Najważniejsze druki z mijającego posiedzenia, streszczone w kilku zdaniach. Bez żargonu.",
    illust: "compass",
  },
  {
    kind: "intro",
    eyebrow: "Jak czytamy",
    title: "Wpływ, nie nagłówek",
    body:
      "Każdy druk dostaje ocenę — kogo dotyczy, co zmienia, kto za nim stoi. Sortujemy po realnym znaczeniu.",
    illust: "doc",
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
      Haptics.selectionAsync().catch(() => {});
    }
  }

  async function onNext() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (index < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await setProfile(profile);
      await markOnboardingSeen();
      router.replace("/tygodnik");
    }
  }

  function renderItem({ item, index: i }: { item: Slide; index: number }) {
    if (item.kind === "intro") return <IntroView item={item} active={i === index} />;
    if (item.kind === "postcode") {
      return (
        <PostcodeView
          active={i === index}
          value={profile.postcode}
          onChange={(postcode) => setLocalProfile((p) => ({ ...p, postcode }))}
        />
      );
    }
    return (
      <TopicsView
        active={i === index}
        selected={profile.topics}
        onToggle={(id) => {
          Haptics.selectionAsync().catch(() => {});
          setLocalProfile((p) => ({
            ...p,
            topics: p.topics.includes(id)
              ? p.topics.filter((t) => t !== id)
              : [...p.topics, id],
          }));
        }}
      />
    );
  }

  const current = SLIDES[index];
  const ctaLabel = index < SLIDES.length - 1 ? "Dalej" : "Zacznij czytać";
  const showSkip = current.kind === "postcode" || current.kind === "topics";

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <BackgroundOrbs />
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
            style={({ pressed }) => [pressed && { opacity: 0.85 }, { flex: 1 }]}
          >
            <LinearGradient
              colors={["#1a1612", "#3a3028"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>{ctaLabel}</Text>
              <Text style={styles.ctaArrow}>→</Text>
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function BackgroundOrbs() {
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  useEffect(() => {
    a.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 6000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    b.value = withDelay(
      2000,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 7000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, []);

  const orbA = useAnimatedStyle(() => ({
    opacity: 0.08 + a.value * 0.06,
    transform: [{ translateY: -10 + a.value * 20 }, { scale: 0.95 + a.value * 0.1 }],
  }));
  const orbB = useAnimatedStyle(() => ({
    opacity: 0.06 + b.value * 0.05,
    transform: [{ translateY: 10 - b.value * 20 }, { scale: 1.05 - b.value * 0.1 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      <Animated.View style={[styles.orb, styles.orbA, orbA]} />
      <Animated.View style={[styles.orb, styles.orbB, orbB]} />
    </View>
  );
}

function IntroView({ item, active }: { item: IntroSlide; active: boolean }) {
  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <View style={styles.illustWrap}>
        {active && (
          <Animated.View entering={FadeIn.duration(500)}>
            {item.illust === "compass" ? <IllustrationCompass /> : <IllustrationDoc />}
          </Animated.View>
        )}
      </View>
      <Animated.Text
        key={`eyebrow-${active}`}
        entering={active ? FadeInDown.duration(400).delay(100) : undefined}
        style={styles.eyebrow}
      >
        {item.eyebrow.toUpperCase()}
      </Animated.Text>
      <Animated.Text
        key={`title-${active}`}
        entering={active ? FadeInDown.duration(500).delay(200) : undefined}
        style={styles.title}
      >
        {item.title}
      </Animated.Text>
      <Animated.Text
        key={`body-${active}`}
        entering={active ? FadeInDown.duration(500).delay(350) : undefined}
        style={styles.body}
      >
        {item.body}
      </Animated.Text>
    </View>
  );
}

function PostcodeView({
  active,
  value,
  onChange,
}: {
  active: boolean;
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
      <View style={styles.illustWrap}>
        {active && (
          <Animated.View entering={FadeIn.duration(500)}>
            <IllustrationPin />
          </Animated.View>
        )}
      </View>
      <Animated.Text
        entering={active ? FadeInDown.duration(400).delay(100) : undefined}
        style={styles.eyebrow}
      >
        O TOBIE · 1/2
      </Animated.Text>
      <Animated.Text
        entering={active ? FadeInDown.duration(500).delay(200) : undefined}
        style={styles.title}
      >
        Twój kod pocztowy
      </Animated.Text>
      <Animated.Text
        entering={active ? FadeInDown.duration(500).delay(350) : undefined}
        style={styles.body}
      >
        Pozwoli nam podświetlać posłów z Twojego okręgu i sprawy, które dotyczą Twojego regionu.
        Możesz pominąć — niczego nie wysyłamy.
      </Animated.Text>
      <Animated.View entering={active ? FadeInDown.duration(500).delay(450) : undefined}>
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
      </Animated.View>
    </View>
  );
}

function TopicsView({
  active,
  selected,
  onToggle,
}: {
  active: boolean;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <View style={[styles.slide, { width: SCREEN_W }]}>
      <View style={styles.illustWrap}>
        {active && (
          <Animated.View entering={FadeIn.duration(500)}>
            <IllustrationTopics size={160} />
          </Animated.View>
        )}
      </View>
      <Animated.Text
        entering={active ? FadeInDown.duration(400).delay(100) : undefined}
        style={styles.eyebrow}
      >
        O TOBIE · 2/2
      </Animated.Text>
      <Animated.Text
        entering={active ? FadeInDown.duration(500).delay(200) : undefined}
        style={styles.title}
      >
        Co Cię interesuje?
      </Animated.Text>
      <Animated.Text
        entering={active ? FadeInDown.duration(500).delay(300) : undefined}
        style={styles.body}
      >
        Wybierz tematy, które chcesz widzieć na początku. Reszta dostępna — możesz zmienić w każdej chwili.
      </Animated.Text>
      <Animated.View
        entering={active ? FadeInDown.duration(500).delay(400) : undefined}
        style={styles.chipGrid}
      >
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper, overflow: "hidden" },
  orb: { position: "absolute", borderRadius: 200 },
  orbA: {
    width: 320,
    height: 320,
    backgroundColor: colors.accent,
    top: -80,
    right: -100,
  },
  orbB: {
    width: 260,
    height: 260,
    backgroundColor: "#3d6b3d",
    bottom: -50,
    left: -80,
  },
  slide: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  illustWrap: {
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  eyebrow: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.xxl,
    lineHeight: fontSize.xxl * 1.15,
    color: colors.ink,
    marginBottom: spacing.md,
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: fontSize.md,
    lineHeight: fontSize.md * 1.5,
    color: colors.inkSoft,
    marginBottom: spacing.lg,
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
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  dots: { flexDirection: "row", justifyContent: "center", gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.ink, width: 24 },
  ctaRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cta: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  ctaText: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: fontSize.md, letterSpacing: 0.5 },
  ctaArrow: { color: colors.paper, fontSize: fontSize.lg, fontFamily: fonts.sansBold },
  skip: { paddingVertical: spacing.lg, paddingHorizontal: spacing.md },
  skipText: { color: colors.inkMuted, fontFamily: fonts.sansBold, fontSize: fontSize.sm },
});
