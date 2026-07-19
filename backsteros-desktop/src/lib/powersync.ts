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

    // Clerk can briefly return null right after OAuth / HMR; retry before failing.
    let clerkToken: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      clerkToken = (await this.getAuthToken())?.trim() || null;
      if (clerkToken) break;
      await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
    }
    if (!clerkToken) throw new Error("Sign in to connect");

    const headers = new Headers();
    headers.set("Authorization", `Bearer ${clerkToken}`);
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
      throw new Error(
        `PowerSync upload failed (${response.status}): ${await response.text()}`,
      );
    }
    await batch.complete();
  }
}

export function createPowerSyncDatabase(
  userId: string,
  backendMode: "dev" | "prod" = "dev",
) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeMode = backendMode === "prod" ? "prod" : "dev";
  // Tauri WKWebView: long `backsteros-desktop-…-{fullClerkId}.db` names fail
  // sqlite3_open_v2 under PowerSync's IDBBatchAtomicVFS. Keep the filename short.
  // Main-thread IDB (no SharedWorker) matches PowerSync's Safari guidance.
  const flags = { enableMultiTabs: false, useWebWorker: false } as const;
  const vfs = WASQLiteVFS.IDBBatchAtomicVFS;
  const dbFilename = `bos-${safeMode}-${safeUserId.slice(0, 12)}.db`;
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
