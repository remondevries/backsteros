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
const PULL_PAGE_SIZE = 100;

export async function maxCursor(
  workspaceId: string,
  executor: DbExecutor = db,
): Promise<number> {
  return getWorkspaceLastSyncId(workspaceId, executor);
}

export async function bootstrapSync(workspaceId: string) {
  const [
    projectRows,
    taskRows,
    documentRows,
    organizationRows,
    contactRows,
    letterRows,
    settings,
  ] = await Promise.all([
    taskProjectService.listProjects(workspaceId),
    taskProjectService.listTasks(workspaceId),
    documentService.listDocuments(workspaceId),
    circleService.listOrganizations(workspaceId),
    circleService.listContacts(workspaceId),
    circleService.listLetters(workspaceId),
    circleService.getSettings(workspaceId),
  ]);

  const lastSyncId = await maxCursor(workspaceId);
  return {
    schema_version: SYNC_SCHEMA_VERSION,
    cursor: lastSyncId,
    last_sync_id: lastSyncId,
    spaces_configured: isSpacesConfigured(),
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
