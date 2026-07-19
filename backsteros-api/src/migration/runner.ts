import { randomUUID } from "node:crypto";

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import postgres, { type Sql } from "postgres";

import type { MigrationRecord } from "./records.js";
import { checksum } from "./source.js";

export type MigrationMode = "dry-run" | "execute" | "resume" | "verify";

export type MigrationSummary = {
  total: number;
  imported: number;
  skipped: number;
  conflicts: number;
  errors: number;
  missingBlobs: number;
  sourceChecksumConflicts: number;
};

export type ItemResult = {
  sourceType: string;
  sourceId: string;
  targetTable: string;
  targetId: string;
  status: "imported" | "skipped" | "conflict" | "error";
  error?: string;
  warnings: string[];
};

export type Verification = {
  databaseRecords: { checked: number; matched: number; mismatched: number };
  blobs: { checked: number; matched: number; missing: number; mismatched: number };
  foreignKeyViolations: Record<string, number>;
  duplicateViolations: Record<string, number>;
  sampleChecks: Array<{
    sourceType: string;
    sourceId: string;
    rowMatched: boolean;
    blobMatched: boolean | null;
  }>;
  passed: boolean;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function rowMatches(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>,
): boolean {
  return Object.entries(desired).every(([key, expected]) =>
    comparableEqual(existing[key], expected),
  );
}

function comparableEqual(actual: unknown, expected: unknown): boolean {
  if (expected instanceof Date) {
    return (
      actual != null &&
      new Date(actual as string | number | Date).toISOString() ===
        expected.toISOString()
    );
  }
  if (typeof expected === "number") return Number(actual) === expected;
  if (typeof expected === "bigint") return BigInt(String(actual)) === expected;
  if (
    typeof expected === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(expected) &&
    actual instanceof Date
  ) {
    return actual.toISOString().slice(0, 10) === expected;
  }
  if (expected === null || expected === undefined) return actual == null;
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => comparableEqual(actual[index], value))
    );
  }
  if (typeof expected === "object") {
    if (!actual || typeof actual !== "object") return false;
    return Object.entries(expected as Record<string, unknown>).every(
      ([key, value]) =>
        comparableEqual((actual as Record<string, unknown>)[key], value),
    );
  }
  return actual === expected;
}

function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/(secret|password|token|key)=([^&\s]+)/gi, "$1=[REDACTED]")
    .slice(0, 1000);
}

class TargetStorage {
  private readonly client = new S3Client({
    endpoint: required("SPACES_ENDPOINT"),
    region: process.env.SPACES_REGION || "ams3",
    credentials: {
      accessKeyId: required("SPACES_ACCESS_KEY_ID"),
      secretAccessKey: required("SPACES_SECRET_ACCESS_KEY"),
    },
  });
  private readonly bucket = required("SPACES_BUCKET");

  async checksum(key: string): Promise<string | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (head.Metadata?.sha256) return head.Metadata.sha256;
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return checksum(
        new Uint8Array(await result.Body.transformToByteArray()),
      );
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (code === "NotFound" || code === "NoSuchKey") return null;
      throw error;
    }
  }

  async put(
    key: string,
    bytes: Uint8Array,
    contentType: string,
    sha256: string,
  ): Promise<string | null> {
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentLength: bytes.byteLength,
        ContentType: contentType,
        Metadata: { sha256 },
      }),
    );
    return result.ETag?.replaceAll('"', "") ?? null;
  }
}

export async function resolveOwnerWorkspace(
  sql: Sql,
  requestedWorkspaceId?: string,
): Promise<{ workspaceId: string; ownerUserId: string }> {
  if (requestedWorkspaceId) {
    const rows = await sql<
      Array<{ workspace_id: string; owner_user_id: string | null }>
    >`
      SELECT w.id AS workspace_id, w.owner_user_id
      FROM workspaces w
      WHERE w.id = ${requestedWorkspaceId}
      LIMIT 1
    `;
    if (!rows[0]) {
      throw new Error("TARGET_WORKSPACE_NOT_FOUND");
    }
    return {
      workspaceId: rows[0].workspace_id,
      ownerUserId: rows[0].owner_user_id ?? "",
    };
  }
  const rows = await sql<Array<{ workspace_id: string; owner_user_id: string }>>`
    SELECT w.id AS workspace_id, w.owner_user_id
    FROM workspaces w
    JOIN users u ON u.id = w.owner_user_id
    WHERE u.role = 'owner'
    ORDER BY w.created_at, w.id
  `;
  if (rows.length !== 1 || !rows[0]?.owner_user_id) {
    const workspaces = await sql<
      Array<{ workspace_id: string; owner_user_id: string | null }>
    >`
      SELECT id AS workspace_id, owner_user_id
      FROM workspaces
      ORDER BY created_at, id
    `;
    if (workspaces.length !== 1) {
      throw new Error(
        `EXPECTED_ONE_OWNER_OR_UNCLAIMED_WORKSPACE_FOUND:${workspaces.length}`,
      );
    }
    return {
      workspaceId: workspaces[0]!.workspace_id,
      ownerUserId: workspaces[0]!.owner_user_id ?? "",
    };
  }
  return {
    workspaceId: rows[0].workspace_id,
    ownerUserId: rows[0].owner_user_id,
  };
}

async function existingRow(
  sql: Sql,
  record: MigrationRecord,
): Promise<Record<string, unknown> | null> {
  const rows = await sql<Array<Record<string, unknown>>>`
    SELECT * FROM ${sql(record.targetTable)}
    WHERE id = ${record.targetId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function trackItem(
  sql: Sql,
  input: {
    runId: string;
    workspaceId: string;
    fingerprint: string;
    record: MigrationRecord;
    status: ItemResult["status"];
    targetChecksum?: string | null;
    error?: string;
  },
): Promise<void> {
  await sql`
    INSERT INTO migration_items (
      workspace_id, source_fingerprint, source_type, source_id, run_id,
      target_table, target_id, source_checksum, target_checksum, status,
      details, error, attempts, started_at, finished_at
    ) VALUES (
      ${input.workspaceId}, ${input.fingerprint}, ${input.record.sourceType},
      ${input.record.sourceId}, ${input.runId}, ${input.record.targetTable},
      ${input.record.targetId}, ${input.record.sourceChecksum},
      ${input.targetChecksum ?? null}, ${input.status},
      ${sql.json({ warnings: input.record.warnings })},
      ${input.error ?? null}, 1, now(), now()
    )
    ON CONFLICT (workspace_id, source_fingerprint, source_type, source_id)
    DO UPDATE SET
      run_id = EXCLUDED.run_id,
      target_table = EXCLUDED.target_table,
      target_id = EXCLUDED.target_id,
      source_checksum = EXCLUDED.source_checksum,
      target_checksum = EXCLUDED.target_checksum,
      status = EXCLUDED.status,
      details = EXCLUDED.details,
      error = EXCLUDED.error,
      attempts = migration_items.attempts + 1,
      started_at = now(),
      finished_at = now()
  `;
}

export async function runMigration(input: {
  sql: Sql;
  mode: "dry-run" | "execute" | "resume";
  workspaceId: string;
  sourceFingerprint: string;
  sourceInventory: Record<string, unknown>;
  records: MigrationRecord[];
}): Promise<{
  runId: string | null;
  summary: MigrationSummary;
  items: ItemResult[];
}> {
  const summary: MigrationSummary = {
    total: input.records.length,
    imported: 0,
    skipped: 0,
    conflicts: 0,
    errors: 0,
    missingBlobs: 0,
    sourceChecksumConflicts: input.records.filter((record) =>
      record.warnings.includes("SOURCE_LOCAL_SPACES_CHECKSUM_CONFLICT"),
    ).length,
  };
  const items: ItemResult[] = [];
  const execute = input.mode !== "dry-run";
  const runId = execute ? `mig_${randomUUID()}` : null;
  const storage = new TargetStorage();

  if (runId) {
    await input.sql`
      INSERT INTO migration_runs (
        id, workspace_id, source_fingerprint, mode, status, source_inventory
      ) VALUES (
        ${runId}, ${input.workspaceId}, ${input.sourceFingerprint},
        ${input.mode}, 'running', ${input.sql.json(input.sourceInventory as never)}
      )
    `;
  }

  for (const record of input.records) {
    let result: ItemResult;
    let targetChecksum: string | null | undefined;
    try {
      if (record.blob && !record.blob.object) {
        summary.missingBlobs += 1;
        throw new Error("SOURCE_BLOB_MISSING");
      }
      const existing = await existingRow(input.sql, record);
      if (existing && !rowMatches(existing, record.row)) {
        result = {
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          targetTable: record.targetTable,
          targetId: record.targetId,
          status: "conflict",
          error: "DIVERGENT_TARGET_ROW",
          warnings: record.warnings,
        };
      } else {
        if (record.blob?.object) {
          targetChecksum = await storage.checksum(record.blob.targetKey);
          if (
            targetChecksum &&
            targetChecksum !== record.blob.object.checksum
          ) {
            result = {
              sourceType: record.sourceType,
              sourceId: record.sourceId,
              targetTable: record.targetTable,
              targetId: record.targetId,
              status: "conflict",
              error: "DIVERGENT_TARGET_BLOB",
              warnings: record.warnings,
            };
          } else {
            if (execute && !targetChecksum) {
              await storage.put(
                record.blob.targetKey,
                record.blob.object.bytes,
                record.blob.object.contentType,
                record.blob.object.checksum,
              );
              targetChecksum = record.blob.object.checksum;
            }
            if (execute && !existing) {
              await input.sql`
                INSERT INTO ${input.sql(record.targetTable)}
                ${input.sql(record.row)}
              `;
            }
            result = {
              sourceType: record.sourceType,
              sourceId: record.sourceId,
              targetTable: record.targetTable,
              targetId: record.targetId,
              status: existing && targetChecksum ? "skipped" : "imported",
              warnings: record.warnings,
            };
          }
        } else {
          if (execute && !existing) {
            await input.sql`
              INSERT INTO ${input.sql(record.targetTable)}
              ${input.sql(record.row)}
            `;
          }
          result = {
            sourceType: record.sourceType,
            sourceId: record.sourceId,
            targetTable: record.targetTable,
            targetId: record.targetId,
            status: existing ? "skipped" : "imported",
            warnings: record.warnings,
          };
        }
      }
    } catch (error) {
      result = {
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        targetTable: record.targetTable,
        targetId: record.targetId,
        status: "error",
        error: safeError(error),
        warnings: record.warnings,
      };
    }
    if (result.status === "imported") summary.imported += 1;
    else if (result.status === "skipped") summary.skipped += 1;
    else if (result.status === "conflict") summary.conflicts += 1;
    else summary.errors += 1;
    items.push(result);
    if (runId) {
      await trackItem(input.sql, {
        runId,
        workspaceId: input.workspaceId,
        fingerprint: input.sourceFingerprint,
        record,
        status: result.status,
        targetChecksum,
        error: result.error,
      });
    }
  }

  if (execute) {
    await syncEntityCountersFromExistingNumbers(input.sql);
  }

  if (runId) {
    const status =
      summary.conflicts || summary.errors ? "completed_with_issues" : "completed";
    await input.sql`
      UPDATE migration_runs
      SET status = ${status}, summary = ${input.sql.json(summary)}, finished_at = now()
      WHERE id = ${runId}
    `;
  }
  return { runId, summary, items };
}

/** Keep allocation counters ahead of imported Circle numbers. */
async function syncEntityCountersFromExistingNumbers(sqlClient: Sql) {
  await sqlClient.unsafe(`
INSERT INTO entity_counters (workspace_id, entity, scope_id, next_value)
SELECT
  workspace_id,
  'task',
  COALESCE('project:' || project_id, 'contact:' || contact_id, '__inbox__'),
  MAX(number) + 1
FROM tasks
GROUP BY
  workspace_id,
  COALESCE('project:' || project_id, 'contact:' || contact_id, '__inbox__')
ON CONFLICT (workspace_id, entity, scope_id) DO UPDATE
SET
  next_value = GREATEST(entity_counters.next_value, EXCLUDED.next_value),
  updated_at = now()
`);
  await sqlClient.unsafe(`
INSERT INTO entity_counters (workspace_id, entity, scope_id, next_value)
SELECT workspace_id, 'organization', '__workspace__', MAX(number) + 1
FROM organizations
WHERE number IS NOT NULL
GROUP BY workspace_id
ON CONFLICT (workspace_id, entity, scope_id) DO UPDATE
SET
  next_value = GREATEST(entity_counters.next_value, EXCLUDED.next_value),
  updated_at = now()
`);
  await sqlClient.unsafe(`
INSERT INTO entity_counters (workspace_id, entity, scope_id, next_value)
SELECT workspace_id, 'contact', '__workspace__', MAX(number) + 1
FROM contacts
WHERE number IS NOT NULL
GROUP BY workspace_id
ON CONFLICT (workspace_id, entity, scope_id) DO UPDATE
SET
  next_value = GREATEST(entity_counters.next_value, EXCLUDED.next_value),
  updated_at = now()
`);
  await sqlClient.unsafe(`
INSERT INTO entity_counters (workspace_id, entity, scope_id, next_value)
SELECT workspace_id, 'letter', '__workspace__', MAX(number) + 1
FROM letters
WHERE number IS NOT NULL
GROUP BY workspace_id
ON CONFLICT (workspace_id, entity, scope_id) DO UPDATE
SET
  next_value = GREATEST(entity_counters.next_value, EXCLUDED.next_value),
  updated_at = now()
`);
}

export async function verifyMigration(input: {
  sql: Sql;
  records: MigrationRecord[];
}): Promise<Verification> {
  const storage = new TargetStorage();
  const verification: Verification = {
    databaseRecords: { checked: 0, matched: 0, mismatched: 0 },
    blobs: { checked: 0, matched: 0, missing: 0, mismatched: 0 },
    foreignKeyViolations: {},
    duplicateViolations: {},
    sampleChecks: [],
    passed: false,
  };
  for (const record of input.records) {
    const existing = await existingRow(input.sql, record);
    const matched = Boolean(existing && rowMatches(existing, record.row));
    verification.databaseRecords.checked += 1;
    verification.databaseRecords[matched ? "matched" : "mismatched"] += 1;
    let blobMatched: boolean | null = null;
    if (record.blob?.object) {
      verification.blobs.checked += 1;
      const target = await storage.checksum(record.blob.targetKey);
      if (!target) verification.blobs.missing += 1;
      else if (target === record.blob.object.checksum) {
        verification.blobs.matched += 1;
        blobMatched = true;
      } else {
        verification.blobs.mismatched += 1;
        blobMatched = false;
      }
    }
    if (verification.sampleChecks.length < 12) {
      verification.sampleChecks.push({
        sourceType: record.sourceType,
        sourceId: record.sourceId,
        rowMatched: matched,
        blobMatched,
      });
    }
  }

  const fkQueries: Record<string, string> = {
    contacts_organizations:
      "SELECT count(*)::int AS count FROM contacts c LEFT JOIN organizations o ON o.id=c.organization_id WHERE c.organization_id IS NOT NULL AND o.id IS NULL",
    projects_organizations:
      "SELECT count(*)::int AS count FROM projects p LEFT JOIN organizations o ON o.id=p.organization_id WHERE p.organization_id IS NOT NULL AND o.id IS NULL",
    tasks_projects:
      "SELECT count(*)::int AS count FROM tasks t LEFT JOIN projects p ON p.id=t.project_id WHERE t.project_id IS NOT NULL AND p.id IS NULL",
    tasks_contacts:
      "SELECT count(*)::int AS count FROM tasks t LEFT JOIN contacts c ON c.id=t.contact_id WHERE t.contact_id IS NOT NULL AND c.id IS NULL",
    documents_projects:
      "SELECT count(*)::int AS count FROM documents d LEFT JOIN projects p ON p.id=d.project_id WHERE d.project_id IS NOT NULL AND p.id IS NULL",
    documents_parents:
      "SELECT count(*)::int AS count FROM documents d LEFT JOIN documents p ON p.id=d.parent_id WHERE d.parent_id IS NOT NULL AND p.id IS NULL",
    letters_projects:
      "SELECT count(*)::int AS count FROM letters l LEFT JOIN projects p ON p.id=l.project_id WHERE l.project_id IS NOT NULL AND p.id IS NULL",
  };
  for (const [name, query] of Object.entries(fkQueries)) {
    const result = await input.sql.unsafe<Array<{ count: number }>>(query);
    verification.foreignKeyViolations[name] = result[0]?.count ?? 0;
  }
  const duplicateQueries: Record<string, string> = {
    project_keys:
      "SELECT count(*)::int AS count FROM (SELECT workspace_id,key FROM projects GROUP BY workspace_id,key HAVING count(*)>1) d",
    task_numbers:
      "SELECT count(*)::int AS count FROM (SELECT workspace_id,coalesce('project:'||project_id,'contact:'||contact_id,'__inbox__'),number FROM tasks WHERE legacy_source IS NULL GROUP BY 1,2,3 HAVING count(*)>1) d",
    avatars:
      "SELECT count(*)::int AS count FROM (SELECT workspace_id,entity_type,entity_id FROM avatars GROUP BY 1,2,3 HAVING count(*)>1) d",
  };
  for (const [name, query] of Object.entries(duplicateQueries)) {
    const result = await input.sql.unsafe<Array<{ count: number }>>(query);
    verification.duplicateViolations[name] = result[0]?.count ?? 0;
  }
  verification.passed =
    verification.databaseRecords.mismatched === 0 &&
    verification.blobs.missing === 0 &&
    verification.blobs.mismatched === 0 &&
    Object.values(verification.foreignKeyViolations).every((count) => count === 0) &&
    Object.values(verification.duplicateViolations).every((count) => count === 0);
  return verification;
}

export function createTargetSql(): Sql {
  return postgres(required("DATABASE_URL"), { max: 4, prepare: false });
}
