import { appendOpsLog } from "../../lib/ops-log-buffer.js";
import {
  resolveBuildVersion,
  shortCommit,
  type BuildVersion,
} from "../../lib/build-version.js";
import { getCoreReplicationConfig } from "./config.js";

export type PeerVersionState = {
  mismatch: boolean;
  peerVersion: BuildVersion | null;
  localVersion: BuildVersion;
  checkedAt: string | null;
};

const DEFAULT_TIMEOUT_MS = 5_000;

let state: PeerVersionState = {
  mismatch: false,
  peerVersion: null,
  localVersion: resolveBuildVersion(),
  checkedAt: null,
};

/** Commit pair we already ops-alerted for (empty when in sync). */
let alertedMismatchKey: string | null = null;

export function getPeerVersionState(): PeerVersionState {
  return {
    ...state,
    localVersion: resolveBuildVersion(),
  };
}

export function resetPeerVersionStateForTests(): void {
  state = {
    mismatch: false,
    peerVersion: null,
    localVersion: resolveBuildVersion(),
    checkedAt: null,
  };
  alertedMismatchKey = null;
}

function parsePeerVersion(body: unknown): BuildVersion | null {
  if (!body || typeof body !== "object") return null;
  const version = (body as { version?: unknown }).version;
  if (!version || typeof version !== "object") return null;
  const record = version as Record<string, unknown>;
  const commit = typeof record.commit === "string" ? record.commit.trim() : "";
  const builtAt =
    typeof record.builtAt === "string" ? record.builtAt.trim() : "";
  if (!commit || !builtAt) return null;
  return {
    commit,
    builtAt,
    dirty: Boolean(record.dirty),
  };
}

/**
 * Compare this core's commit with the replication peer's `/health`.
 * Ops-alerts at most once per distinct mismatch pair; clears when they match
 * again so a later drift can alert once more.
 */
export async function checkPeerBuildVersion(options?: {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<PeerVersionState> {
  const config = getCoreReplicationConfig();
  const localVersion = resolveBuildVersion();
  if (!config) {
    state = {
      mismatch: false,
      peerVersion: null,
      localVersion,
      checkedAt: new Date().toISOString(),
    };
    alertedMismatchKey = null;
    return getPeerVersionState();
  }

  const fetchImpl = options?.fetchImpl ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let peerVersion: BuildVersion | null = null;
  try {
    const response = await fetchImpl(`${config.peerUrl}/health`, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (response.ok) {
      peerVersion = parsePeerVersion(await response.json());
    }
  } catch {
    peerVersion = null;
  } finally {
    clearTimeout(timer);
  }

  const mismatch =
    peerVersion !== null &&
    peerVersion.commit !== "unknown" &&
    localVersion.commit !== "unknown" &&
    peerVersion.commit !== localVersion.commit;

  state = {
    mismatch,
    peerVersion,
    localVersion,
    checkedAt: new Date().toISOString(),
  };

  if (!mismatch || !peerVersion) {
    alertedMismatchKey = null;
    return getPeerVersionState();
  }

  const key = `${localVersion.commit}\0${peerVersion.commit}`;
  if (alertedMismatchKey !== key) {
    alertedMismatchKey = key;
    const detail = `local=${shortCommit(localVersion.commit)} peer=${shortCommit(peerVersion.commit)} role=${config.role}`;
    appendOpsLog("warn", "core version mismatch with replication peer", detail);
    console.warn(`[core-replication] version mismatch: ${detail}`);
  }

  return getPeerVersionState();
}
