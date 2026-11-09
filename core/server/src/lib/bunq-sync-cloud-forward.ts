/**
 * Local-core → cloud-core forward for Bunq Personal bank sync (OS-171).
 *
 * bunq permitted_ips are the cloud-core egress only. Hybrid local-core must
 * never call bunq HTTP itself — ask cloud to ingest, then rely on normal
 * financial_transactions replication (+ nudge) to reach the Mac.
 */
import type { BunqBankAccountSyncResult } from "@backsteros/contracts";

import { getCoreReplicationConfig } from "../services/core-replication/config.js";

/** bunq sync can page many payments; keep above agent-chat's 15s. */
const FORWARD_TIMEOUT_MS = 120_000;

export function shouldForwardBunqSyncToCloud(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return env.CORE_REPLICATION_ROLE?.trim().toLowerCase() === "local";
}

export class BunqSyncCloudForwardError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status = 502,
    code = "bunq_sync_cloud_unavailable",
  ) {
    super(message);
    this.name = "BunqSyncCloudForwardError";
    this.status = status;
    this.code = code;
  }
}

function peerFetch(
  path: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    throw new BunqSyncCloudForwardError(
      "bunq sync requires hybrid local-core with CORE_REPLICATION_PEER_URL and CORE_REPLICATION_SECRET",
      503,
      "bunq_sync_cloud_unavailable",
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  return fetchImpl(`${config.peerUrl}${path}`, {
    ...init,
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${config.secret}`,
      Accept: "application/json",
      ...(init.headers ?? {}),
    },
  })
    .catch((error: unknown) => {
      const message =
        error instanceof Error && error.name === "AbortError"
          ? "Cloud-core bunq sync timed out"
          : error instanceof Error
            ? error.message
            : "Cloud-core bunq sync forward failed";
      throw new BunqSyncCloudForwardError(message, 502);
    })
    .finally(() => {
      clearTimeout(timer);
    });
}

function sanitizeSyncResult(
  body: unknown,
): BunqBankAccountSyncResult | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const bankAccountId =
    typeof record.bankAccountId === "string" ? record.bankAccountId.trim() : "";
  const fetched = record.fetched;
  const inserted = record.inserted;
  const duplicates = record.duplicates;
  const monetaryAccountCount = record.monetaryAccountCount;
  const lastSyncedAt =
    typeof record.lastSyncedAt === "string" ? record.lastSyncedAt : "";
  if (
    !bankAccountId ||
    typeof fetched !== "number" ||
    typeof inserted !== "number" ||
    typeof duplicates !== "number" ||
    typeof monetaryAccountCount !== "number" ||
    !lastSyncedAt
  ) {
    return null;
  }
  return {
    bankAccountId,
    fetched,
    inserted,
    duplicates,
    monetaryAccountCount,
    lastSyncedAt,
  };
}

/**
 * Ask cloud-core to run Bunq Personal ingestion. Never forwards API keys;
 * cloud uses its own workspace_integration_secrets.
 */
export async function forwardBunqSyncToCloud(input: {
  workspaceId: string;
  bankAccountId: string;
  fetchImpl?: typeof fetch;
}): Promise<BunqBankAccountSyncResult> {
  const response = await peerFetch(
    "/internal/core-replication/bunq-sync",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        bank_account_id: input.bankAccountId,
      }),
    },
    input.fetchImpl,
  );

  const text = await response.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const record =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    const errorText =
      typeof record?.error === "string" ? record.error.trim() : "";
    const code =
      typeof record?.code === "string" && record.code.trim()
        ? record.code.trim()
        : "bunq_sync_cloud_unavailable";
    throw new BunqSyncCloudForwardError(
      errorText ||
        `Cloud-core bunq sync returned HTTP ${response.status}`,
      response.status >= 400 && response.status < 600
        ? Math.min(response.status, 502)
        : 502,
      code,
    );
  }

  const result = sanitizeSyncResult(parsed);
  if (!result) {
    throw new BunqSyncCloudForwardError(
      "Cloud-core bunq sync returned an unexpected payload",
      502,
    );
  }
  return result;
}
