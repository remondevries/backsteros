import { SignIn } from "@clerk/clerk-react";
import { DevelopmentAdeLogoIcon } from "@backsteros/ui";

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
        <h1 className="desktop-sign-in-brand">
          <span className="desktop-sign-in-brand-thin">Backster</span>
          <span className="desktop-sign-in-brand-bold">OS</span>
        </h1>
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

/** Fallback loading UI matching `index.html` boot splash (logo + brand). */
export function SignInLoadingScreen() {
  return (
    <div
      className="desktop-sign-in"
      role="status"
      aria-live="polite"
      aria-label="Loading BacksterOS"
    >
      <div className="desktop-sign-in-panel">
        <div className="desktop-sign-in-brand-row">
          <DevelopmentAdeLogoIcon
            className="desktop-sign-in-logo desktop-sign-in-logo--spin"
            size={28}
          />
          <h1 className="desktop-sign-in-brand">
            <span className="desktop-sign-in-brand-thin">Backster</span>
            <span className="desktop-sign-in-brand-bold">OS</span>
          </h1>
        </div>
      </div>
    </div>
  );
}
