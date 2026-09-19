import { useState } from "react";

import {
  DESKTOP_VAULT_MISSING_MESSAGE,
  peekPersistedDesktopVaultRoot,
  rememberDesktopVaultRoot,
} from "../lib/desktop-vault";
import { useCloudClientNotices } from "../lib/cloud-client-notices";
import { projectFs } from "../lib/project-fs";

const DISMISS_KEY = "backsteros:desktop-vault-prompt-dismissed-v1";

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Non-blocking cloud-client notices. Task and project lists do not wait on these.
 */
export function DesktopCloudClientNotices() {
  const notices = useCloudClientNotices();
  const [vaultPath, setVaultPath] = useState<string | null>(() =>
    peekPersistedDesktopVaultRoot(),
  );
  const [hidePrompt, setHidePrompt] = useState(dismissed);
  const [pickError, setPickError] = useState<string | null>(null);

  const showVault = !vaultPath && !hidePrompt;

  if (
    !showVault &&
    !pickError &&
    notices.email !== "disconnected" &&
    notices.presence !== "disconnected" &&
    !notices.rest
  ) {
    return null;
  }

  return (
    <div
      role="status"
      style={{
        padding: "0.6rem 1rem",
        borderBottom: "1px solid var(--border, #333)",
        fontSize: "0.85rem",
        display: "grid",
        gap: "0.35rem",
      }}
    >
      {showVault ? (
        <p>
          {DESKTOP_VAULT_MISSING_MESSAGE}{" "}
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  const next = await projectFs.pickDirectory(undefined);
                  if (!next) return;
                  rememberDesktopVaultRoot(next);
                  setVaultPath(next);
                  setPickError(null);
                } catch (error) {
                  setPickError(
                    error instanceof Error
                      ? error.message
                      : "Could not choose a folder. Set it in Settings → Storage.",
                  );
                }
              })();
            }}
          >
            Choose vault folder
          </button>{" "}
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(DISMISS_KEY, "1");
              } catch {
                // ignore
              }
              setHidePrompt(true);
            }}
          >
            Not now
          </button>
        </p>
      ) : null}
      {pickError ? <p>{pickError}</p> : null}
      {notices.email === "disconnected" ? (
        <p>Email live updates are disconnected. The inbox still loads from the API. Task lists keep syncing.</p>
      ) : null}
      {notices.presence === "disconnected" ? (
        <p>Agent presence is disconnected. Task and project lists keep syncing.</p>
      ) : null}
      {notices.rest ? <p>{notices.rest}</p> : null}
    </div>
  );
}
