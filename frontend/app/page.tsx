import { LandingHero } from "./_components/LandingHero";
import { FeatureTileGrid } from "./_components/FeatureTileGrid";
import { ElectionCountdown } from "./_components/ElectionCountdown";
import { getTopViralStatements } from "@/lib/db/statements";
import { getNextOrCurrentSitting } from "@/lib/db/events";

async function safeTypewriter() {
  try {
    const viral = await getTopViralStatements(6);
    return viral.map((q) => ({
      id: q.id,
      quote: q.viralQuote,
      speaker: q.speakerName,
      clubRef: q.clubRef,
    }));
  } catch (err) {
    console.error("[landing] getTopViralStatements failed", err);
    return [];
  }
}

async function safeNextSitting() {
  try {
    return await getNextOrCurrentSitting(10);
  } catch (err) {
    console.error("[landing] getNextOrCurrentSitting failed", err);
    return null;
  }
}

export default async function Landing() {
  const [quotes, nextSitting] = await Promise.all([
    safeTypewriter(),
    safeNextSitting(),
  ]);
  return (
    <main className="bg-background font-serif text-foreground">
      <LandingHero viralQuotes={quotes} />
      <ElectionCountdown nextSitting={nextSitting} />
      <FeatureTileGrid />
    </main>
  );
}
