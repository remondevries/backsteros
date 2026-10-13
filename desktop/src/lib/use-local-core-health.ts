import { useEffect, useState } from "react";

import { getDesktopPublicEnvironment } from "./env";

const DEFAULT_POLL_MS = 15_000;
const HEALTH_TIMEOUT_MS = 3_000;

/** Poll local-core `/health` — null while unknown, false when offline. */
export function useLocalCoreHealth(pollMs = DEFAULT_POLL_MS): boolean | null {
  const apiUrl = getDesktopPublicEnvironment().apiUrl.replace(/\/$/, "");
  const [reachable, setReachable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const response = await fetch(`${apiUrl}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
        });
        if (!cancelled) {
          setReachable(response.ok);
        }
      } catch {
        if (!cancelled) {
          setReachable(false);
        }
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

  return reachable;
}
