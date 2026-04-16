"use client";

import { MotionDiv } from "../_components/fade-in";

const steps = [
  {
    number: "1",
    title: "Deploy Selfbox",
    description:
      "Clone the repo, run pnpm install, set up PostgreSQL, and start the server. Works out of the box for local development. For production, deploy to any Node.js-compatible platform.",
  },
  {
    number: "2",
    title: "Connect your storage",
    description:
      "Set BLOB_STORAGE_PROVIDER in your .env to local, s3, r2, or vercel. That's it. Switch providers anytime without touching code.",
  },
  {
    number: "3",
    title: "Manage your files",
    description:
      "Upload, organize, and share files from your own infrastructure. Invite team members, create share links, and access everything via the web UI or API.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-muted py-16 md:py-20">
      <div className="grid-layout w-full">
        <MotionDiv
          className="col-span-full mb-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.5 }}
        >
          <p className="mkt-label text-primary">Getting started</p>
          <h2 className="mkt-heading mt-2 text-foreground">How It Works</h2>
        </MotionDiv>

        {steps.map((step, index) => (
          <MotionDiv
            key={step.number}
            className="col-span-full lg:col-span-4"
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: index * 0.1 }}
          >
            <div className="flex h-full flex-col rounded-xl border border-border bg-background p-6">
              <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                {step.number}
              </div>
              <h3 className="mkt-subheading text-foreground">{step.title}</h3>
              <p className="mkt-body-sm mt-2 text-muted-foreground">
                {step.description}
              </p>
            </div>
          </MotionDiv>
        ))}
      </div>
    </section>
  );
}
