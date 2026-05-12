import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SupportCard } from "@/components/SupportCard";
import {
  DEFAULT_PROFILE,
  formatPostcodeInput,
  getProfile,
  isValidPostcode,
  resetOnboarding,
  setProfile,
  TOPICS,
  type Profile,
} from "@/lib/profile";
import { colors, fonts, fontSize, radius, spacing } from "@/theme";

export default function Preferencje() {
  const router = useRouter();
  const [profile, setLocal] = useState<Profile>(DEFAULT_PROFILE);
  const [postcodeText, setPostcodeText] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getProfile().then((p) => {
      setLocal(p);
      setPostcodeText(p.postcode ?? "");
      setLoaded(true);
    });
  }, []);

  const postcodeValid = postcodeText.length === 0 || isValidPostcode(postcodeText);

  function handlePostcode(raw: string) {
    const formatted = formatPostcodeInput(raw);
    setPostcodeText(formatted);
    setLocal((p) => ({ ...p, postcode: formatted.length === 0 ? null : formatted }));
  }

  function toggleTopic(id: string) {
    setLocal((p) => ({
      ...p,
      topics: p.topics.includes(id) ? p.topics.filter((t) => t !== id) : [...p.topics, id],
    }));
  }

  async function save() {
    if (!postcodeValid) return;
    await setProfile(profile);
    router.back();
  }

  if (!loaded) return <View style={styles.root} />;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.section}>KOD POCZTOWY</Text>
      <TextInput
        style={[styles.input, !postcodeValid && styles.inputError]}
        value={postcodeText}
        onChangeText={handlePostcode}
        placeholder="00-000"
        placeholderTextColor={colors.inkMuted}
        keyboardType="number-pad"
        maxLength={6}
      />
      {!postcodeValid ? <Text style={styles.errText}>Format: XX-XXX</Text> : null}

      <Text style={[styles.section, { marginTop: spacing.xl }]}>TEMATY</Text>
      <Text style={styles.help}>
        Tygodnik podświetli wybrane tematy. Bez wyboru — pokażemy wszystko.
      </Text>
      <View style={styles.chipGrid}>
        {TOPICS.map((t) => {
          const isSel = profile.topics.includes(t.id);
          return (
            <Pressable
              key={t.id}
              onPress={() => toggleTopic(t.id)}
              style={({ pressed }) => [
                styles.chip,
                isSel && styles.chipActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.chipText, isSel && styles.chipTextActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={save}
        style={({ pressed }) => [styles.save, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.saveText}>Zapisz</Text>
      </Pressable>

      <View style={styles.supportWrap}>
        <Text style={[styles.section, { paddingHorizontal: spacing.lg }]}>WSPARCIE</Text>
        <SupportCard />
      </View>

      <View style={styles.debug}>
        <Text style={styles.section}>DEBUG</Text>
        <Pressable
          onPress={() => {
            Alert.alert(
              "Pokaż onboarding ponownie?",
              "Po potwierdzeniu wrócisz do ekranu powitalnego.",
              [
                { text: "Anuluj", style: "cancel" },
                {
                  text: "Pokaż",
                  style: "destructive",
                  onPress: async () => {
                    await resetOnboarding();
                    router.replace("/onboarding");
                  },
                },
              ],
            );
          }}
          style={({ pressed }) => [styles.debugBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.debugBtnText}>Pokaż onboarding ponownie</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paper },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  supportWrap: { marginTop: spacing.xxl, marginHorizontal: -spacing.lg },
  section: {
    fontFamily: fonts.sansBold,
    fontSize: fontSize.xs,
    letterSpacing: 1.5,
    color: colors.inkMuted,
    marginBottom: spacing.sm,
  },
  help: {
    fontFamily: fonts.sans,
    fontSize: fontSize.sm,
    color: colors.inkSoft,
    marginBottom: spacing.md,
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
  errText: { fontFamily: fonts.sans, fontSize: fontSize.xs, color: colors.destructive, marginTop: spacing.xs },
  chipGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontFamily: fonts.sansBold, fontSize: fontSize.sm, color: colors.inkSoft },
  chipTextActive: { color: colors.paper },
  save: {
    marginTop: spacing.xl,
    backgroundColor: colors.ink,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
  },
  saveText: { color: colors.paper, fontFamily: fonts.sansBold, fontSize: fontSize.md },
  debug: {
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  debugBtn: {
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderStyle: "dashed",
  },
  debugBtnText: { fontFamily: fonts.sansBold, fontSize: fontSize.xs, color: colors.inkSoft, letterSpacing: 0.5 },
});
