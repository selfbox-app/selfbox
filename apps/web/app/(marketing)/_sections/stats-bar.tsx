import { Globe, Laptop, Monitor, Smartphone, Tablet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Stat {
  value: string;
  label: string;
}

const stats: Stat[] = [
  { value: "10M+", label: "Files stored" },
  { value: "99.99%", label: "Uptime" },
  { value: "<50ms", label: "Sync latency" },
  { value: "AES-256", label: "Encryption" },
];

const platformIcons: LucideIcon[] = [
  Monitor,
  Smartphone,
  Globe,
  Laptop,
  Tablet,
];

export function StatsBar() {
  return (
    <div className="border-x border-border my-10 md:my-20">
      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 border-b border-border">
        {stats.map((stat) => (
          <div key={stat.label} className="px-6 py-6">
            <p className="font-mono text-3xl md:text-4xl font-semibold tabular-nums">
              {stat.value}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Trust row */}
      <div className="px-6 py-6">
        <p className="text-sm text-muted-foreground text-center">
          Trusted by teams and individuals everywhere.
        </p>
        <div className="flex justify-center gap-8 mt-4 opacity-40">
          {platformIcons.map((Icon, index) => (
            <Icon key={index} className="w-6 h-6" />
          ))}
        </div>
      </div>
    </div>
  );
}
