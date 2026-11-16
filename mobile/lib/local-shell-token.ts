import type { TokenProvider } from "@backsteros/api-client";
import { isOwnerApiKeySecretFormat } from "@backsteros/contracts";

/** Stable PowerSync DB key (matches core + desktop). */
export const LOCAL_SHELL_USER_ID = "local_shell";

/**
 * Pure bearer resolution (mirrors desktop `loadDesktopProductToken`): the
 * configured `EXPO_PUBLIC_LOCAL_SHELL_TOKEN` wins, else a well-formed owner
 * Access key. There is deliberately NO `"local"` default — an unconfigured app
 * sends no Authorization header instead of guessing the loopback token.
 */
export function resolveLocalShellBearerToken(input: {
  configured?: string | null;
  ownerApiKey?: string | null;
}): string | null {
  const configured = input.configured?.trim();
  if (configured) return configured;
  const owner = input.ownerApiKey?.trim();
  if (owner && isOwnerApiKeySecretFormat(owner)) return owner;
  return null;
}

/** Token provider over a resolver; `null` means "send no Bearer". */
export function createTokenProvider(
  resolve: () => string | null,
): TokenProvider {
  return () => resolve();
}
