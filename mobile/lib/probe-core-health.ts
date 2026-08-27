/** Strip `/api/v1` suffix so `/health` hits core root. */
export function normalizeCoreOrigin(baseUrl: string): string {
  return baseUrl.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
}

export type CoreReachability = {
  localReachable: boolean;
  cloudReachable: boolean;
};

export type ResolvedCoreApi = {
  activeApiUrl: string;
  coreMode: "local" | "cloud";
};

/**
 * Prefer local-core; use cloud-core only when local is unreachable and cloud
 * responded to `/health`.
 */
export function resolveCoreApiUrl(input: {
  localReachable: boolean;
  cloudReachable: boolean;
  localApiUrl: string;
  cloudApiUrl: string | null;
}): ResolvedCoreApi {
  if (input.localReachable) {
    return { activeApiUrl: input.localApiUrl, coreMode: "local" };
  }
  if (input.cloudApiUrl && input.cloudReachable) {
    return { activeApiUrl: input.cloudApiUrl, coreMode: "cloud" };
  }
  return { activeApiUrl: input.localApiUrl, coreMode: "local" };
}

export async function probeCoreHealth(
  baseUrl: string,
  timeoutMs = 2500,
): Promise<boolean> {
  const origin = normalizeCoreOrigin(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin}/health`, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const body = (await response.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function probeCoreReachability(input: {
  localApiUrl: string;
  cloudApiUrl: string | null;
  timeoutMs?: number;
}): Promise<CoreReachability> {
  const localReachable = await probeCoreHealth(
    input.localApiUrl,
    input.timeoutMs,
  );
  if (localReachable || !input.cloudApiUrl) {
    return { localReachable, cloudReachable: false };
  }
  const cloudReachable = await probeCoreHealth(
    input.cloudApiUrl,
    input.timeoutMs,
  );
  return { localReachable, cloudReachable };
}

const NETWORK_ERROR_RE =
  /network request failed|failed to fetch|could not connect|timed out|aborted/i;

export function isMobileApiNetworkError(detail: string): boolean {
  return NETWORK_ERROR_RE.test(detail);
}

export function formatMobileApiNetworkError(input: {
  activeApiUrl: string;
  localApiUrl: string;
  cloudApiUrl: string | null;
  coreMode: "resolving" | "local" | "cloud";
}): string {
  if (input.coreMode === "cloud") {
    return `Local core is offline. Using cloud at ${input.activeApiUrl}.`;
  }
  if (input.cloudApiUrl && input.cloudApiUrl !== input.localApiUrl) {
    return `Cannot reach local core at ${input.localApiUrl}. Cloud fallback is also unavailable.`;
  }
  return `Cannot reach API at ${input.activeApiUrl}. Is backsteros-api running?`;
}
