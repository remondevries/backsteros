/** Shown when `/health.versionMismatch` is true (OS-83; leftover from OS-61). */
export const LOCAL_CORE_UPDATE_BUILD_HINT =
  "Run scripts/local-core/update-build.sh after the cloud deploy.";

export const VERSION_MISMATCH_DISMISS_STORAGE_PREFIX =
  "backsteros:local-core-version-mismatch-dismissed:";

export type LocalCoreVersionMismatch = {
  localCommit: string;
  peerCommit: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function commitFromVersion(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const commit = (value as { commit?: unknown }).commit;
  if (typeof commit !== "string") return "unknown";
  const trimmed = commit.trim();
  return trimmed || "unknown";
}

export function shortCommitLabel(commit: string, length = 12): string {
  const trimmed = commit.trim() || "unknown";
  if (trimmed === "unknown" || trimmed.length <= length) return trimmed;
  return trimmed.slice(0, length);
}

export function versionMismatchDismissalKey(
  mismatch: LocalCoreVersionMismatch,
): string {
  return `${mismatch.localCommit}\0${mismatch.peerCommit}`;
}

export function parseHealthVersionMismatch(
  body: unknown,
): LocalCoreVersionMismatch | null {
  if (!body || typeof body !== "object") return null;
  const record = body as {
    versionMismatch?: unknown;
    version?: unknown;
    peerVersion?: unknown;
  };
  if (record.versionMismatch !== true) return null;
  return {
    localCommit: commitFromVersion(record.version),
    peerCommit: commitFromVersion(record.peerVersion),
  };
}

export function formatVersionMismatchWarning(
  mismatch: LocalCoreVersionMismatch,
): string {
  const local = shortCommitLabel(mismatch.localCommit);
  const peer = shortCommitLabel(mismatch.peerCommit);
  return `Local-core version does not match the replication peer (local=${local} peer=${peer}). ${LOCAL_CORE_UPDATE_BUILD_HINT}`;
}

export function isVersionMismatchDismissed(
  key: string,
  storage: StorageLike | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(VERSION_MISMATCH_DISMISS_STORAGE_PREFIX + key) === "1";
  } catch {
    return false;
  }
}

export function dismissVersionMismatch(
  key: string,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(VERSION_MISMATCH_DISMISS_STORAGE_PREFIX + key, "1");
  } catch {
    // ignore quota / private mode
  }
}

function defaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}
