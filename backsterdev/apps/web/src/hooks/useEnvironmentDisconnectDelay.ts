import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useLayoutEffect, useState } from "react";

export function useEnvironmentDisconnectDelay(unavailableEnvironmentId: EnvironmentId | null) {
  const [delay, setDelay] = useState({ environmentId: unavailableEnvironmentId, elapsed: false });
  useLayoutEffect(() => {
    if (delay.environmentId === unavailableEnvironmentId) return;
    setDelay({ environmentId: unavailableEnvironmentId, elapsed: false });
  }, [delay.environmentId, unavailableEnvironmentId]);

  useEffect(() => {
    if (unavailableEnvironmentId === null) return;
    const timeout = setTimeout(
      () => setDelay({ environmentId: unavailableEnvironmentId, elapsed: true }),
      20_000,
    );
    return () => clearTimeout(timeout);
  }, [unavailableEnvironmentId]);

  return (
    unavailableEnvironmentId !== null &&
    delay.environmentId === unavailableEnvironmentId &&
    delay.elapsed
  );
}
