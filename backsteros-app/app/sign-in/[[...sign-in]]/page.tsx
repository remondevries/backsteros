import { SignIn } from "@clerk/nextjs";

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
      {process.env.NEXT_PUBLIC_E2E_BYPASS_AUTH === "1" ? (
        <div aria-label="Sign in">Sign in to continue</div>
      ) : (
        <SignIn routing="path" path="/sign-in" />
      )}
    </main>
  );
}
