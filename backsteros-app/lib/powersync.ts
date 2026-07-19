"use client";

import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncDatabase,
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
  ) {}

  private endpoint(path: string) {
    const origin = this.apiUrl.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
    return `${origin}/api/v1/${path}`;
  }

  async fetchCredentials() {
    const clerkToken = await this.getAuthToken();
    if (!clerkToken) throw new Error("Sign in to connect");
    const response = await fetch(this.endpoint("powersync/token"), {
      headers: { Authorization: `Bearer ${clerkToken}` },
    });
    if (!response.ok) {
      throw new Error(`PowerSync credentials failed (${response.status})`);
    }
    return response.json() as Promise<{ endpoint: string; token: string }>;
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
      throw new Error(`PowerSync upload failed (${response.status}): ${await response.text()}`);
    }
    await batch.complete();
  }
}

export function createPowerSyncDatabase(
  userId: string,
  backendMode: "dev" | "prod" = "dev",
) {
  const safeUserId = userId.replaceAll(/[^a-zA-Z0-9_-]/g, "_");
  const safeMode = backendMode === "prod" ? "prod" : "dev";
  return new PowerSyncDatabase({
    schema: appSchema,
    database: { dbFilename: `backsteros-${safeMode}-${safeUserId}.db` },
    flags: { enableMultiTabs: true },
    retryDelayMs: 2_000,
  });
}
