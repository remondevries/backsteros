import { type ReactNode } from "react";

import { useClerk } from "@clerk/clerk-react";

import { getDesktopPublicEnvironment } from "../lib/env";

/** Renders children only when Clerk is configured (safe to call useClerk). */
export function DesktopClerkProfileBridge({
  children,
}: {
  children: (actions: {
    onAccount?: () => void;
    onSignOut?: () => void;
  }) => ReactNode;
}) {
  const clerkKey = getDesktopPublicEnvironment().clerkPublishableKey;
  if (!clerkKey) {
    return <>{children({})}</>;
  }
  return (
    <DesktopClerkProfileBridgeInner>{children}</DesktopClerkProfileBridgeInner>
  );
}

function DesktopClerkProfileBridgeInner({
  children,
}: {
  children: (actions: {
    onAccount?: () => void;
    onSignOut?: () => void;
  }) => ReactNode;
}) {
  const { openUserProfile, signOut } = useClerk();
  return (
    <>
      {children({
        onAccount: () => {
          openUserProfile();
        },
        onSignOut: () => {
          void signOut();
        },
      })}
    </>
  );
}
