/**
 * One-shot: copy Neon (backsteros.com) metadata into local Docker Postgres,
 * then pull Spaces objects into the local vault.
 *
 * Usage (from core/server):
 *   node --env-file=.env scripts/import-neon-to-local.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import postgres from "postgres";

const VAULT_PATH =
  process.env.IMPORT_VAULT_PATH?.trim() ||
  "/Users/remondevries/BacksterOS";

const COPY_TABLES = [
  "users",
  "workspaces",
  "workspace_members",
  "workspace_settings",
  "api_keys",
  "organizations",
  "contacts",
  "areas",
  "projects",
  "tasks",
  "documents",
  "letters",
  "letter_attachments",
  "avatars",
  "entity_counters",
  "task_comments",
  "task_activities",
  "mentions",
  "sync_events",
  "mutation_receipts",
  "migration_runs",
  "migration_items",
];

const LOCAL_ONLY_CLEAR = ["recurring_tasks", "workspace_integration_secrets"];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

async function tableColumns(sql, table) {
  const rows = await sql.unsafe(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = '${table}'
    ORDER BY ordinal_position`);
  return rows.map((r) => r.column_name);
}

async function copyTable(source, target, table) {
  const sourceCols = await tableColumns(source, table);
  const targetCols = new Set(await tableColumns(target, table));
  const cols = sourceCols.filter((c) => targetCols.has(c));
  if (cols.length === 0) throw new Error(`No shared columns for ${table}`);

  const rows = await source.unsafe(
    `SELECT ${cols.map((c) => `"${c}"`).join(", ")} FROM "${table}"`,
  );
  await target.unsafe(`DELETE FROM "${table}"`);
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows`);
    return 0;
  }

  const colList = cols.map((c) => `"${c}"`).join(", ");
  const chunkSize = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    let p = 1;
    for (const row of chunk) {
      const placeholders = cols.map((c) => {
        params.push(row[c]);
        return `$${p++}`;
      });
      values.push(`(${placeholders.join(", ")})`);
    }
    await target.unsafe(
      `INSERT INTO "${table}" (${colList}) VALUES ${values.join(", ")}`,
      params,
    );
    inserted += chunk.length;
  }
  console.log(`  ${table}: ${inserted} rows`);
  return inserted;
}

async function importDatabase() {
  const neonUrl = required("DATABASE_URL_NEON");
  const localUrl = required("DATABASE_URL");
  const source = postgres(neonUrl, { max: 2, prepare: false, connect_timeout: 15 });
  const target = postgres(localUrl, { max: 2, prepare: false, connect_timeout: 10 });

  try {
    console.log("Disabling FK checks on local…");
    await target.unsafe(`SET session_replication_role = 'replica'`);

    console.log("Clearing local-only tables…");
    for (const table of LOCAL_ONLY_CLEAR) {
      await target.unsafe(`DELETE FROM "${table}"`);
      console.log(`  ${table}: cleared`);
    }

    console.log("Copying Neon → local…");
    // Delete dependents before parents while replication_role=replica (order free).
    for (const table of [...COPY_TABLES].reverse()) {
      await target.unsafe(`DELETE FROM "${table}"`);
    }
    for (const table of COPY_TABLES) {
      await copyTable(source, target, table);
    }

    console.log("Setting vaultPath on ws_legacy_default…");
    const settingsRows = await target.unsafe(
      `SELECT settings FROM workspace_settings WHERE workspace_id = 'ws_legacy_default'`,
    );
    const current =
      settingsRows[0]?.settings && typeof settingsRows[0].settings === "object"
        ? settingsRows[0].settings
        : {};
    const next = { ...current, vaultPath: VAULT_PATH };
    if (settingsRows.length === 0) {
      await target.unsafe(
        `INSERT INTO workspace_settings (workspace_id, settings, updated_at)
         VALUES ('ws_legacy_default', $1::jsonb, now())`,
        [JSON.stringify(next)],
      );
    } else {
      await target.unsafe(
        `UPDATE workspace_settings
         SET settings = $1::jsonb, updated_at = now()
         WHERE workspace_id = 'ws_legacy_default'`,
        [JSON.stringify(next)],
      );
    }
    console.log(`  vaultPath=${VAULT_PATH}`);

    await target.unsafe(`SET session_replication_role = 'origin'`);
    console.log("Database import done.");
  } finally {
    await source.end({ timeout: 2 });
    await target.end({ timeout: 2 });
  }
}

async function importBlobs() {
  const endpoint = required("SPACES_ENDPOINT");
  const bucket = required("SPACES_BUCKET");
  const accessKeyId = required("SPACES_ACCESS_KEY_ID");
  const secretAccessKey = required("SPACES_SECRET_ACCESS_KEY");
  const region = process.env.SPACES_REGION || "ams3";

  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Downloading Spaces://${bucket} → ${VAULT_PATH}…`);
  await mkdir(VAULT_PATH, { recursive: true });

  let token;
  let keys = [];
  do {
    const result = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const object of result.Contents ?? []) {
      if (object.Key && !object.Key.endsWith("/")) keys.push(object.Key);
    }
    token = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (token);

  let ok = 0;
  let failed = 0;
  for (const key of keys) {
    try {
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      if (!object.Body) throw new Error("empty body");
      const bytes = Buffer.from(await object.Body.transformToByteArray());
      const absolute = path.join(VAULT_PATH, key);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, bytes);
      ok += 1;
      if (ok % 10 === 0 || ok === keys.length) {
        console.log(`  blobs ${ok}/${keys.length}`);
      }
    } catch (error) {
      failed += 1;
      console.error(`  FAIL ${key}: ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`Blobs done: ok=${ok} failed=${failed}`);
}

async function verify() {
  const local = postgres(required("DATABASE_URL"), {
    max: 1,
    prepare: false,
  });
  try {
    const counts = {};
    for (const table of [
      "workspaces",
      "projects",
      "tasks",
      "documents",
      "organizations",
      "contacts",
      "letters",
      "task_comments",
      "task_activities",
    ]) {
      const rows = await local.unsafe(
        `SELECT count(*)::int AS c FROM "${table}"`,
      );
      counts[table] = rows[0].c;
    }
    const settings = await local.unsafe(
      `SELECT settings FROM workspace_settings WHERE workspace_id = 'ws_legacy_default'`,
    );
    console.log("Local verify counts:", counts);
    console.log("workspace settings:", settings[0]?.settings);
  } finally {
    await local.end({ timeout: 2 });
  }
}

async function main() {
  await importDatabase();
  await importBlobs();
  await verify();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
