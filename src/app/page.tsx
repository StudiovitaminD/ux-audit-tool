import { LandingHero } from "@/components/landing/landing-hero";
import { LandingSections } from "@/components/landing/landing-sections";
import { LandingMotion } from "@/components/landing/landing-motion";

export default function Home() {
  return (
    <div className="landingRoot">
      <LandingHero />
      <LandingSections />
      <LandingMotion />
    </div>
  );
}
