/**
 * OS-181: list Mac-only API keys (present locally, absent on cloud)
 * and optionally mint cloud replacements.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/migrate-mac-only-api-keys.ts
 *     → dry-run: prints id/name/prefix only (never secrets).
 *   ... --apply --confirm-key <id>
 *     → mints a cloud replacement for that one key via the key-admin forward,
 *       writes the one-time secret to ~/.config/backsteros/migrated-api-keys/<cloudId>.secret
 *       (mode 0600; path printed, value never printed).
 *
 * Do NOT run --apply without Remon's per-key approval. Never prints plaintext
 * secrets. Dynamic Island keys are skipped. No automatic revoke.
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { and, eq, isNull } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { DYNAMIC_ISLAND_API_KEY_NAME } from "../lib/dynamic-island-local-key-format.js";
import {
  forwardApiKeyAdminToCloud,
  shouldForwardApiKeyAdminToCloud,
} from "../lib/api-key-admin-cloud-forward.js";
import { getCoreReplicationConfig } from "../services/core-replication/config.js";
import { mirrorCloudMintedApiKeyLocally } from "../services/api-key-admin-local-mirror.js";

export type MacOnlyKeySummary = {
  id: string;
  name: string;
  prefix: string;
  workspaceId: string;
  scopes: string[];
  contactId: string | null;
};

export function parseMigrateMacOnlyApiKeysArgs(argv: readonly string[]): {
  apply: boolean;
  confirmKeyIds: string[];
} {
  let apply = false;
  const confirmKeyIds: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--apply") apply = true;
    else if (arg === "--confirm-key") {
      const id = argv[++i];
      if (!id?.trim()) throw new Error("--confirm-key requires an id");
      confirmKeyIds.push(id.trim());
    } else if (arg === "--") continue;
    else {
      throw new Error(
        `unknown argument: ${arg} (supported: --apply, --confirm-key <id>)`,
      );
    }
  }
  return { apply, confirmKeyIds };
}

export function planMacOnlyApiKeyMigration(
  rows: MacOnlyKeySummary[],
  options: { apply: boolean; confirmKeyIds: readonly string[] },
): {
  listed: MacOnlyKeySummary[];
  toMint: MacOnlyKeySummary[];
  skippedIsland: number;
} {
  const listed = rows.filter((row) => row.name !== DYNAMIC_ISLAND_API_KEY_NAME);
  const skippedIsland = rows.length - listed.length;
  if (!options.apply) {
    return { listed, toMint: [], skippedIsland };
  }
  const allow = new Set(options.confirmKeyIds);
  return {
    listed,
    toMint: listed.filter((row) => allow.has(row.id)),
    skippedIsland,
  };
}

/** Keep keys whose ids are not present on the cloud peer. */
export function filterMacOnlyKeys(
  rows: MacOnlyKeySummary[],
  cloudIds: ReadonlySet<string>,
): MacOnlyKeySummary[] {
  return rows.filter((row) => !cloudIds.has(row.id));
}

export function migratedApiKeySecretPath(cloudKeyId: string): string {
  return join(
    homedir(),
    ".config",
    "backsteros",
    "migrated-api-keys",
    `${cloudKeyId}.secret`,
  );
}

/** Write plaintext once to a 0600 file. Returns the path; never logs the value. */
export async function writeMigratedApiKeySecretFile(input: {
  cloudKeyId: string;
  secret: string;
  writeFileImpl?: typeof writeFile;
  mkdirImpl?: typeof mkdir;
  chmodImpl?: typeof chmod;
}): Promise<string> {
  const dir = join(homedir(), ".config", "backsteros", "migrated-api-keys");
  const mkdirImpl = input.mkdirImpl ?? mkdir;
  const writeFileImpl = input.writeFileImpl ?? writeFile;
  const chmodImpl = input.chmodImpl ?? chmod;
  await mkdirImpl(dir, { recursive: true, mode: 0o700 });
  const path = migratedApiKeySecretPath(input.cloudKeyId);
  await writeFileImpl(path, `${input.secret}\n`, { mode: 0o600 });
  await chmodImpl(path, 0o600);
  return path;
}

async function loadLocalKeys(workspaceId: string | null): Promise<MacOnlyKeySummary[]> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      workspaceId: apiKeys.workspaceId,
      scopes: apiKeys.scopes,
      contactId: apiKeys.contactId,
    })
    .from(apiKeys)
    .where(
      workspaceId
        ? and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.revokedAt))
        : isNull(apiKeys.revokedAt),
    );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    workspaceId: row.workspaceId,
    scopes: row.scopes as string[],
    contactId: row.contactId,
  }));
}

async function fetchCloudApiKeyIds(
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  const config = getCoreReplicationConfig();
  if (!config?.peerUrl || !config.secret) {
    throw new Error(
      "CORE_REPLICATION_PEER_URL and CORE_REPLICATION_SECRET are required to list cloud api_keys",
    );
  }
  const url = new URL(`${config.peerUrl}/internal/core-replication/table-keys`);
  url.searchParams.set("table", "api_keys");
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `cloud table-keys api_keys failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  const payload = (await response.json()) as { keys?: string[] };
  return new Set(payload.keys ?? []);
}

async function main() {
  const { apply, confirmKeyIds } = parseMigrateMacOnlyApiKeysArgs(
    process.argv.slice(2),
  );
  if (apply && !shouldForwardApiKeyAdminToCloud()) {
    throw new Error(
      "CORE_REPLICATION_ROLE=local is required for --apply (cloud mint via forward)",
    );
  }
  const workspaceId =
    process.env.CORE_REPLICATION_WORKSPACE_IDS?.split(",")[0]?.trim() || null;
  const localRows = await loadLocalKeys(workspaceId);
  const cloudIds = await fetchCloudApiKeyIds();
  const macOnly = filterMacOnlyKeys(localRows, cloudIds);
  const plan = planMacOnlyApiKeyMigration(macOnly, { apply, confirmKeyIds });
  console.log(
    `dryRun=${!apply} listed=${plan.listed.length} toMint=${plan.toMint.length} skippedIsland=${plan.skippedIsland} alreadyOnCloud=${localRows.length - macOnly.length}`,
  );
  for (const row of plan.listed) {
    console.log(
      `  ${row.id} name=${JSON.stringify(row.name)} prefix=${row.prefix} scopes=${row.scopes.join(",")}`,
    );
  }
  if (!apply) {
    console.log(
      "\nDRY RUN — nothing minted. Re-run with --apply --confirm-key <id> per Remon-approved key.",
    );
    return;
  }
  if (plan.toMint.length === 0) {
    console.log("No --confirm-key ids matched listed keys; nothing minted.");
    return;
  }
  const { resolveLocalShellOwner } = await import(
    "../services/local-shell-auth.js"
  );
  const owner = await resolveLocalShellOwner();
  const ownerUserId = owner?.userId?.trim();
  if (!ownerUserId) {
    throw new Error(
      "Could not resolve local-shell owner user id for cloud mint",
    );
  }
  for (const row of plan.toMint) {
    const result = await forwardApiKeyAdminToCloud({
      method: "POST",
      path: "/internal/core-replication/api-keys",
      userId: ownerUserId,
      workspaceId: row.workspaceId,
      body: {
        name: row.name,
        kind: row.contactId ? "agent" : "access",
        scopes: row.scopes,
        contactId: row.contactId,
      },
    });
    const body = result.body as {
      apiKey?: {
        id?: string;
        name?: string;
        prefix?: string;
        scopes?: string[];
        contactId?: string | null;
        expiresAt?: string | null;
        createdAt?: string;
        updatedAt?: string;
        revokedAt?: string | null;
      };
      secret?: string;
    };
    if (result.status >= 400 || !body.apiKey?.id || !body.secret) {
      console.error(
        `mint failed for local ${row.id} status=${result.status} (secret not written)`,
      );
      process.exitCode = 2;
      continue;
    }
    const secretPath = await writeMigratedApiKeySecretFile({
      cloudKeyId: body.apiKey.id,
      secret: body.secret,
    });
    await mirrorCloudMintedApiKeyLocally({
      apiKey: {
        id: body.apiKey.id,
        workspaceId: row.workspaceId,
        userId: ownerUserId,
        name: body.apiKey.name ?? row.name,
        prefix: body.apiKey.prefix,
        scopes: body.apiKey.scopes ?? row.scopes,
        contactId: body.apiKey.contactId ?? row.contactId,
        expiresAt: body.apiKey.expiresAt,
        createdAt: body.apiKey.createdAt,
        updatedAt: body.apiKey.updatedAt,
        revokedAt: body.apiKey.revokedAt,
      },
      secret: body.secret,
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `local mirror after mint failed for cloudId=${body.apiKey?.id}: ${message}`,
      );
    });
    console.log(
      `minted replacement for ${row.id} → cloudId=${body.apiKey.id} secretFile=${secretPath} (value not printed; chmod 0600)`,
    );
  }
}

const isDirectRun =
  process.argv[1] != null &&
  (process.argv[1].endsWith("migrate-mac-only-api-keys.ts") ||
    process.argv[1].endsWith("migrate-mac-only-api-keys.js"));

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await sqlClient.end({ timeout: 2 });
    });
}
