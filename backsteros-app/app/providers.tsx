"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { AppApiProvider } from "@/lib/api-context";
import { PowerSyncProvider } from "@/lib/powersync-context";

const noToken = async () => null;

export function Providers({
  children,
  publishableKey,
  apiUrl,
}: {
  children: ReactNode;
  publishableKey: string;
  apiUrl: string;
}) {
  const content = (
    <AppApiProvider apiUrl={apiUrl} tokenProvider={process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1" ? noToken : undefined}>
      <PowerSyncProvider apiUrl={apiUrl} e2e={process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1"}>{children}</PowerSyncProvider>
    </AppApiProvider>
  );

  if (process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1") {
    return (
      <>
        {content}
        <Toaster closeButton position="bottom-right" toastOptions={{ className: "app-notification-toast" }} />
      </>
    );
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signInFallbackRedirectUrl="/projects"
      afterSignOutUrl="/sign-in"
    >
      {content}
      <Toaster
        closeButton
        position="bottom-right"
        toastOptions={{ className: "app-notification-toast" }}
      />
    </ClerkProvider>
  );
}
