"use client";

import { useClerk, useSignIn } from "@clerk/nextjs";
import { useState } from "react";

import { GITHUB_SSO_CALLBACK_PATH, rememberGithubOauthReturnUrl } from "@/lib/github-oauth";

function isTauriShell(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
  );
}

/**
 * GitHub OAuth for the Tauri shell. Clerk's SignIn oauthFlow="popup" still falls
 * back to a full-page redirect in WKWebView; that hangs on GitHub's
 * "You are being redirected…" interstitial. Opening about:blank synchronously
 * and passing it to authenticateWithPopup keeps the flow in a related window.
 */
export function TauriGithubSignIn() {
  const { isLoaded, signIn } = useSignIn();
  const { setActive } = useClerk();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function signInWithGithub() {
    if (!isLoaded || !signIn) return;
    setError(null);
    setPending(true);

    const popup = window.open(
      "about:blank",
      "development-ade-clerk-oauth",
      "popup=yes,width=520,height=780",
    );

    try {
      const origin = window.location.origin;
      const redirectUrl = `${origin}${GITHUB_SSO_CALLBACK_PATH}`;
      rememberGithubOauthReturnUrl(`${origin}/`);
      await signIn.authenticateWithPopup({
        strategy: "oauth_github",
        redirectUrl,
        redirectUrlComplete: `${origin}/`,
        popup,
      });

      if (signIn.createdSessionId) {
        await setActive({ session: signIn.createdSessionId });
      }
      window.location.assign("/");
    } catch (reason) {
      popup?.close();
      setError(
        reason instanceof Error ? reason.message : "GitHub sign-in failed",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="console-auth-tauri">
      <h1>Development ADE</h1>
      <p>Sign in with GitHub to open the console.</p>
      <button
        type="button"
        className="console-auth-github-btn"
        disabled={!isLoaded || pending}
        onClick={() => {
          void signInWithGithub();
        }}
      >
        {pending ? "Waiting for GitHub…" : "Continue with GitHub"}
      </button>
      {error ? <p className="console-auth-error">{error}</p> : null}
      {!isTauriShell() ? null : (
        <p className="console-auth-hint">
          A sign-in window opens beside this app. Finish there, then return here.
        </p>
      )}
    </div>
  );
}
