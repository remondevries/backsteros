import type { TokenProvider } from "@backsteros/api-client";

import { getMobileEnvironment } from "./env";
import {
  LOCAL_SHELL_USER_ID,
  createTokenProvider,
} from "./local-shell-token";

export { LOCAL_SHELL_USER_ID, resolveLocalShellBearerToken } from "./local-shell-token";

/**
 * Configured local-shell bearer (`EXPO_PUBLIC_LOCAL_SHELL_TOKEN`, else owner
 * Access key). `null` when neither is set — no default `"local"`.
 */
export function getLocalShellToken(): string | null {
  return getMobileEnvironment().localShellToken;
}

/** Bearer provider; resolves `null` (no Authorization header) when unconfigured. */
export function createMobileTokenProvider(): TokenProvider {
  return createTokenProvider(getLocalShellToken);
}
