import { createApiClient, createClerkTokenProvider } from "@backsteros/api-client";
import { useAuth } from "@clerk/clerk-expo";
import { useMemo, useRef } from "react";

import { getMobileEnvironment } from "./env";

/**
 * Stable API client for the signed-in Clerk session.
 * Token getter is ref-backed so the client identity does not churn each render.
 */
export function useMobileApiClient() {
  const { getToken } = useAuth();
  const { apiUrl } = getMobileEnvironment();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(
    () =>
      createApiClient({
        baseUrl: apiUrl,
        getToken: createClerkTokenProvider((options) =>
          getTokenRef.current(options),
        ),
      }),
    [apiUrl],
  );
}
