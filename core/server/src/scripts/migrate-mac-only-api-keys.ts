/**
 * OS-181: list Mac-only API keys (present locally, never accepted on cloud)
 * and optionally mint cloud replacements.
 *
 *   pnpm exec tsx --env-file=.env src/scripts/migrate-mac-only-api-keys.ts
 *     → dry-run: prints id/name/prefix only (never secrets).
 *   ... --apply --confirm-key <id>
 *     → mints a cloud replacement for that one key via the key-admin forward.
 *
 * Do NOT run --apply without Remon's per-key approval. Never prints plaintext
 * secrets. Dynamic Island keys are skipped.
 */
import { and, eq, isNull } from "drizzle-orm";

import { db, sqlClient } from "../db/index.js";
import { apiKeys } from "../db/schema.js";
import { DYNAMIC_ISLAND_API_KEY_NAME } from "../lib/dynamic-island-local-key-format.js";
import {
  forwardApiKeyAdminToCloud,
  shouldForwardApiKeyAdminToCloud,
} from "../lib/api-key-admin-cloud-forward.js";

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

async function main() {
  const { apply, confirmKeyIds } = parseMigrateMacOnlyApiKeysArgs(
    process.argv.slice(2),
  );
  if (apply && !shouldForwardApiKeyAdminToCloud()) {
    throw new Error(
      "CORE_REPLICATION_ROLE=local is required for --apply (cloud mint via forward)",
    );
  }
  const workspaceId = process.env.CORE_REPLICATION_WORKSPACE_IDS?.split(",")[0]?.trim() || null;
  const rows = await loadLocalKeys(workspaceId);
  const plan = planMacOnlyApiKeyMigration(rows, { apply, confirmKeyIds });
  console.log(
    `dryRun=${!apply} listed=${plan.listed.length} toMint=${plan.toMint.length} skippedIsland=${plan.skippedIsland}`,
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
        name: `${row.name} (cloud)`,
        kind: row.contactId ? "agent" : "access",
        scopes: row.scopes,
        contactId: row.contactId,
      },
    });
    const body = result.body as { apiKey?: { id?: string }; secret?: string };
    console.log(
      `minted replacement for ${row.id} → cloudId=${body.apiKey?.id ?? "?"} (secret returned once — store offline; not printed)`,
    );
    if (result.status >= 400) {
      process.exitCode = 2;
    }
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
