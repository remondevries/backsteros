import { useMemo, useState } from "react";

import {
  dismissVersionMismatch,
  formatVersionMismatchWarning,
  isVersionMismatchDismissed,
  versionMismatchDismissalKey,
} from "../lib/local-core-version-mismatch";
import { useLocalCoreVersionMismatch } from "../lib/use-local-core-version-mismatch";

/**
 * Persistent, dismissible banner when local-core `/health` reports a peer
 * version mismatch. Dismissal is per local+peer commit pair so a later drift
 * shows again.
 */
export function DesktopVersionMismatchNotice() {
  const mismatch = useLocalCoreVersionMismatch();
  const dismissKey = mismatch ? versionMismatchDismissalKey(mismatch) : null;
  const [hiddenKey, setHiddenKey] = useState<string | null>(null);

  const dismissed = useMemo(() => {
    if (!dismissKey) return false;
    if (hiddenKey === dismissKey) return true;
    return isVersionMismatchDismissed(dismissKey);
  }, [dismissKey, hiddenKey]);

  if (!mismatch || !dismissKey || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      style={{
        padding: "0.6rem 1rem",
        borderBottom: "1px solid var(--border, #333)",
        fontSize: "0.85rem",
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
        justifyContent: "space-between",
      }}
    >
      <p style={{ margin: 0 }}>{formatVersionMismatchWarning(mismatch)}</p>
      <button
        type="button"
        onClick={() => {
          dismissVersionMismatch(dismissKey);
          setHiddenKey(dismissKey);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
