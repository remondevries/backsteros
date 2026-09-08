import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncDatabase,
  WASQLiteOpenFactory,
  WASQLiteVFS,
} from "@powersync/web";
import {
  appSchema,
  mapCrudBatch,
  powerSyncMutationId,
} from "@backsteros/powersync-schema";

export type { UploadEntry } from "@backsteros/powersync-schema";
export { appSchema, mapCrudBatch, powerSyncMutationId } from "@backsteros/powersync-schema";

export type TokenProvider = () => Promise<string | null>;

export class BacksterPowerSyncConnector implements PowerSyncBackendConnector {
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
        endpoint: body.endpoint.replace(/\/+$/, ""),
        token: body.token,
      };
    }

    let authToken: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      authToken = (await this.getAuthToken())?.trim() || null;
      if (authToken) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
    if (!authToken) throw new Error("Missing local-shell token");

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
      endpoint: body.endpoint.replace(/\/+$/, ""),
      token: body.token,
    };
  }

  async uploadData(database: AbstractPowerSyncDatabase) {
    const batch = await database.getCrudBatch();
    if (!batch) return;
    const mutationId = powerSyncMutationId(this.deviceId, batch.crud);
    const authToken = await this.getAuthToken();
    if (!authToken) throw new Error("Missing session for upload");
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
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[desktop] PowerSync upload failed (${response.status}) mutation=${mutationId}`,
        detail.slice(0, 240),
      );
      throw new Error(
        `PowerSync upload failed (${response.status}): ${detail}`,
      );
    }
    await batch.complete();
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

/** How long connect+waitForReady may block before we surface an error (HMR / IDB hangs). */
export const POWER_SYNC_CONNECT_TIMEOUT_MS = 10_000;

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

/** Disconnect and close; ignores races from HMR / StrictMode double-mount. */
export async function closePowerSyncDatabase(
  database: PowerSyncDatabase,
  options?: { clear?: boolean },
): Promise<void> {
  try {
    if (options?.clear) {
      await database.disconnectAndClear();
    } else {
      await database.disconnect();
    }
    await database.close({ disconnect: true });
  } catch {
    /* ignore close races */
  }
}

/**
 * Close the global singleton when present. Used on sign-out, retry, and
 * Vite `import.meta.hot.dispose` so IDB is not left locked across reloads.
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

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void disposePowerSyncGlobalSlot();
  });
}
