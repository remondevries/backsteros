import {
  type AbstractPowerSyncDatabase,
  type PowerSyncBackendConnector,
  PowerSyncDatabase,
  WASQLiteOpenFactory,
  WASQLiteVFS,
} from "@powersync/web";
import { rewritePowerSyncEndpoint } from "./env";
import {
  appSchema,
  mapCrudBatch,
  powerSyncMutationId,
} from "@backsteros/powersync-schema";

export type { UploadEntry } from "@backsteros/powersync-schema";
export { appSchema, mapCrudBatch, powerSyncMutationId } from "@backsteros/powersync-schema";

export type TokenProvider = () => Promise<string | null>;

const UPLOAD_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const UPLOAD_MAX_ATTEMPTS = 4;

function isRetryablePowerSyncUpload(status: number, detail: string): boolean {
  if (!UPLOAD_RETRYABLE_STATUSES.has(status)) return false;
  if (status !== 503) return true;
  const lower = detail.toLowerCase();
  // Explicit retry codes from /powersync/write, plus claim races that surface
  // as a sticky Upload queue when flush + auto-upload overlap.
  return (
    lower.includes("powersync_retry") ||
    lower.includes("powersync_mutation_claim_race") ||
    lower.includes("group_not_found") ||
    lower.includes("subject_not_found") ||
    lower.length === 0
  );
}

export class BacksterPowerSyncConnector implements PowerSyncBackendConnector {
  /** Serialize uploads — concurrent flush + auto-upload race the same mutation id. */
  private uploadChain: Promise<void> = Promise.resolve();

  constructor(
    private readonly apiUrl: string,
    private readonly getAuthToken: TokenProvider,
    private readonly deviceId: string,
    /**
     * Prefer the shared API client (same Authorization path as REST lists).
     * Falls back to raw fetch + getAuthToken when omitted.
     */
    private readonly getPowerSyncCredentials?: () => Promise<{
      endpoint: string;
      token: string;
    }>,
  ) {}

  private endpoint(path: string) {
    const origin = this.apiUrl.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
    return `${origin}/api/v1/${path}`;
  }

  async fetchCredentials() {
    if (this.getPowerSyncCredentials) {
      const body = await this.getPowerSyncCredentials();
      if (!body.endpoint || !body.token) {
        throw new Error("PowerSync credentials response missing endpoint/token");
      }
      return {
        endpoint: rewritePowerSyncEndpoint(body.endpoint, {
          apiUrl: this.apiUrl,
        }),
        token: body.token,
      };
    }

    let authToken: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      authToken = (await this.getAuthToken())?.trim() || null;
      if (authToken) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
    if (!authToken) throw new Error("Missing owner API key");

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${authToken}`);
    const response = await fetch(this.endpoint("powersync/token"), {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `PowerSync credentials failed (${response.status})${
          detail ? `: ${detail.slice(0, 240)}` : ""
        }`,
      );
    }
    const body = (await response.json()) as {
      endpoint?: string;
      token?: string;
    };
    if (!body.endpoint || !body.token) {
      throw new Error("PowerSync credentials response missing endpoint/token");
    }
    // PowerSync rejects endpoints with a trailing slash.
    return {
      endpoint: rewritePowerSyncEndpoint(body.endpoint, {
        apiUrl: this.apiUrl,
      }),
      token: body.token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const run = this.uploadChain.then(() => this.uploadDataExclusive(database));
    // Keep the chain alive across failures so later callers still serialize.
    this.uploadChain = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  private async uploadDataExclusive(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch();
    if (!batch) return;
    const mutationId = powerSyncMutationId(this.deviceId, batch.crud);
    const authToken = await this.getAuthToken();
    if (!authToken) throw new Error("Missing session for upload");

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < UPLOAD_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, 150 * attempt * attempt),
        );
      }
      const response = await fetch(this.endpoint("powersync/write"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          device_id: this.deviceId,
          mutation_id: mutationId,
          batch: mapCrudBatch(batch.crud),
        }),
      });
      if (response.ok) {
        await batch.complete();
        return;
      }
      const detail = await response.text().catch(() => "");
      console.warn(
        `[desktop] PowerSync upload failed (${response.status}) mutation=${mutationId} attempt=${attempt + 1}`,
        detail.slice(0, 240),
      );
      lastError = new Error(
        `PowerSync upload failed (${response.status}): ${detail}`,
      );
      if (!isRetryablePowerSyncUpload(response.status, detail)) {
        throw lastError;
      }
    }
    throw lastError ?? new Error("PowerSync upload failed");
  }
}

export function createPowerSyncDatabase(userId: string) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  // Tauri WKWebView: long `backsteros-desktop-…-{userId}.db` names fail
  // sqlite3_open_v2 under PowerSync's IDBBatchAtomicVFS. Keep the filename short.
  // Main-thread IDB (no SharedWorker) matches PowerSync's Safari guidance.
  const flags = { enableMultiTabs: false, useWebWorker: false } as const;
  const vfs = WASQLiteVFS.IDBBatchAtomicVFS;
  const dbFilename = `bos-local-${safeUserId.slice(0, 12)}.db`;
  return new PowerSyncDatabase({
    schema: appSchema,
    database: new WASQLiteOpenFactory({
      dbFilename,
      vfs,
      flags,
    }),
    flags,
    retryDelayMs: 2_000,
  });
}

/** How long connect+waitForReady may block before we surface an error. */
export const POWER_SYNC_CONNECT_TIMEOUT_MS = 120_000;

const GLOBAL_SLOT_KEY = "__backsteros_desktop_powersync__";

export type PowerSyncGlobalSlot = {
  userId: string;
  database: PowerSyncDatabase;
};

type PowerSyncGlobalStore = {
  slot: PowerSyncGlobalSlot | null;
};

function globalStore(): PowerSyncGlobalStore {
  const root = globalThis as typeof globalThis & {
    [GLOBAL_SLOT_KEY]?: PowerSyncGlobalStore;
  };
  if (!root[GLOBAL_SLOT_KEY]) {
    root[GLOBAL_SLOT_KEY] = { slot: null };
  }
  return root[GLOBAL_SLOT_KEY];
}

export function getPowerSyncGlobalSlot(): PowerSyncGlobalSlot | null {
  return globalStore().slot;
}

export function setPowerSyncGlobalSlot(slot: PowerSyncGlobalSlot | null) {
  globalStore().slot = slot;
}

/** Disconnect and close; ignores a second call from HMR / StrictMode. */
const closedPowerSyncDatabases = new WeakSet<PowerSyncDatabase>();
const closingPowerSyncDatabases = new WeakMap<
  PowerSyncDatabase,
  Promise<void>
>();

export async function closePowerSyncDatabase(
  database: PowerSyncDatabase,
  options?: { clear?: boolean },
): Promise<void> {
  if (closedPowerSyncDatabases.has(database)) return;
  const inflight = closingPowerSyncDatabases.get(database);
  if (inflight) {
    await inflight;
    return;
  }
  const done = (async () => {
    closedPowerSyncDatabases.add(database);
    try {
      if (options?.clear) {
        await database.disconnectAndClear();
        return;
      }
      await database.close({ disconnect: true });
    } catch {
      /* ignore close races — PowerSync may still log "close for the second time" */
    } finally {
      closingPowerSyncDatabases.delete(database);
    }
  })();
  closingPowerSyncDatabases.set(database, done);
  await done;
}

/**
 * Close the global singleton when present. Used on sign-out and retry.
 * Not called from Vite dispose: the singleton lives on `globalThis` and is
 * reused across reloads. Closing it there makes PowerSync log
 * "Trying to close for the second time".
 */
export async function disposePowerSyncGlobalSlot(options?: {
  clear?: boolean;
  onlyUserId?: string;
}): Promise<void> {
  const store = globalStore();
  const current = store.slot;
  if (!current) return;
  if (options?.onlyUserId && current.userId !== options.onlyUserId) return;
  store.slot = null;
  await closePowerSyncDatabase(current.database, { clear: options?.clear });
}
