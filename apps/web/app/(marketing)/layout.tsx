import { Navbar } from "./_components/navbar";
import { Footer } from "./_components/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="light relative flex min-h-screen w-full flex-col items-center bg-[#fafaf9]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
      >
        Skip to main content
      </a>
      <Navbar />
      <main id="main-content" className="max-w-6xl w-full flex-1 px-2.5 md:px-6 pt-14">
        {children}
      </main>
      <Footer />
    </div>
  );
}
