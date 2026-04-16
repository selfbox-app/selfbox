import { ArrowDown, BookOpen } from "lucide-react";

export function HeroSection() {
  return (
    <section className="pt-28 md:pt-36 pb-10 md:pb-16 text-center">
      <h1 className="font-serif text-4xl md:text-5xl lg:text-7xl leading-tight tracking-tight font-normal">
        File storage <em className="italic">you</em> actually own.
      </h1>
      <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mt-6">
        The open-source alternative to Dropbox and Google Drive. Self-host on
        your infrastructure, bring any storage provider, no vendor lock-in.
      </p>
      <div className="mt-8 flex gap-3 justify-center">
        <a
          href="#learn-more"
          className="inline-flex items-center gap-2 rounded-full border border-foreground/20 px-5 py-2.5 font-mono text-sm text-foreground hover:bg-muted transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          Learn More
        </a>
        <a
          href="#get-started"
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-full px-5 py-2.5 font-mono text-sm hover:bg-primary/80 transition-colors"
        >
          Get Started
          <ArrowDown className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
}
