import { and, asc, eq, gt } from "drizzle-orm";

import type { DbExecutor } from "./types.js";
import { db } from "../../db/index.js";
import { getWorkspaceLastSyncId } from "../sync-log.js";
import * as taskProjectService from "../tasks-projects.js";
import * as documentService from "../documents.js";
import * as circleService from "../crm-domain.js";
import { SYNC_SCHEMA_VERSION } from "../../lib/sync-constants.js";
import { isSpacesConfigured } from "../../lib/storage.js";
import {
  contactSnapshot,
  documentSnapshot,
  letterSnapshot,
  organizationSnapshot,
  projectSnapshot,
  taskSnapshot,
} from "./snapshots.js";
import { sanitizeWorkspaceSettings } from "../cursor-settings.js";
import { syncEvents } from "../../db/schema.js";
import { LIST_MAX_LIMIT } from "../../lib/list-query.js";

const PULL_PAGE_SIZE = 100;

/**
 * Legacy bootstrap loads one page per entity (not the full table).
 * Prefer PowerSync; this path is DEAD for product clients (storage-health only).
 */
export const BOOTSTRAP_ENTITY_PAGE_SIZE = LIST_MAX_LIMIT;

export async function maxCursor(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number> {
  return getWorkspaceLastSyncId(workspaceId, executor);
}

export async function bootstrapSync(workspaceId: string) {
  const page = BOOTSTRAP_ENTITY_PAGE_SIZE;
  // Fetch page+1 to detect truncation without a separate COUNT.
  const fetchCap = page + 1;

  const [
    projectRowsRaw,
    taskRowsRaw,
    documentRowsRaw,
    organizationRowsRaw,
    contactRowsRaw,
    letterRowsRaw,
    settings,
  ] = await Promise.all([
    taskProjectService.listProjects(workspaceId),
    taskProjectService.listTasks(workspaceId, { limit: fetchCap }),
    documentService.listDocuments(workspaceId, { limit: fetchCap }),
    circleService.listOrganizations(workspaceId),
    circleService.listContacts(workspaceId),
    circleService.listLetters(workspaceId),
    circleService.getSettings(workspaceId),
  ]);

  const taskTruncated = taskRowsRaw.length > page;
  const documentTruncated = documentRowsRaw.length > page;
  const taskRows = taskTruncated ? taskRowsRaw.slice(0, page) : taskRowsRaw;
  const documentRows = documentTruncated
    ? documentRowsRaw.slice(0, page)
    : documentRowsRaw;

  // Soft-cap CRM collections the same way (list* may still be unbounded today).
  const projectRows = projectRowsRaw.slice(0, page);
  const organizationRows = organizationRowsRaw.slice(0, page);
  const contactRows = contactRowsRaw.slice(0, page);
  const letterRows = letterRowsRaw.slice(0, page);

  const lastSyncId = await maxCursor(workspaceId);
  const truncated =
    taskTruncated ||
    documentTruncated ||
    projectRowsRaw.length > page ||
    organizationRowsRaw.length > page ||
    contactRowsRaw.length > page ||
    letterRowsRaw.length > page;

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: lastSyncId,
    last_sync_id: lastSyncId,
    spaces_configured: isSpacesConfigured(),
    /** True when any snapshot collection was capped at {@link BOOTSTRAP_ENTITY_PAGE_SIZE}. */
    truncated,
    has_more: truncated,
    page_size: page,
    snapshot: {
      projects: projectRows.map(projectSnapshot),
      tasks: taskRows.map(taskSnapshot),
      documents: documentRows.map(documentSnapshot),
      organizations: organizationRows.map(organizationSnapshot),
      contacts: contactRows.map(contactSnapshot),
      letters: letterRows.map(letterSnapshot),
      workspace_settings: [
        {
          id: workspaceId,
          settings: sanitizeWorkspaceSettings(
            settings as Record<string, unknown>,
          ),
        },
      ],
    },
  };
}

export async function pullSync(workspaceId: string, cursor: number) {
  const events = await db
    .select()
    .from(syncEvents)
    .where(
      and(
        eq(syncEvents.workspaceId, workspaceId),
        gt(syncEvents.cursor, cursor),
      ),
    )
    .orderBy(asc(syncEvents.cursor))
    .limit(PULL_PAGE_SIZE + 1);

  const hasMore = events.length > PULL_PAGE_SIZE;
  const page = hasMore ? events.slice(0, PULL_PAGE_SIZE) : events;
  const nextCursor = page.length > 0 ? page[page.length - 1]!.cursor : cursor;

  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: nextCursor,
    last_sync_id: nextCursor,
    has_more: hasMore,
    events: page.map((row) => ({
      cursor: row.cursor,
      mutation_id: row.mutationId,
      device_id: row.deviceId,
      entity: row.entity,
      entity_id: row.entityId,
      operation: row.operation,
      payload: row.payload,
      created_at: row.createdAt.getTime(),
    })),
  };
}
