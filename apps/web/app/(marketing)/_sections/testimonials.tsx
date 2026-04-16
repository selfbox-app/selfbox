interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
}

const testimonials: Testimonial[] = [
  {
    quote:
      "Selfbox replaced three different tools for us. The sync is instant, encryption gives us peace of mind, and self-hosting means we actually own our data.",
    name: "Maya Chen",
    role: "CTO, Stackline",
    initials: "MC",
  },
  {
    quote:
      "We moved our entire team to Selfbox after our cloud provider changed their privacy policy. Best decision we made \u2014 it just works.",
    name: "James Okafor",
    role: "Head of Engineering, Meridian",
    initials: "JO",
  },
  {
    quote:
      "The file sharing with expiring links is exactly what we needed for client deliverables. Simple, secure, and our clients love it.",
    name: "Sophie Laurent",
    role: "Design Director, Atelier",
    initials: "SL",
  },
];

export function TestimonialsSection() {
  return (
    <section className="border-x border-border my-10 md:my-20">
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x border-b border-t border-border">
        {testimonials.map((testimonial) => (
          <div key={testimonial.initials} className="px-6 py-8">
            <p className="text-sm leading-relaxed text-foreground">
              &ldquo;{testimonial.quote}&rdquo;
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
                {testimonial.initials}
              </div>
              <div>
                <p className="text-sm font-medium">{testimonial.name}</p>
                <p className="text-xs text-muted-foreground">
                  {testimonial.role}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
