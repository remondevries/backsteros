"use client";

import { ClerkProvider } from "@clerk/nextjs";
import type { ReactNode } from "react";
import { Toaster } from "sonner";

import { CommandPaletteProvider } from "@/components/command-palette/command-palette-context";
import { ListKeyboardNavigationProvider } from "@/components/shortcuts/list-keyboard-navigation-provider";
import { AppTimezoneProvider } from "@/components/settings/app-timezone-provider";
import { AppApiProvider } from "@/lib/api-context";
import {
  BackendModeProvider,
  useBackendMode,
} from "@/lib/backend-mode-context";
import { isE2eAuthBypassEnabled } from "@/lib/e2e-bypass-auth";
import { MutationProvider } from "@/lib/mutations";
import { PowerSyncProvider } from "@/lib/powersync-context";

const noToken = async () => null;

function ProvidersWithBackend({ children }: { children: ReactNode }) {
  const { apiUrl, mode } = useBackendMode();
  const e2e = isE2eAuthBypassEnabled();

  return (
    <AppApiProvider apiUrl={apiUrl} tokenProvider={e2e ? noToken : undefined}>
      <PowerSyncProvider apiUrl={apiUrl} backendMode={mode} e2e={e2e}>
        <MutationProvider>
          <AppTimezoneProvider>
            <CommandPaletteProvider>
              <ListKeyboardNavigationProvider>
                {children}
              </ListKeyboardNavigationProvider>
            </CommandPaletteProvider>
          </AppTimezoneProvider>
        </MutationProvider>
      </PowerSyncProvider>
    </AppApiProvider>
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
  const content = (
    <BackendModeProvider envApiUrl={apiUrl}>
      <ProvidersWithBackend>{children}</ProvidersWithBackend>
    </BackendModeProvider>
  );

  if (isE2eAuthBypassEnabled()) {
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
