"use client";

import { ClerkProvider, SignedIn, SignedOut, SignIn } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ConfigureAuthScreen } from "@/components/configure-auth-screen";
import { ConsoleApiProvider } from "@/lib/api-context";
import { AgentTestingModeProvider } from "@/lib/agent-testing-mode-context";
import { GITHUB_SSO_CALLBACK_PATH } from "@/lib/github-oauth";

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
  if (pathname === GITHUB_SSO_CALLBACK_PATH) {
    return <>{children}</>;
  }

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div className="console-auth">
          <div className="console-auth-panel">
            <SignIn
              routing="hash"
              oauthFlow="popup"
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
