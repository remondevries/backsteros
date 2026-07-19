/**
 * Shown when `VITE_CLERK_PUBLISHABLE_KEY` is missing.
 * Desktop requires Clerk for sign-in + PowerSync — no demo/fixture workspace.
 */
export function ConfigureAuthScreen() {
  return (
    <div className="desktop-sign-in">
      <div className="desktop-sign-in-panel">
        <h1 className="desktop-sign-in-brand">BacksterOS</h1>
        <p className="desktop-sign-in-copy">
          Sign-in is required. Set{" "}
          <code className="desktop-sign-in-code">VITE_CLERK_PUBLISHABLE_KEY</code>{" "}
          in <code className="desktop-sign-in-code">backsteros-desktop/.env</code>{" "}
          (see <code className="desktop-sign-in-code">.env.example</code>), then
          restart the app.
        </p>
        <p className="desktop-sign-in-hint">
          Without Clerk there is no workspace data and no local demo fixtures.
        </p>
      </div>
    </div>
  );
}
