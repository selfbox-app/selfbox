"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { startTransition, useState } from "react";
import { CheckCircle2, Laptop, Loader2 } from "lucide-react";
import { useSession } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function DesktopAuthorizePage() {
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();
  const [submitting, setSubmitting] = useState(false);
  const [approved, setApproved] = useState(false);

  const userCode = searchParams.get("user_code") ?? "";

  const handleApprove = () => {
    startTransition(async () => {
      setSubmitting(true);

      try {
        const response = await fetch("/api/desktop/v1/device/approve", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({ userCode }),
        });

        const payload = (await response.json()) as { error?: string };
        if (!response.ok) {
          toast.error(payload.error ?? "Unable to approve this device");
          return;
        }

        setApproved(true);
      } catch {
        toast.error("Unable to approve this device");
      } finally {
        setSubmitting(false);
      }
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            {approved ? <CheckCircle2 className="size-6" /> : <Laptop className="size-6" />}
          </div>
          <CardTitle>Authorize Selfbox Desktop Sync</CardTitle>
          <CardDescription>
            Approve a desktop app to connect to your Selfbox account with a scoped device session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-lg border bg-muted/40 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Device code
            </p>
            <p className="mt-2 text-2xl font-semibold tracking-[0.3em]">
              {userCode || "MISSING"}
            </p>
          </div>

          {approved ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              This desktop app has been approved. Return to the Selfbox Desktop Sync app to finish linking your account.
            </div>
          ) : null}

          {!userCode ? (
            <p className="text-sm text-destructive">
              This approval link is missing a device code.
            </p>
          ) : null}

          {isPending ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Checking your session…
            </div>
          ) : null}

          {!isPending && !session?.user ? (
            <p className="text-sm text-muted-foreground">
              Sign in first, then come back to approve this device.{" "}
              <Link href="/login" className="text-primary underline underline-offset-4">
                Go to login
              </Link>
            </p>
          ) : null}

          {!approved && session?.user ? (
            <Button
              className="w-full"
              disabled={!userCode || submitting}
              onClick={handleApprove}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Approve desktop app"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
