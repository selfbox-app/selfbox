import { NextResponse } from "next/server";

// Public, unauthenticated discovery endpoint for the Selfbox desktop app.
//
// The desktop sign-in screen probes this before opening a browser auth
// window, for two reasons:
//   1. To confirm the URL the user typed actually points at a real
//      Selfbox instance — the `service: "selfbox"` field is the
//      discriminator a phishing site wouldn't bother forging.
//   2. To expose basic instance info so the desktop can greet the user
//      with the instance name (if set).
//
// No DB access, no auth, no user-identifiable data. Safe to cache at the
// edge; 5 minutes is plenty — this only matters during the seconds
// between "user typed a URL" and "desktop decides how to handle it".

export const dynamic = "force-static";
export const revalidate = 300;

export function GET() {
  return NextResponse.json(
    {
      service: "selfbox",
      name: process.env.SELFBOX_INSTANCE_NAME ?? undefined,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
