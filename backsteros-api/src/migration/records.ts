import fs from "node:fs";
import path from "node:path";

import type {
  CircleContentSource,
  ObjectSource,
  SourceRow,
  SourceSnapshot,
} from "./source.js";
import { checksum, deterministicId } from "./source.js";

export type MigrationRecord = {
  sourceType: string;
  sourceId: string;
  targetTable:
    | "organizations"
    | "contacts"
    | "projects"
    | "tasks"
    | "documents"
    | "letters"
    | "avatars";
  targetId: string;
  row: Record<string, unknown>;
  blob?: {
    targetKey: string;
    object: ObjectSource | null;
  };
  warnings: string[];
  sourceChecksum: string;
};

function timestamp(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date =
    typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`INVALID_SOURCE_TIMESTAMP:${String(value)}`);
  }
  return date;
}

function number(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  return Number(value);
}

function string(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function baseRecord(
  workspaceId: string,
  row: SourceRow,
): Record<string, unknown> {
  return {
    id: string(row.id),
    workspace_id: workspaceId,
    created_at: timestamp(row.created_at),
    updated_at: timestamp(row.updated_at),
    deleted_at: timestamp(row.deleted_at),
  };
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function finish(
  record: Omit<MigrationRecord, "sourceChecksum">,
): MigrationRecord {
  return {
    ...record,
    sourceChecksum: checksum(
      canonical({
        row: record.row,
        blob: record.blob?.object?.checksum ?? null,
      }),
    ),
  };
}

function parentPaths(relativePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean);
  parts.pop();
  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function folderId(type: "project" | "knowledge", scope: string, folder: string) {
  return deterministicId("circle_folder", `${type}:${scope}:${folder}`);
}

function documentStorageKey(
  workspaceId: string,
  type: "project" | "knowledge" | "journal",
  relativePath: string,
  projectKey?: string,
): string {
  if (type === "project") {
    return `workspaces/${workspaceId}/markdown/projects/${projectKey}/${relativePath}.md`;
  }
  return `workspaces/${workspaceId}/markdown/${type}/${relativePath}.md`;
}

function privateKey(
  workspaceId: string,
  category: "pdfs" | "avatars",
  id: string,
  filename: string,
): string {
  const safe = (value: string) =>
    value.replace(/[^a-zA-Z0-9._-]/g, "_") || "file";
  return `workspaces/${safe(workspaceId)}/private/${category}/${safe(id)}/${safe(filename)}`;
}

function localFolderPaths(snapshot: SourceSnapshot): Array<{
  type: "project" | "knowledge";
  scope: string;
  path: string;
}> {
  if (!snapshot.vaultRoot) return [];
  const projects = new Map(
    snapshot.rows.projects.map((row) => [string(row.key), string(row.id)]),
  );
  const result: Array<{
    type: "project" | "knowledge";
    scope: string;
    path: string;
  }> = [];
  const walk = (
    root: string,
    type: "project" | "knowledge",
    scope: string,
    relative = "",
  ) => {
    if (!fs.existsSync(root)) return;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      result.push({ type, scope, path: next });
      walk(path.join(root, entry.name), type, scope, next);
    }
  };
  walk(path.join(snapshot.vaultRoot, "knowledge"), "knowledge", "knowledge");
  const projectsRoot = path.join(snapshot.vaultRoot, "projects");
  if (fs.existsSync(projectsRoot)) {
    for (const entry of fs.readdirSync(projectsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && projects.has(entry.name)) {
        walk(
          path.join(projectsRoot, entry.name),
          "project",
          projects.get(entry.name)!,
        );
      }
    }
  }
  return result;
}

export async function buildMigrationRecords(
  snapshot: SourceSnapshot,
  content: CircleContentSource,
  workspaceId: string,
  ownerUserId: string,
): Promise<MigrationRecord[]> {
  const records: MigrationRecord[] = [];
  const projectsById = new Map(
    snapshot.rows.projects.map((row) => [string(row.id), row]),
  );

  for (const row of snapshot.rows.organizations) {
    records.push(
      finish({
        sourceType: "organization",
        sourceId: string(row.id),
        targetTable: "organizations",
        targetId: string(row.id),
        row: {
          ...baseRecord(workspaceId, row),
          number: row.number === null ? null : number(row.number),
          key: string(row.key),
          name: string(row.name),
          summary: nullableString(row.summary),
          phone: nullableString(row.phone),
          email: nullableString(row.email),
          website: nullableString(row.website),
          address: nullableString(row.address),
          city: nullableString(row.city),
          postal_code: nullableString(row.postal_code),
          country: nullableString(row.country),
          avatar_storage_key: null,
          avatar_content_type: nullableString(row.avatar_content_type),
          sort_order: number(row.sort_order),
          notes: null,
        },
        warnings: [],
      }),
    );
  }

  for (const row of snapshot.rows.contacts) {
    records.push(
      finish({
        sourceType: "contact",
        sourceId: string(row.id),
        targetTable: "contacts",
        targetId: string(row.id),
        row: {
          ...baseRecord(workspaceId, row),
          organization_id: nullableString(row.organization_id),
          number: row.number === null ? null : number(row.number),
          key: string(row.key),
          name: string(row.name),
          email: nullableString(row.email),
          title: nullableString(row.title),
          summary: nullableString(row.summary),
          avatar_storage_key: null,
          avatar_content_type: nullableString(row.avatar_content_type),
          sort_order: number(row.sort_order),
          phone: null,
          role: null,
          notes: null,
          address: null,
          city: null,
          postal_code: null,
          country: null,
          social_accounts: [],
        },
        warnings: [],
      }),
    );
  }

  for (const row of snapshot.rows.projects) {
    records.push(
      finish({
        sourceType: "project",
        sourceId: string(row.id),
        targetTable: "projects",
        targetId: string(row.id),
        row: {
          ...baseRecord(workspaceId, row),
          key: string(row.key),
          name: string(row.name),
          summary: nullableString(row.summary),
          description: nullableString(row.description),
          organization_id: nullableString(row.organization_id),
          area_id: null,
          area: nullableString(row.area),
          start_date: timestamp(row.start_date),
          due_date: timestamp(row.due_date),
          icon: nullableString(row.icon),
          color: nullableString(row.color),
          status: string(row.status, "backlog"),
          priority: number(row.priority),
          sort_order: number(row.sort_order),
        },
        warnings: [],
      }),
    );
  }

  for (const row of snapshot.rows.tasks) {
    records.push(
      finish({
        sourceType: "task",
        sourceId: string(row.id),
        targetTable: "tasks",
        targetId: string(row.id),
        row: {
          ...baseRecord(workspaceId, row),
          project_id: nullableString(row.project_id),
          contact_id: nullableString(row.contact_id),
          assignee_id: nullableString(row.assignee_id),
          number: number(row.number),
          title: string(row.title),
          description: nullableString(row.description),
          status: string(row.status, "ready_to_start"),
          priority: number(row.priority),
          sort_order: number(row.sort_order),
          due_date: timestamp(row.due_date),
          triaged_at: null,
          inbox: row.project_id == null && row.contact_id == null,
          legacy_source: "circle",
          completed_at: timestamp(row.completed_at),
        },
        warnings: [],
      }),
    );
  }

  const folders = new Map<
    string,
    { type: "project" | "knowledge"; scope: string; path: string }
  >();
  for (const row of snapshot.rows.documents) {
    for (const folder of parentPaths(string(row.relative_path))) {
      folders.set(`project:${string(row.project_id)}:${folder}`, {
        type: "project",
        scope: string(row.project_id),
        path: folder,
      });
    }
  }
  for (const row of snapshot.rows.knowledge_documents) {
    for (const folder of parentPaths(string(row.relative_path))) {
      folders.set(`knowledge:knowledge:${folder}`, {
        type: "knowledge",
        scope: "knowledge",
        path: folder,
      });
    }
  }
  for (const folder of localFolderPaths(snapshot)) {
    folders.set(`${folder.type}:${folder.scope}:${folder.path}`, folder);
  }
  const remoteMarkdownKeys = await content.list("circle/markdown/");
  for (const key of remoteMarkdownKeys) {
    const projectMatch = /^circle\/markdown\/projects\/([^/]+)\/(.+)\/\.gitkeep$/.exec(
      key,
    );
    const knowledgeMatch =
      /^circle\/markdown\/knowledge\/(.+)\/\.gitkeep$/.exec(key);
    if (projectMatch) {
      folders.set(`project:${projectMatch[1]}:${projectMatch[2]}`, {
        type: "project",
        scope: projectMatch[1]!,
        path: projectMatch[2]!,
      });
    } else if (knowledgeMatch) {
      folders.set(`knowledge:knowledge:${knowledgeMatch[1]}`, {
        type: "knowledge",
        scope: "knowledge",
        path: knowledgeMatch[1]!,
      });
    }
  }

  for (const folder of [...folders.values()].sort((a, b) =>
    `${a.type}:${a.scope}:${a.path}`.localeCompare(
      `${b.type}:${b.scope}:${b.path}`,
    ),
  )) {
    const id = folderId(folder.type, folder.scope, folder.path);
    const parent = parentPaths(`${folder.path}/x`).at(-2);
    const project = folder.type === "project" ? projectsById.get(folder.scope) : null;
    const storageKey = documentStorageKey(
      workspaceId,
      folder.type,
      `${folder.path}/.gitkeep`,
      project ? string(project.key) : undefined,
    );
    records.push(
      finish({
        sourceType: `${folder.type}_folder`,
        sourceId: `${folder.scope}:${folder.path}`,
        targetTable: "documents",
        targetId: id,
        row: {
          id,
          workspace_id: workspaceId,
          type: folder.type,
          project_id: folder.type === "project" ? folder.scope : null,
          parent_id: parent
            ? folderId(folder.type, folder.scope, parent)
            : null,
          kind: "folder",
          icon: null,
          sort_order: 0,
          journal_date: null,
          path: folder.path,
          title: folder.path.split("/").at(-1)!,
          storage_key: storageKey,
          content_type: "application/x-directory",
          byte_size: 0,
          checksum: checksum(""),
          snippet: null,
          content_version: 1,
          content_etag: null,
          created_at: new Date(0),
          updated_at: new Date(0),
          deleted_at: null,
        },
        warnings: [],
      }),
    );
  }

  for (const row of snapshot.rows.documents) {
    const project = projectsById.get(string(row.project_id));
    if (!project) throw new Error(`SOURCE_ORPHAN_DOCUMENT:${string(row.id)}`);
    const relativePath = string(row.relative_path);
    const object = await content.read(
      [`projects/${string(project.key)}/${relativePath}.md`],
      `circle/markdown/projects/${string(row.project_id)}/${relativePath}.md`,
      "text/markdown; charset=utf-8",
    );
    const parent = parentPaths(relativePath).at(-1);
    const warnings = object?.checksumConflict
      ? ["SOURCE_LOCAL_SPACES_CHECKSUM_CONFLICT"]
      : [];
    records.push(
      finish({
        sourceType: "project_document",
        sourceId: string(row.id),
        targetTable: "documents",
        targetId: string(row.id),
        row: documentRow({
          row,
          workspaceId,
          type: "project",
          projectId: string(row.project_id),
          path: relativePath,
          parentId: parent
            ? folderId("project", string(row.project_id), parent)
            : null,
          storageKey: documentStorageKey(
            workspaceId,
            "project",
            relativePath,
            string(project.key),
          ),
          object,
        }),
        blob: {
          targetKey: documentStorageKey(
            workspaceId,
            "project",
            relativePath,
            string(project.key),
          ),
          object,
        },
        warnings,
      }),
    );
  }

  for (const row of snapshot.rows.knowledge_documents) {
    const relativePath = string(row.relative_path);
    const object = await content.read(
      [`knowledge/${relativePath}.md`],
      `circle/markdown/knowledge/${relativePath}.md`,
      "text/markdown; charset=utf-8",
    );
    const parent = parentPaths(relativePath).at(-1);
    records.push(
      finish({
        sourceType: "knowledge_document",
        sourceId: string(row.id),
        targetTable: "documents",
        targetId: string(row.id),
        row: documentRow({
          row,
          workspaceId,
          type: "knowledge",
          projectId: null,
          path: relativePath,
          parentId: parent
            ? folderId("knowledge", "knowledge", parent)
            : null,
          storageKey: documentStorageKey(
            workspaceId,
            "knowledge",
            relativePath,
          ),
          object,
        }),
        blob: {
          targetKey: documentStorageKey(
            workspaceId,
            "knowledge",
            relativePath,
          ),
          object,
        },
        warnings: object?.checksumConflict
          ? ["SOURCE_LOCAL_SPACES_CHECKSUM_CONFLICT"]
          : [],
      }),
    );
  }

  const journalPaths = new Set<string>();
  if (snapshot.vaultRoot) {
    const journalRoot = path.join(snapshot.vaultRoot, "journal");
    if (fs.existsSync(journalRoot)) {
      for (const entry of fs.readdirSync(journalRoot, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith(".md")) {
          journalPaths.add(entry.name.slice(0, -3));
        }
      }
    }
  }
  for (const key of remoteMarkdownKeys) {
    const match = /^circle\/markdown\/journal\/(.+)\.md$/.exec(key);
    if (match) journalPaths.add(match[1]!);
  }
  for (const dateSlug of [...journalPaths].sort()) {
    const object = await content.read(
      [`journal/${dateSlug}.md`],
      `circle/markdown/journal/${dateSlug}.md`,
      "text/markdown; charset=utf-8",
    );
    const id = deterministicId("circle_journal", dateSlug);
    const targetKey = documentStorageKey(
      workspaceId,
      "journal",
      dateSlug,
    );
    const localPath = snapshot.vaultRoot
      ? path.join(snapshot.vaultRoot, "journal", `${dateSlug}.md`)
      : null;
    const modified =
      localPath && fs.existsSync(localPath)
        ? fs.statSync(localPath).mtime
        : new Date(0);
    records.push(
      finish({
        sourceType: "journal_document",
        sourceId: dateSlug,
        targetTable: "documents",
        targetId: id,
        row: {
          id,
          workspace_id: workspaceId,
          type: "journal",
          project_id: null,
          parent_id: null,
          kind: "document",
          icon: null,
          sort_order: 0,
          journal_date: dateSlug,
          path: dateSlug,
          title: dateSlug,
          storage_key: targetKey,
          content_type: object?.contentType ?? "text/markdown; charset=utf-8",
          byte_size: object?.bytes.byteLength ?? 0,
          checksum: object?.checksum ?? null,
          snippet: object ? snippet(object.bytes) : null,
          content_version: 1,
          content_etag: null,
          created_at: modified,
          updated_at: modified,
          deleted_at: null,
        },
        blob: { targetKey, object },
        warnings: object?.checksumConflict
          ? ["SOURCE_LOCAL_SPACES_CHECKSUM_CONFLICT"]
          : [],
      }),
    );
  }

  for (const row of snapshot.rows.letters) {
    const filename = path.basename(string(row.original_filename, "letter.pdf"));
    const object = await content.read(
      [
        `letters/${filename}`,
        string(row.storage_key),
        `letters/${path.basename(string(row.storage_key))}`,
      ],
      string(row.storage_key),
      "application/pdf",
    );
    const targetKey = privateKey(workspaceId, "pdfs", string(row.id), filename);
    records.push(
      finish({
        sourceType: "letter",
        sourceId: string(row.id),
        targetTable: "letters",
        targetId: string(row.id),
        row: {
          ...baseRecord(workspaceId, row),
          number: row.number === null ? null : number(row.number),
          project_id: nullableString(row.project_id),
          organization_id: nullableString(row.organization_id),
          contact_id: nullableString(row.contact_id),
          title: string(row.title),
          icon: nullableString(row.icon),
          context: nullableString(row.context),
          status: string(row.status, "ready_to_start"),
          due_date: timestamp(row.due_date),
          received_date: timestamp(row.received_date),
          direction: "incoming",
          storage_key: targetKey,
          original_filename: filename,
          content_type: object?.contentType ?? "application/pdf",
          byte_size: object?.bytes.byteLength ?? number(row.byte_size),
          checksum: object?.checksum ?? null,
          content_etag: null,
          extracted_text: nullableString(row.extracted_text),
          sort_order: number(row.sort_order),
        },
        blob: { targetKey, object },
        warnings: object?.checksumConflict
          ? ["SOURCE_LOCAL_SPACES_CHECKSUM_CONFLICT"]
          : [],
      }),
    );
  }

  for (const avatar of snapshot.avatarSources) {
    const targetEntityId =
      avatar.entityType === "user" && ownerUserId
        ? ownerUserId
        : avatar.entityId;
    const filename = path.basename(avatar.storageKey);
    const object = await content.read(
      [avatar.storageKey],
      avatar.storageKey,
      avatar.contentType || "image/jpeg",
    );
    const id = deterministicId(
      "circle_avatar",
      `${avatar.entityType}:${avatar.entityId}`,
    );
    const targetKey = privateKey(
      workspaceId,
      "avatars",
      targetEntityId,
      filename,
    );
    records.push(
      finish({
        sourceType: "avatar",
        sourceId: `${avatar.entityType}:${avatar.entityId}`,
        targetTable: "avatars",
        targetId: id,
        row: {
          id,
          workspace_id: workspaceId,
          entity_type: avatar.entityType,
          entity_id: targetEntityId,
          storage_key: targetKey,
          content_type: object?.contentType ?? avatar.contentType ?? "image/jpeg",
          byte_size: object?.bytes.byteLength ?? 0,
          checksum: object?.checksum ?? "",
          content_etag: null,
          created_at: new Date(0),
          updated_at: new Date(0),
        },
        blob: { targetKey, object },
        warnings: object?.checksumConflict
          ? ["SOURCE_LOCAL_SPACES_CHECKSUM_CONFLICT"]
          : [],
      }),
    );
  }

  return records;
}

function documentRow(input: {
  row: SourceRow;
  workspaceId: string;
  type: "project" | "knowledge";
  projectId: string | null;
  path: string;
  parentId: string | null;
  storageKey: string;
  object: ObjectSource | null;
}): Record<string, unknown> {
  return {
    ...baseRecord(input.workspaceId, input.row),
    type: input.type,
    project_id: input.projectId,
    parent_id: input.parentId,
    kind: "document",
    icon: nullableString(input.row.icon),
    sort_order: number(input.row.sort_order),
    journal_date: null,
    path: input.path,
    title: string(input.row.title),
    storage_key: input.storageKey,
    content_type:
      input.object?.contentType ?? "text/markdown; charset=utf-8",
    byte_size: input.object?.bytes.byteLength ?? 0,
    checksum: input.object?.checksum ?? null,
    snippet: input.object ? snippet(input.object.bytes) : null,
    content_version: 1,
    content_etag: null,
  };
}

function snippet(bytes: Uint8Array): string {
  const value = Buffer.from(bytes).toString("utf8").trim();
  return value.length <= 500 ? value : `${value.slice(0, 500)}…`;
}
