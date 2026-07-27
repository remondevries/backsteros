import { SignIn } from "@clerk/nextjs";

import { isE2eAuthBypassEnabled } from "@/lib/e2e-bypass-auth";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <span className="brand-mark">B</span>
        <div>
          <strong>Backsteros</strong>
          <span>Your work, connected.</span>
        </div>
      </div>
      {isE2eAuthBypassEnabled() ? (
        <div aria-label="Sign in">Sign in to continue</div>
      ) : (
        <SignIn routing="path" path="/sign-in" />
      )}
    </main>
  );
}
