import {
  AbstractPowerSyncDatabase,
  PowerSyncBackendConnector,
  PowerSyncDatabase,
} from "@powersync/react-native";
import { SQLJSOpenFactory } from "@powersync/adapter-sql-js";
import { OPSqliteOpenFactory } from "@powersync/op-sqlite";
import {
  appSchema,
  mapCrudBatch,
  powerSyncMutationId,
} from "@backsteros/powersync-schema";
import Constants from "expo-constants";

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
        `[mobile] PowerSync upload failed (${response.status}) mutation=${mutationId}`,
        detail.slice(0, 240),
      );
      throw new Error(
        `PowerSync upload failed (${response.status}): ${detail}`,
      );
    }
    await batch.complete();
  }
}

export function isNativeSqliteThreadError(reason: unknown): boolean {
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === "string"
        ? reason
        : String(reason ?? "");
  return (
    /thread constructor failed/i.test(message) ||
    /resource temporarily unavailable/i.test(message)
  );
}

/**
 * SQL.js in Expo Go; OP-SQLite for dev-client / production (New Architecture).
 * Quick SQLite's JSI install fails under RN New Arch — OP-SQLite is the
 * PowerSync-recommended native adapter for Expo 53+.
 *
 * `forceSqlJs` is a recovery path when OP-SQLite cannot spawn threads on
 * device (seen on some iPhones after a reconnect storm).
 */
export function createPowerSyncDatabase(
  userId: string,
  options?: { forceSqlJs?: boolean },
) {
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 12);
  const isExpoGo = Constants.executionEnvironment === "storeClient";
  const useSqlJs = isExpoGo || Boolean(options?.forceSqlJs);
  const dbFilename = useSqlJs
    ? `bos-mobile-${safeUserId}-sqljs.db`
    : `bos-mobile-${safeUserId}.db`;

  return new PowerSyncDatabase({
    schema: appSchema,
    database: useSqlJs
      ? new SQLJSOpenFactory({ dbFilename })
      : new OPSqliteOpenFactory({
          dbFilename,
          sqliteOptions: {
            // PowerSync RN defaults to ~50MB; lower to reduce iOS jetsam risk
            // on large workspaces with many concurrent watches.
            cacheSizeKb: 12 * 1024,
          },
        }),
    // Avoid aggressive internal reconnect while native threads are scarce.
    retryDelayMs: 10_000,
  });
}
