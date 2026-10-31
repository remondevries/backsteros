/**
 * Desktop helpers for OS-163 sync_events `resync_needed` (local-core ops health).
 */

export const OPS_SYNC_EVENT_RESYNC_PATH = "/api/v1/ops/sync-event-resync";

export type SyncEventResyncStatus =
  | "idle"
  | "needed"
  | "bootstrapping"
  | "failed";

export type SyncEventResyncFacts = {
  needed: boolean;
  status: SyncEventResyncStatus;
  message: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  workspaceId: string | null;
};

export const IDLE_SYNC_EVENT_RESYNC: SyncEventResyncFacts = {
  needed: false,
  status: "idle",
  message: null,
  startedAt: null,
  finishedAt: null,
  workspaceId: null,
};

const STATUSES = new Set<SyncEventResyncStatus>([
  "idle",
  "needed",
  "bootstrapping",
  "failed",
]);

function asStatus(value: unknown): SyncEventResyncStatus {
  return typeof value === "string" && STATUSES.has(value as SyncEventResyncStatus)
    ? (value as SyncEventResyncStatus)
    : "idle";
}

/** Parse `syncEventResync` from GET /api/v1/ops/sync-health. */
export function parseSyncEventResyncFacts(
  body: unknown,
): SyncEventResyncFacts {
  if (!body || typeof body !== "object") return IDLE_SYNC_EVENT_RESYNC;
  const root = body as Record<string, unknown>;
  const raw = root.syncEventResync;
  if (!raw || typeof raw !== "object") return IDLE_SYNC_EVENT_RESYNC;
  const row = raw as Record<string, unknown>;
  const status = asStatus(row.status);
  const needed =
    typeof row.needed === "boolean"
      ? row.needed
      : status === "needed" || status === "bootstrapping" || status === "failed";
  return {
    needed,
    status,
    message: typeof row.message === "string" ? row.message : null,
    startedAt: typeof row.startedAt === "string" ? row.startedAt : null,
    finishedAt: typeof row.finishedAt === "string" ? row.finishedAt : null,
    workspaceId: typeof row.workspaceId === "string" ? row.workspaceId : null,
  };
}

export function syncEventResyncBadge(status: SyncEventResyncStatus): string {
  switch (status) {
    case "bootstrapping":
      return "Resyncing";
    case "failed":
      return "Resync failed";
    case "needed":
      return "Resync needed";
    default:
      return "Synced";
  }
}

export function syncEventResyncTitle(status: SyncEventResyncStatus): string {
  switch (status) {
    case "bootstrapping":
      return "Reloading workspace snapshot";
    case "failed":
      return "Snapshot reload failed";
    case "needed":
      return "Full resync required";
    default:
      return "Workspace in sync";
  }
}

export function syncEventResyncDetail(facts: SyncEventResyncFacts): string {
  if (facts.message?.trim()) return facts.message.trim();
  switch (facts.status) {
    case "bootstrapping":
      return "Local-core is resetting the sync cursor and copying tables from the peer.";
    case "failed":
      return "Retry the snapshot reload from Settings → Syncing, or check local-core logs.";
    case "needed":
      return "The peer sync log has a gap (offline longer than retention). A full snapshot reload is required.";
    default:
      return "";
  }
}

/** True while the desktop should treat sync as actively recovering. */
export function isSyncEventResyncActive(facts: SyncEventResyncFacts): boolean {
  return (
    facts.needed ||
    facts.status === "needed" ||
    facts.status === "bootstrapping" ||
    facts.status === "failed"
  );
}
