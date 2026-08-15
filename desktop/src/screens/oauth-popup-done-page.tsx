/**
 * Target for Clerk `redirectUrl` after GitHub account linking in the Tauri
 * OAuth popup. Intentionally does not call Clerk sign-in callbacks — linking
 * is already finished when this page loads; the native shell closes the popup
 * and soft-notifies the main window to reload the user.
 */
export function OauthPopupDonePage() {
  return (
    <div className="settings-panel" style={{ padding: 24 }}>
      <h1>Connected</h1>
      <p>You can close this window.</p>
    </div>
  );
}
