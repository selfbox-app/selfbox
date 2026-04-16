"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Logo } from "@/assets/logo";
import { Menu, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useSession } from "@/lib/auth/client";

const navItems = [
  { label: "Features", href: "#features" },
  { label: "Pricing", href: "#pricing" },
  { label: "Download", href: "/download" },
  { label: "Docs", href: "/docs", external: true },
  { label: "Blog", href: "/blog" },
];

export function Navbar() {
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 10);
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-colors duration-200",
        scrolled
          ? "bg-[#fafaf9]/80 backdrop-blur-lg border-b border-border"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-1">
          <Logo className="size-8 text-foreground" />
          <span className="font-mono text-sm font-bold uppercase tracking-wide">
            Selfbox
          </span>
        </Link>

        <ul className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1 font-mono text-sm uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
                {item.external && <ExternalLink className="size-3" />}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-2 md:flex">
          {session ? (
            <Link
              href="/home"
              className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary/80"
            >
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full border border-foreground/20 px-5 py-2 font-mono text-sm text-foreground transition-colors hover:bg-muted"
              >
                Log in
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 font-mono text-sm text-primary-foreground transition-colors hover:bg-primary/80"
              >
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:text-foreground md:hidden"
          onClick={() => setMobileOpen((prev) => !prev)}
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>

      {mobileOpen && (
        <div className="border-b border-border bg-[#fafaf9]/95 backdrop-blur-lg md:hidden">
          <div className="mx-auto max-w-6xl space-y-1 px-4 pb-4 pt-2">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                target={item.external ? "_blank" : undefined}
                rel={item.external ? "noopener noreferrer" : undefined}
                onClick={closeMobile}
                className="flex items-center gap-1 rounded-md px-3 py-2 font-mono text-sm uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {item.label}
                {item.external && <ExternalLink className="size-3" />}
              </Link>
            ))}
            <div className="flex flex-col gap-2 pt-2">
              {session ? (
                <Link
                  href="/home"
                  onClick={closeMobile}
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "w-full rounded-full font-mono text-sm"
                  )}
                >
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={closeMobile}
                    className="inline-flex items-center justify-center rounded-full border border-foreground/20 px-4 py-1.5 font-mono text-sm text-foreground transition-colors hover:bg-muted w-full"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/register"
                    onClick={closeMobile}
                    className={cn(
                      buttonVariants({ variant: "default", size: "sm" }),
                      "w-full rounded-full font-mono text-sm"
                    )}
                  >
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
