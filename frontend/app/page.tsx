import { LandingHero } from "./_components/LandingHero";
import { FeatureTileGrid } from "./_components/FeatureTileGrid";
import { getTopViralStatements } from "@/lib/db/statements";

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

export default async function Landing() {
  const quotes = await safeTypewriter();
  return (
    <main className="bg-background font-serif text-foreground">
      <LandingHero viralQuotes={quotes} />
      <FeatureTileGrid />
    </main>
  );
}
