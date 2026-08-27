import { useCallback, useMemo } from "react";

import { useMobileCoreApiUrl } from "./api-url-context";
import { isMobileApiNetworkError } from "./probe-core-health";
import {
  useSyncedOrRest,
  type UseSyncedOrRestOptions,
} from "./use-synced-or-rest";
import { resolveSyncedOrRestRows } from "./resolve-synced-or-rest-rows";

type UseScreenListOptions<
  TLocal extends Record<string, unknown>,
  TRow,
> = UseSyncedOrRestOptions<TLocal, TRow>;

/**
 * Standard list screen contract: synced-or-rest rows + shared network errors.
 */
export function useScreenList<
  TLocal extends Record<string, unknown>,
  TRow,
>(options: UseScreenListOptions<TLocal, TRow>) {
  const { formatNetworkError, isNetworkError } = useMobileCoreApiUrl();
  const result = useSyncedOrRest(options);

  const mapNetworkError = useCallback(
    (reason: unknown): never => {
      const detail =
        reason instanceof Error ? reason.message : String(reason);
      throw new Error(
        isNetworkError(detail) ? formatNetworkError() : detail,
      );
    },
    [formatNetworkError, isNetworkError],
  );

  const displayError = useMemo(() => {
    if (!result.error) return null;
    return isNetworkError(result.error)
      ? formatNetworkError()
      : result.error;
  }, [formatNetworkError, isNetworkError, result.error]);

  return {
    ...result,
    rows: result.rows,
    error: displayError,
    mapNetworkError,
    formatNetworkError,
    isNetworkError,
  };
}

export { resolveSyncedOrRestRows };
