import {
  Monitor,
  AppWindow,
  Terminal,
  Smartphone,
  Tablet,
  Globe,
} from "lucide-react";

const platforms = [
  { name: "macOS", icon: Monitor },
  { name: "Windows", icon: AppWindow },
  { name: "Linux", icon: Terminal },
  { name: "iOS", icon: Smartphone },
  { name: "Android", icon: Tablet },
  { name: "Web", icon: Globe },
] as const;

export function PlatformSection() {
  return (
    <section className="border-x border-border my-10 md:my-20">
      <div className="px-6 py-10 md:py-16 text-center border-b border-border">
        <h2 className="font-serif text-3xl md:text-4xl">Works everywhere.</h2>
        <p className="text-muted-foreground mt-3">
          Available on every platform you use.
        </p>
      </div>

      <div className="grid grid-cols-3 md:grid-cols-6 divide-x divide-y border-b border-border">
        {platforms.map(({ name, icon: Icon }) => (
          <div
            key={name}
            className="px-6 py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icon size={28} strokeWidth={1.5} />
            <span className="font-mono text-xs uppercase">{name}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
