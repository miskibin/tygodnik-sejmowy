import { LandingHero } from "./_components/LandingHero";
import { FeatureTileGrid } from "./_components/FeatureTileGrid";
import { ViralCarousel } from "./_components/ViralCarousel";
import { getTopViralStatements } from "@/lib/db/statements";

async function safeViral() {
  try {
    return await getTopViralStatements(12);
  } catch (err) {
    console.error("[landing] getTopViralStatements failed", err);
    return [];
  }
}

export default async function Landing() {
  const viral = await safeViral();
  // Top of hero: 5 strongest viral quotes for the typewriter — keep it tight,
  // each runs ~5s so 5 ≈ 25s loop.
  const typewriter = viral.slice(0, 5).map((q) => ({
    id: q.id,
    quote: q.viralQuote,
    speaker: q.speakerName,
    clubRef: q.clubRef,
  }));
  return (
    <div className="bg-background font-serif text-foreground">
      <LandingHero viralQuotes={typewriter} />
      <FeatureTileGrid />
      <ViralCarousel quotes={viral} />
    </div>
  );
}
