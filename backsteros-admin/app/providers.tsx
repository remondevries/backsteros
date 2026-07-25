"use client";

import { ClerkProvider, SignedIn, SignedOut, SignIn } from "@clerk/nextjs";
import type { ReactNode } from "react";

import { ConfigureAuthScreen } from "@/components/configure-auth-screen";
import { AdminApiProvider } from "@/lib/api-context";

function SignInGate({ children }: { children: ReactNode }) {
  return (
    <>
      <SignedIn key="signed-in">{children}</SignedIn>
      <SignedOut key="signed-out">
        <div className="admin-auth">
          <div className="admin-auth-panel">
            <SignIn
              routing="hash"
              fallbackRedirectUrl="/"
              appearance={{
                elements: {
                  rootBox: "admin-auth-clerk",
                  card: "admin-auth-clerk-card",
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
      allowedRedirectOrigins={
        typeof window !== "undefined" ? [window.location.origin] : undefined
      }
    >
      <SignInGate>
        <AdminApiProvider apiUrl={apiUrl}>{children}</AdminApiProvider>
      </SignInGate>
    </ClerkProvider>
  );
}
