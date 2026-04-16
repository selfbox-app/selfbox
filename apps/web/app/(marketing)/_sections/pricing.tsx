import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface PricingTier {
  name: string;
  price: string;
  description: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}

const tiers: PricingTier[] = [
  {
    name: "Pro",
    price: "$8",
    description: "For individuals who want full control.",
    features: [
      "100 GB storage",
      "3 devices",
      "E2E encryption",
      "File sharing",
      "Version history (30 days)",
    ],
    cta: "Get Started",
  },
  {
    name: "Team",
    price: "$20",
    description: "For teams that collaborate securely.",
    features: [
      "1 TB storage",
      "10 devices",
      "E2E encryption",
      "Advanced sharing & permissions",
      "Version history (1 year)",
      "Priority support",
    ],
    cta: "Get Started",
    highlighted: true,
  },
  {
    name: "Business",
    price: "$50",
    description: "For organizations with advanced needs.",
    features: [
      "Unlimited storage",
      "Unlimited devices",
      "E2E encryption",
      "SSO & admin controls",
      "Unlimited version history",
      "Dedicated support",
      "Custom deployment",
    ],
    cta: "Contact Sales",
  },
];

export function PricingSection() {
  return (
    <section className="my-10 md:my-20">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
          Pricing
        </p>
        <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl">
          Simple, transparent pricing.
        </h2>
        <p className="text-muted-foreground text-lg mt-4 max-w-md mx-auto">
          Start free. Upgrade when you need more.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12 max-w-4xl mx-auto px-4">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={cn(
              "border border-border rounded-xl p-6 md:p-8 flex flex-col",
              tier.highlighted &&
                "border-primary ring-1 ring-primary/20 relative"
            )}
          >
            {tier.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground font-mono text-xs px-3 py-1 rounded-full">
                Popular
              </span>
            )}

            <p className="font-mono text-sm font-medium uppercase tracking-wide">
              {tier.name}
            </p>

            <p className="mt-2">
              <span className="text-4xl font-semibold">{tier.price}</span>
              <span className="text-muted-foreground text-sm">/mo</span>
            </p>

            <p className="text-sm text-muted-foreground mt-3">
              {tier.description}
            </p>

            <ul className="mt-6 space-y-3">
              {tier.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              className={cn(
                "mt-auto pt-6",
                tier.highlighted
                  ? "bg-primary text-primary-foreground rounded-full py-2.5 w-full font-mono text-sm hover:bg-primary/80 transition-colors"
                  : "border border-foreground/20 rounded-full py-2.5 w-full font-mono text-sm text-foreground hover:bg-muted transition-colors"
              )}
            >
              {tier.cta}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
