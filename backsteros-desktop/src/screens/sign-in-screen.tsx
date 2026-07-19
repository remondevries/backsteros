import { SignIn } from "@clerk/clerk-react";

/**
 * Embedded Clerk sign-in for the Tauri SPA — shown when a publishable key is
 * configured but the user has no session yet.
 *
 * OAuth uses `popup` so GitHub/Google open in a related Tauri window instead of
 * replacing the main shell. (Opening the IdP in the system browser would break
 * Clerk's cookie/state handoff back into the webview.)
 */
export function SignInScreen() {
  return (
    <div className="desktop-sign-in">
      <div className="desktop-sign-in-panel">
        <h1 className="desktop-sign-in-brand">BacksterOS</h1>
        <p className="desktop-sign-in-copy">Sign in to sync your workspace.</p>
        <SignIn
          routing="hash"
          oauthFlow="popup"
          appearance={{
            elements: {
              rootBox: "desktop-sign-in-clerk",
              card: "desktop-sign-in-clerk-card",
            },
          }}
        />
      </div>
    </div>
  );
}

export function SignInLoadingScreen() {
  return (
    <div className="desktop-sign-in" role="status" aria-live="polite">
      <div className="desktop-sign-in-panel">
        <h1 className="desktop-sign-in-brand">BacksterOS</h1>
        <p className="desktop-sign-in-copy">Loading session…</p>
      </div>
    </div>
  );
}
