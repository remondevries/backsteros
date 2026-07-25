"use client";

import { ClerkProvider, SignedIn, SignedOut, SignIn } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ConfigureAuthScreen } from "@/components/configure-auth-screen";
import { ConsoleApiProvider } from "@/lib/api-context";
import { AgentTestingModeProvider } from "@/lib/agent-testing-mode-context";
import { GITHUB_SSO_CALLBACK_PATH } from "@/lib/github-oauth";

function isTauriShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
}

function useTauriShellClass() {
  useEffect(() => {
    const isTauri = isTauriShell();
    document.documentElement.classList.toggle("is-tauri-shell", isTauri);
    // Keep the native macOS title blank; Overlay + hiddenTitle hide the chrome.
    if (isTauri) {
      document.title = "";
    }
    return () => {
      document.documentElement.classList.remove("is-tauri-shell");
    };
  }, []);
}

function SignedInConsole({
  apiUrl,
  children,
}: {
  apiUrl: string;
  children: ReactNode;
}) {
  return (
    <ConsoleApiProvider apiUrl={apiUrl}>
      <AgentTestingModeProvider>{children}</AgentTestingModeProvider>
    </ConsoleApiProvider>
  );
}

function SignInGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Popup OAuth is flaky in the packaged WKWebView (async window.open after
  // Clerk's network call). Prefer a same-window redirect once we know we are
  // inside Tauri; detect after mount to avoid SSR/hydration mismatch.
  const [oauthFlow, setOauthFlow] = useState<"popup" | "redirect">("popup");

  useEffect(() => {
    if (isTauriShell()) setOauthFlow("redirect");
  }, []);

  if (pathname === GITHUB_SSO_CALLBACK_PATH) {
    return <>{children}</>;
  }

  return (
    <>
      <SignedIn key="signed-in">{children}</SignedIn>
      <SignedOut key="signed-out">
        <div className="console-auth">
          <div className="console-auth-panel">
            <SignIn
              routing="hash"
              oauthFlow={oauthFlow}
              fallbackRedirectUrl="/"
              appearance={{
                elements: {
                  rootBox: "console-auth-clerk",
                  card: "console-auth-clerk-card",
                },
              }}
            />
          </div>
        </div>
      </SignedOut>
    </>
  );
}

export function Providers({
  children,
  publishableKey,
  apiUrl,
}: {
  children: ReactNode;
  publishableKey: string;
  apiUrl: string;
}) {
  useTauriShellClass();

  if (!publishableKey) {
    return <ConfigureAuthScreen />;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInFallbackRedirectUrl="/"
      afterSignOutUrl="/"
      // Keep OAuth / post-auth redirects on this origin (dev console), not the
      // production Clerk application home URL (backsteros.com/app).
      allowedRedirectOrigins={
        typeof window !== "undefined" ? [window.location.origin] : undefined
      }
    >
      <SignInGate>
        <SignedInConsole apiUrl={apiUrl}>{children}</SignedInConsole>
      </SignInGate>
    </ClerkProvider>
  );
}
