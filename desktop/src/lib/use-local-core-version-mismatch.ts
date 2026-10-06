import { useEffect, useState } from "react";

import { getDesktopPublicEnvironment } from "./env";
import {
  parseHealthVersionMismatch,
  type LocalCoreVersionMismatch,
} from "./local-core-version-mismatch";

const DEFAULT_POLL_MS = 15_000;
const HEALTH_TIMEOUT_MS = 3_000;

/** Poll `/health` for `versionMismatch` — null when in sync or unreachable. */
export function useLocalCoreVersionMismatch(
  pollMs = DEFAULT_POLL_MS,
): LocalCoreVersionMismatch | null {
  const apiUrl = getDesktopPublicEnvironment().apiUrl.replace(/\/$/, "");
  const [mismatch, setMismatch] = useState<LocalCoreVersionMismatch | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (!response.ok) {
          if (!cancelled) setMismatch(null);
          return;
        }
        const body: unknown = await response.json();
        if (!cancelled) {
          setMismatch(parseHealthVersionMismatch(body));
        }
      } catch {
        if (!cancelled) setMismatch(null);
      }
    };

    void check();
    const intervalId = window.setInterval(() => {
      void check();
    }, pollMs);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [apiUrl, pollMs]);

  return mismatch;
}
