"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import { withBasePath } from "@/lib/base-path";
import { consumeGithubOauthReturnUrl } from "@/lib/github-oauth";

const ESCAPE_MS = 1200;

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
    <div className="settings-panel" style={{ padding: 48 }}>
      <h1>Connecting GitHub…</h1>
      <p>{message}</p>
      <p>
        <a href={withBasePath("/settings/github")}>Continue to GitHub settings</a>
      </p>
    </div>
  );
}
