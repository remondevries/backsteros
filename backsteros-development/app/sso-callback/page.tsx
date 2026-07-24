"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import { consumeGithubOauthReturnUrl } from "@/lib/github-oauth";

const ESCAPE_MS = 1200;

/**
 * Completes Clerk's OAuth redirect for GitHub connect/reauthorize.
 *
 * External-account linking often leaves `handleRedirectCallback` hanging, and
 * depending on the full `clerk` object re-runs the effect (clearing timers)
 * without restarting. Depend only on `clerk.loaded` and always hard-navigate.
 */
export default function SsoCallbackPage() {
  const clerk = useClerk();
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
      window.location.replace(returnUrl);
    };

    const escapeTimer = window.setTimeout(goBack, ESCAPE_MS);

    void clerk
      .handleRedirectCallback({
        signInForceRedirectUrl: returnUrl,
        signUpForceRedirectUrl: returnUrl,
        signInFallbackRedirectUrl: returnUrl,
        signUpFallbackRedirectUrl: returnUrl,
        continueSignInUrl: returnUrl,
        continueSignUpUrl: returnUrl,
      })
      .catch(() => {
        // Linking flows may reject; still return to settings.
      })
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
    <div className="console-auth">
      <div className="console-auth-panel">
        <h1>Connecting GitHub…</h1>
        <p>{message}</p>
        <p className="console-auth-hint">
          <a href="/settings/github">Continue to GitHub settings</a>
        </p>
      </div>
    </div>
  );
}
