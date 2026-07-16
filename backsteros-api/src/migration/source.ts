import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

export const BUSINESS_TABLES = [
  "organizations",
  "contacts",
  "projects",
  "tasks",
  "documents",
  "knowledge_documents",
  "letters",
] as const;

export const EXCLUDED_TABLES = [
  "users",
  "api_keys",
  "mobile_device_sessions",
  "mobile_sync_events",
  "login_attempts",
  "spaces_integration",
  "sync_state",
  "sync_outbox",
  "general_settings",
  "vault_settings",
] as const;

const REQUIRED_COLUMNS: Record<(typeof BUSINESS_TABLES)[number], string[]> = {
  organizations: ["id", "key", "name", "created_at", "updated_at"],
  contacts: ["id", "key", "name", "organization_id", "created_at", "updated_at"],
  projects: ["id", "key", "name", "organization_id", "created_at", "updated_at"],
  tasks: [
    "id",
    "project_id",
    "contact_id",
    "assignee_id",
    "number",
    "title",
    "created_at",
    "updated_at",
  ],
  documents: [
    "id",
    "project_id",
    "relative_path",
    "title",
    "created_at",
    "updated_at",
  ],
  knowledge_documents: [
    "id",
    "relative_path",
    "title",
    "created_at",
    "updated_at",
  ],
  letters: [
    "id",
    "storage_key",
    "original_filename",
    "byte_size",
    "created_at",
    "updated_at",
  ],
};

export type SourceRow = Record<string, unknown>;

export type SourceSnapshot = {
  dbPath: string;
  vaultRoot: string | null;
  fingerprint: string;
  rows: Record<(typeof BUSINESS_TABLES)[number], SourceRow[]>;
  avatarSources: Array<{
    entityType: "organization" | "contact" | "user";
    entityId: string;
    storageKey: string;
    contentType: string | null;
  }>;
  inventory: Record<string, number | boolean | string[]>;
};

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function queryRows(db: DatabaseSync, table: string): SourceRow[] {
  return db.prepare(`SELECT * FROM "${table}" ORDER BY id`).all() as SourceRow[];
}

export function openSourceSnapshot(dbPath: string): SourceSnapshot {
  const resolved = path.resolve(dbPath);
  const stat = fs.statSync(resolved);
  const db = new DatabaseSync(resolved, { readOnly: true });
  try {
    const tableNames = new Set(
      (
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name),
    );
    for (const table of BUSINESS_TABLES) {
      if (!tableNames.has(table)) {
        throw new Error(`SOURCE_SCHEMA_MISSING_TABLE:${table}`);
      }
      const columns = new Set(
        (
          db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>
        ).map((row) => row.name),
      );
      for (const column of REQUIRED_COLUMNS[table]) {
        if (!columns.has(column)) {
          throw new Error(`SOURCE_SCHEMA_MISSING_COLUMN:${table}.${column}`);
        }
      }
    }

    const rows = Object.fromEntries(
      BUSINESS_TABLES.map((table) => [table, queryRows(db, table)]),
    ) as SourceSnapshot["rows"];
    const avatarSources = [
      ...(db
        .prepare(
          "SELECT 'organization' AS entityType, id AS entityId, avatar_storage_key AS storageKey, avatar_content_type AS contentType FROM organizations WHERE avatar_storage_key IS NOT NULL",
        )
        .all() as SourceSnapshot["avatarSources"]),
      ...(db
        .prepare(
          "SELECT 'contact' AS entityType, id AS entityId, avatar_storage_key AS storageKey, avatar_content_type AS contentType FROM contacts WHERE avatar_storage_key IS NOT NULL",
        )
        .all() as SourceSnapshot["avatarSources"]),
      ...(db
        .prepare(
          "SELECT 'user' AS entityType, id AS entityId, avatar_storage_key AS storageKey, avatar_content_type AS contentType FROM users WHERE avatar_storage_key IS NOT NULL",
        )
        .all() as SourceSnapshot["avatarSources"]),
    ];
    const vaultRow = db
      .prepare("SELECT root_path FROM vault_settings WHERE id = 'default'")
      .get() as { root_path?: string | null } | undefined;
    const rawVault = vaultRow?.root_path?.trim();
    const configuredVault = rawVault?.startsWith("~/")
      ? path.join(process.env.HOME || "", rawVault.slice(2))
      : rawVault;
    const vaultRoot =
      configuredVault && fs.existsSync(configuredVault)
        ? path.resolve(configuredVault)
        : null;
    const journalCount = vaultRoot
      ? countFiles(path.join(vaultRoot, "journal"), (name) => name.endsWith(".md"))
      : 0;
    const vaultFileCount = vaultRoot
      ? countFiles(vaultRoot, () => true)
      : 0;
    const fingerprint = sha256(
      JSON.stringify({
        path: resolved,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ids: Object.fromEntries(
          BUSINESS_TABLES.map((table) => [
            table,
            rows[table].map((row) => row.id),
          ]),
        ),
      }),
    );

    return {
      dbPath: resolved,
      vaultRoot,
      fingerprint,
      rows,
      avatarSources,
      inventory: {
        ...Object.fromEntries(
          BUSINESS_TABLES.map((table) => [table, rows[table].length]),
        ),
        journal_documents: journalCount,
        vault_files: vaultFileCount,
        vault_available: Boolean(vaultRoot),
        avatars: avatarSources.length,
        excluded_tables: [...EXCLUDED_TABLES],
      },
    };
  } finally {
    db.close();
  }
}

function countFiles(root: string, predicate: (name: string) => boolean): number {
  if (!fs.existsSync(root)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) count += countFiles(absolute, predicate);
    else if (entry.isFile() && predicate(entry.name)) count += 1;
  }
  return count;
}

export function readEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const values: Record<string, string> = {};
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]!] = value;
  }
  return values;
}

export type ObjectSource = {
  bytes: Uint8Array;
  checksum: string;
  contentType: string;
  origin: "vault" | "spaces";
  fallbackChecksum?: string;
  checksumConflict: boolean;
};

export class CircleContentSource {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor(
    private readonly vaultRoot: string | null,
    sourceEnv: Record<string, string>,
  ) {
    const endpoint = sourceEnv.SPACES_ENDPOINT;
    const accessKeyId = sourceEnv.SPACES_ACCESS_KEY_ID;
    const secretAccessKey = sourceEnv.SPACES_SECRET_ACCESS_KEY;
    this.bucket = sourceEnv.SPACES_BUCKET || null;
    this.client =
      endpoint && accessKeyId && secretAccessKey && this.bucket
        ? new S3Client({
            endpoint,
            region: sourceEnv.SPACES_REGION || "ams3",
            credentials: { accessKeyId, secretAccessKey },
          })
        : null;
  }

  async read(
    localRelativePaths: string[],
    remoteKey: string,
    contentType: string,
  ): Promise<ObjectSource | null> {
    let local: Uint8Array | null = null;
    if (this.vaultRoot) {
      for (const candidate of localRelativePaths) {
        const absolute = path.resolve(this.vaultRoot, candidate);
        if (
          absolute.startsWith(`${path.resolve(this.vaultRoot)}${path.sep}`) &&
          fs.existsSync(absolute) &&
          fs.statSync(absolute).isFile()
        ) {
          local = fs.readFileSync(absolute);
          break;
        }
      }
    }
    const remote = await this.getRemote(remoteKey);
    if (!local && !remote) return null;
    const localChecksum = local ? sha256(local) : null;
    const remoteChecksum = remote ? sha256(remote.bytes) : null;
    const bytes = local ?? remote!.bytes;
    return {
      bytes,
      checksum: localChecksum ?? remoteChecksum!,
      contentType: remote?.contentType || contentType,
      origin: local ? "vault" : "spaces",
      fallbackChecksum: local && remote ? remoteChecksum! : undefined,
      checksumConflict: Boolean(
        localChecksum && remoteChecksum && localChecksum !== remoteChecksum,
      ),
    };
  }

  async list(prefix: string): Promise<string[]> {
    if (!this.client || !this.bucket) return [];
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of result.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }
      continuationToken = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (continuationToken);
    return keys.sort();
  }

  private async getRemote(
    key: string,
  ): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    if (!this.client || !this.bucket || !key) return null;
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!result.Body) return null;
      return {
        bytes: new Uint8Array(await result.Body.transformToByteArray()),
        contentType: result.ContentType || "application/octet-stream",
      };
    } catch (error) {
      const code = (error as { name?: string }).name;
      if (code === "NoSuchKey" || code === "NotFound") return null;
      throw error;
    }
  }
}

export function deterministicId(prefix: string, value: string): string {
  return `${prefix}_${sha256(value).slice(0, 24)}`;
}

export function checksum(value: string | Uint8Array): string {
  return sha256(value);
}
