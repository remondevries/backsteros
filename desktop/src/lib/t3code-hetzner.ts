/** Client for T3 Code Hetzner/Kamal discovery (`/api/hetzner/sites`). */

export type DiscoveredDeployment = {
  readonly id: string;
  readonly status: "success" | "failed" | "running";
  readonly commit: string | null;
  readonly version: string;
  readonly siteDomain: string;
  readonly siteAccent: string;
  readonly siteInitial: string;
  readonly summary: string;
  readonly meta: string;
  readonly actor: string | null;
  readonly appName: string;
  readonly serverName: string;
  readonly serverId: number;
  readonly at: string;
  readonly branch?: string | null;
  readonly via?: string | null;
};

export type HetznerSitesResponse = {
  readonly ok: boolean;
  readonly configured?: boolean;
  readonly deployments?: readonly DiscoveredDeployment[];
  readonly error?: string;
};

const CACHE_TTL_MS = 60_000;
let cache: { readonly at: number; readonly data: HetznerSitesResponse } | null =
  null;
let inFlight: Promise<HetznerSitesResponse> | null = null;

/**
 * Base URL for the T3 Code HTTP API.
 * In Vite/Tauri dev, requests go same-origin through the desktop Vite proxy.
 */
export function resolveT3CodeApiBase(): string {
  const fromEnv = (
    import.meta.env.VITE_T3CODE_URL as string | undefined
  )?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  if (import.meta.env.DEV) return "";
  return "http://127.0.0.1:13773";
}

export function clearT3CodeSitesCache(): void {
  cache = null;
}

export async function fetchT3CodeDeployments(options?: {
  readonly force?: boolean;
}): Promise<HetznerSitesResponse> {
  if (!options?.force) {
    if (cache && Date.now() - cache.at <= CACHE_TTL_MS) return cache.data;
    if (inFlight) return inFlight;
  }

  inFlight = (async () => {
    const base = resolveT3CodeApiBase();
    const response = await fetch(`${base}/api/hetzner/sites`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `T3 Code returned ${response.status}`,
      } satisfies HetznerSitesResponse;
    }
    const data = (await response.json()) as HetznerSitesResponse;
    if (data.ok !== false) {
      cache = { at: Date.now(), data };
    }
    return data;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

/** Compact relative label for side-panel rows (e.g. "2h ago"). */
export function formatDeploymentRelativeTime(
  iso: string,
  nowMs = Date.now(),
): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const diffMs = nowMs - at;
  if (diffMs < 5_000) return "just now";
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function deploymentViaLabel(entry: DiscoveredDeployment): string {
  return entry.via ?? (entry.meta.includes("Kamal") ? "Kamal" : "Custom");
}
