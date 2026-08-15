import { useClerk } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { consumeGithubOauthReturnUrl } from "../lib/github-oauth";

const ESCAPE_MS = 1200;

/**
 * Used after Clerk redirects back from GitHub / SSO.
 *
 * In the packaged Tauri OAuth *popup*, this route must not call
 * `handleRedirectCallback` — that API is for sign-in and will wipe the
 * already-authenticated main-window session (shared WKWebView cookies).
 * The native shell closes the popup and soft-notifies main instead.
 */
export function SsoCallbackPage() {
  const clerk = useClerk();
  const navigate = useNavigate();
  const [message] = useState(
    "Finishing authorization. You will be redirected shortly.",
  );

  useEffect(() => {
    if (!clerk.loaded) return;

    const returnUrl = consumeGithubOauthReturnUrl();
    let navigated = false;

    const goBack = () => {
      if (navigated) return;
      navigated = true;
      try {
        const url = new URL(returnUrl, window.location.origin);
        if (url.origin === window.location.origin) {
          navigate(`${url.pathname}${url.search}${url.hash}`, { replace: true });
          return;
        }
      } catch {
        // fall through
      }
      window.location.replace(returnUrl);
    };

    // Popup / already signed-in: external account link is done server-side.
    // Reloading the user is enough — never run the sign-in redirect callback.
    if (clerk.user) {
      const escapeTimer = window.setTimeout(goBack, ESCAPE_MS);
      void clerk.user
        .reload()
        .catch(() => undefined)
        .finally(goBack);
      return () => window.clearTimeout(escapeTimer);
    }

    const escapeTimer = window.setTimeout(goBack, ESCAPE_MS);

    void clerk
      .handleRedirectCallback({
        signInForceRedirectUrl: returnUrl,
        signUpForceRedirectUrl: returnUrl,
        signInFallbackRedirectUrl: returnUrl,
        signUpFallbackRedirectUrl: returnUrl,
        continueSignUpUrl: returnUrl,
      })
      .catch(() => undefined)
      .finally(() => {
        const reload = clerk.user?.reload();
        if (reload) {
          void reload.catch(() => undefined).finally(goBack);
          return;
        }
        goBack();
      });

    return () => {
      window.clearTimeout(escapeTimer);
    };
  }, [clerk.loaded]); // eslint-disable-line react-hooks/exhaustive-deps -- avoid clerk identity churn

  return (
    <div className="settings-panel" style={{ padding: 24 }}>
      <h1>Connecting GitHub…</h1>
      <p>{message}</p>
      <p>
        <a href="/settings/github">Continue to GitHub settings</a>
      </p>
    </div>
  );
}
