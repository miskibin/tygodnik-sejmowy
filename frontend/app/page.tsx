import { LandingHero } from "./_components/LandingHero";
import { LandingMethod } from "./_components/LandingMethod";
import { FeatureTileGrid } from "./_components/FeatureTileGrid";

export default function Landing() {
  return (
    <div className="bg-background font-serif text-foreground">
      <LandingHero />
      <LandingMethod />
      <FeatureTileGrid />
    </div>
  );
}
