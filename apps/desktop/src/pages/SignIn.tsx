import { useRef, useState } from "react";
import { Loader2, ArrowRight, ChevronLeft } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ask } from "@tauri-apps/plugin-dialog";
import {
  startDeviceFlow,
  exchangeDeviceCode,
  probeServerInfo,
} from "@/lib/api";
import { setState } from "@/lib/store";
import { saveTokensToKeychain } from "@/lib/tauri";
import { SELFBOX_CLOUD_URL } from "@/lib/config";
import { isCloudUrl, validateServerUrl } from "@/lib/server-url";

type Phase = "idle" | "verifying" | "waiting" | "error";
type Mode = "cloud" | "custom";

export function SignIn() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [mode, setMode] = useState<Mode>("cloud");
  const [customUrl, setCustomUrl] = useState("");
  const [userCode, setUserCode] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [error, setError] = useState("");
  // Lets the user back out of the "waiting for browser approval" state
  // without having to wait for the timeout. The poll loop checks this
  // ref before each exchange call AND after each await — both points
  // are necessary, because the user might press Cancel while a request
  // is in flight.
  const cancelledRef = useRef(false);

  const cancelWaiting = () => {
    cancelledRef.current = true;
    setPhase("idle");
    setUserCode("");
    setVerificationUrl("");
    setError("");
  };

  const signInToCloud = () => beginSignIn(SELFBOX_CLOUD_URL, /* trusted */ true);

  const signInToCustom = async () => {
    const validation = validateServerUrl(customUrl);
    if (!validation.ok) {
      setError(validation.error);
      setPhase("error");
      return;
    }
    const normalized = validation.url.toString().replace(/\/+$/, "");

    setPhase("verifying");
    setError("");

    let info;
    try {
      info = await probeServerInfo(normalized);
    } catch {
      setPhase("error");
      setError(
        `We couldn't verify that's a Selfbox server at ${validation.url.hostname}. Check the URL and try again.`,
      );
      return;
    }

    if (info.service !== "selfbox") {
      setPhase("error");
      setError(
        `That URL responded, but it doesn't look like a Selfbox server.`,
      );
      return;
    }

    // The server identifies itself as Cloud but the host isn't selfbox.app
    // — either a misconfigured self-host or something actively deceptive.
    // Block rather than trust the self-report.
    if (info.cloud && !isCloudUrl(normalized)) {
      setPhase("error");
      setError(
        `That server claims to be Selfbox Cloud but isn't at selfbox.app. For safety, we only trust the real Cloud URL.`,
      );
      return;
    }

    // Self-hosted: confirm before proceeding so the user explicitly
    // acknowledges the host they're trusting. Belt-and-braces for the
    // "I pasted a link without realizing it wasn't selfbox.app" case.
    if (!info.cloud) {
      const confirmed = await ask(
        `You're about to sign in to ${validation.url.hostname}. This is a self-hosted Selfbox, not selfbox.app — only continue if you trust the operator with your files.`,
        {
          title: "Sign in to self-hosted Selfbox",
          kind: "warning",
          okLabel: "Continue",
          cancelLabel: "Cancel",
        },
      );
      if (!confirmed) {
        setPhase("idle");
        return;
      }
    }

    await beginSignIn(normalized, /* trusted */ false);
  };

  const beginSignIn = async (finalServerUrl: string, _trusted: boolean) => {
    setState({ serverUrl: finalServerUrl });
    setPhase("verifying");
    setError("");
    cancelledRef.current = false;
    try {
      const platform = navigator.userAgent.includes("Mac")
        ? "macos"
        : navigator.userAgent.includes("Win")
          ? "windows"
          : "linux";

      const ticket = await startDeviceFlow(platform);
      if (cancelledRef.current) return;
      setUserCode(ticket.userCode);
      setVerificationUrl(ticket.verificationUriComplete);
      openUrl(ticket.verificationUriComplete).catch(() => {});

      const interval = (ticket.intervalSeconds ?? 5) * 1000;
      const pollUntil = new Date(ticket.expiresAt).getTime();

      setPhase("waiting");

      const poll = async () => {
        if (cancelledRef.current) return;
        if (Date.now() > pollUntil) {
          setPhase("error");
          setError("Approval timed out. Try again.");
          return;
        }
        try {
          const result = await exchangeDeviceCode(ticket.deviceCode);
          if (cancelledRef.current) return;
          if (result.status === "approved") {
            saveTokensToKeychain(result.accessToken, result.refreshToken).catch(
              () => {},
            );
            setState({
              screen: "workspace-setup",
              accessToken: result.accessToken,
              refreshToken: result.refreshToken,
              deviceId: result.deviceId,
              userId: result.userId,
            });
            return;
          }
        } catch {}
        if (cancelledRef.current) return;
        setTimeout(poll, interval);
      };

      setTimeout(poll, interval);
    } catch (err) {
      if (cancelledRef.current) return;
      setPhase("error");
      setError(err instanceof Error ? err.message : "Couldn't start sign-in");
    }
  };

  return (
    <div className="flex h-screen flex-col bg-paper" data-tauri-drag-region>
      <div
        className="flex items-center gap-3 px-6 pt-6"
        data-tauri-drag-region
      >
        <SelfboxMark />
        <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
          selfbox
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-center px-8">
        {phase === "idle" && mode === "cloud" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-serif text-3xl italic leading-[1.05] text-ink-strong">
                Connect your
                <br />
                desktop.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Sign in to Selfbox and we'll mirror your workspace to this
                computer.
              </p>
            </div>

            <button
              onClick={signInToCloud}
              className="group flex w-full items-center justify-between rounded-md bg-ink-strong px-4 py-2.5 text-sm font-medium text-paper transition-all hover:bg-brand-500"
            >
              <span>Sign in with Selfbox</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>

            <button
              onClick={() => {
                setMode("custom");
                setError("");
              }}
              className="text-xs text-muted underline-offset-4 hover:text-ink hover:underline"
            >
              Self-hosted? Use a custom server
            </button>
          </div>
        )}

        {phase === "idle" && mode === "custom" && (
          <div className="space-y-6">
            <button
              onClick={() => {
                setMode("cloud");
                setError("");
                setCustomUrl("");
              }}
              className="-ml-1 flex items-center gap-1 text-xs text-muted hover:text-ink"
            >
              <ChevronLeft className="h-3 w-3" />
              <span>Back</span>
            </button>

            <div>
              <h1 className="font-serif text-3xl italic leading-[1.05] text-ink-strong">
                Self-hosted
                <br />
                Selfbox.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                Enter the URL of the Selfbox server you run. We'll verify it
                looks right before opening your browser to sign in.
              </p>
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Server URL
              </label>
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                autoFocus
                className="w-full border-b border-border-strong bg-transparent px-0 py-2 font-mono text-sm text-ink-strong outline-none transition-colors focus:border-brand-500"
                placeholder="https://selfbox.example.com"
              />
            </div>

            <button
              onClick={signInToCustom}
              className="group flex w-full items-center justify-between rounded-md bg-ink-strong px-4 py-2.5 text-sm font-medium text-paper transition-all hover:bg-brand-500"
            >
              <span>Continue</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}

        {phase === "verifying" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-serif text-3xl italic leading-[1.05] text-ink-strong">
                Checking
                <br />
                the server.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                One moment — verifying the server looks right.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Talking to the server…</span>
            </div>
          </div>
        )}

        {phase === "waiting" && (
          <div className="space-y-6">
            <div>
              <h1 className="font-serif text-3xl italic leading-[1.05] text-ink-strong">
                Approve in
                <br />
                your browser.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                We opened Selfbox in your browser. Confirm the code below
                matches what you see there.
              </p>
            </div>

            <div className="border-y border-border py-5">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Verification code
              </p>
              <p className="font-mono text-3xl tracking-[0.3em] text-ink-strong">
                {userCode}
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Waiting for approval</span>
            </div>

            <div className="flex items-center gap-4 text-xs">
              <button
                onClick={() => openUrl(verificationUrl).catch(() => {})}
                className="text-brand-600 underline-offset-4 hover:underline"
              >
                Open browser again
              </button>
              <span className="text-subtle">·</span>
              <button
                onClick={cancelWaiting}
                className="text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="space-y-5">
            <div>
              <h1 className="font-serif text-3xl italic leading-[1.05] text-ink-strong">
                Something
                <br />
                went wrong.
              </h1>
              <p className="mt-3 text-sm leading-relaxed text-danger">
                {error}
              </p>
            </div>

            <button
              onClick={() => {
                setPhase("idle");
                setError("");
              }}
              className="group flex items-center gap-2 text-sm font-medium text-ink-strong transition-colors hover:text-brand-500"
            >
              <span>Try again</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        )}
      </div>

      <div className="border-t border-border px-6 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">
          v0.1.0 · device session
        </p>
      </div>
    </div>
  );
}

function SelfboxMark() {
  return (
    <svg
      className="h-8 w-8"
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect width="100" height="100" rx="22" fill="var(--color-brand-500)" />
      <path
        d="M47.5435 64.0716L31.1272 33.7255C19.3719 52.8378 26.5322 41.1936 21.3381 49.6405C25.9001 58.0734 30.4642 66.5052 35.0262 74.9381L63.7768 75.739L65.263 73.3212C46.4936 38.6253 54.394 53.1923 42.0049 30.2906L62.1574 30.8466L65.5921 37.1957C61.272 37.0717 56.9519 36.9421 52.6321 36.8237C58.1013 46.9339 63.573 57.0485 69.0471 67.1676C76.4266 55.1693 78.3928 51.972 78.8373 51.2491C74.2732 42.8174 69.7102 34.3879 65.146 25.9562L36.3976 25.1541L34.9114 27.5719C53.676 62.2589 45.7913 47.7207 58.1696 70.6025L38.0242 70.0598L34.5908 63.7129L47.5447 64.0738L47.5435 64.0716Z"
        fill="white"
      />
    </svg>
  );
}
