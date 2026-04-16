import { HardDrive, RefreshCw, Share2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FeaturePill {
  icon: LucideIcon;
  title: string;
  description: string;
}

const pills: FeaturePill[] = [
  {
    icon: HardDrive,
    title: "Storage",
    description:
      "End-to-end encrypted file storage you can self-host anywhere.",
  },
  {
    icon: RefreshCw,
    title: "Sync",
    description:
      "Real-time sync across all your devices, with offline support.",
  },
  {
    icon: Share2,
    title: "Share",
    description: "Secure file sharing with granular access controls.",
  },
];

export function FeaturePills() {
  return (
    <div className="border-x border-b border-border">
      <div className="grid grid-cols-1 md:grid-cols-3 md:divide-x divide-border">
        {pills.map((pill) => {
          const Icon = pill.icon;
          return (
            <div
              key={pill.title}
              className="px-6 py-5 border-b md:border-b-0 border-border last:border-b-0"
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="w-5 h-5 text-muted-foreground" />
                <span className="font-mono text-sm font-medium">
                  {pill.title}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {pill.description}
              </p>
              <a
                href="#"
                className="inline-block mt-3 font-mono text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Learn more <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}
