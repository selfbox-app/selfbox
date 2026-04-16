"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
interface ProductTab {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}

interface ProductSectionLayoutProps {
  number: string;
  label: string;
  heading: string;
  subtitle: string;
  tabs: ProductTab[];
  ctaLabel: string;
  ctaHref: string;
  renderVisual: (activeTab: number) => React.ReactNode;
}

export function ProductSectionLayout({
  number,
  label,
  heading,
  subtitle,
  tabs,
  ctaLabel,
  ctaHref,
  renderVisual,
}: ProductSectionLayoutProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="border-x border-border">
      {/* Section header */}
      <div className="px-6 pt-10 md:pt-16 pb-8 md:pb-12">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
          {number} — {label}
        </p>
        <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl max-w-2xl leading-tight">
          {heading}
        </h2>
        {subtitle && (
          <p className="text-muted-foreground mt-4 max-w-xl text-lg">
            {subtitle}
          </p>
        )}
      </div>

      {/* Tabs + Visual */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Left: Tab list */}
        <div className="border-t border-border">
          {tabs.map((tab, index) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.title}
                onClick={() => setActiveTab(index)}
                className={cn(
                  "w-full text-left px-6 py-5 border-b border-border transition-colors relative",
                  "hover:bg-muted/50",
                  activeTab === index && "bg-muted/30"
                )}
              >
                {/* Active indicator */}
                {activeTab === index && (
                  <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
                )}
                <div className="flex items-start gap-3">
                  <Icon className="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
                  <div>
                    <p className={cn(
                      "font-mono text-sm font-medium uppercase tracking-wide",
                      activeTab === index ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {tab.title}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {tab.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Right: Visual */}
        <div className="border-t border-l-0 lg:border-l border-border min-h-[300px] lg:min-h-[400px] flex items-center justify-center p-6 bg-muted/20">
          {renderVisual(activeTab)}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="px-6 py-4 border-t border-border">
        <a
          href={ctaHref}
          className="font-mono text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
        >
          {ctaLabel}
          <span aria-hidden>→</span>
        </a>
      </div>
    </div>
  );
}
