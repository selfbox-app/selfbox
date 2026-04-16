import type { Metadata } from "next";
import { HeroSection } from "./_sections/hero";
import { HeroVisual } from "./_sections/hero-visual";
import { FeaturePills } from "./_sections/feature-pills";
import { StatsBar } from "./_sections/stats-bar";
import { ProductStorageSection } from "./_sections/product-storage";
import { ProductSyncSection } from "./_sections/product-sync";
import { ProductSharingSection } from "./_sections/product-sharing";
import { PlatformSection } from "./_sections/platform-support";
import { TestimonialsSection } from "./_sections/testimonials";
import { PricingSection } from "./_sections/pricing";

export const metadata: Metadata = {
  title: "Selfbox | Open-Source File Storage Platform",
  description:
    "A self-hostable alternative to Dropbox and Google Drive. Upload, organize, and share files from your own infrastructure with any storage provider.",
  openGraph: {
    title: "Selfbox | Open-Source File Storage Platform",
    description:
      "Self-hostable file storage. Upload, organize, and share files from your own infrastructure.",
    type: "website",
  },
};

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      <HeroSection />
      <HeroVisual />
      <FeaturePills />
      <StatsBar />
      <div className="flex flex-col gap-16 md:gap-24 my-10 md:my-20">
        <ProductStorageSection />
        <ProductSyncSection />
        <ProductSharingSection />
      </div>
      <PlatformSection />
      <TestimonialsSection />
      <PricingSection />
    </div>
  );
}
