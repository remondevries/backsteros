import { createApiClient } from "@backsteros/api-client";
import { useMemo } from "react";

import { useMobileCoreApiUrl } from "./api-url-context";
import { createMobileTokenProvider } from "./local-shell-auth";

/** Stable API client for local-shell bearer auth. */
export function useMobileApiClient() {
  const { activeApiUrl } = useMobileCoreApiUrl();

  return useMemo(
    () =>
      createApiClient({
        baseUrl: activeApiUrl,
        getToken: createMobileTokenProvider(),
      }),
    [activeApiUrl],
  );
}
