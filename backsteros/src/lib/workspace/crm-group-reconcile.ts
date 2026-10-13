import type { BacksterosApiClient } from "@backsteros/api-client";
import type { CrmGroup } from "@backsteros/contracts";

import {
  addCrmGroupMemberWithRetry,
  removeCrmGroupMemberViaPowerSyncOrApi,
} from "./crm-mutations";
import {
  dedupeCrmGroupsForDisplay,
  normalizeCrmGroupName,
  pickCanonicalCrmGroupRow,
} from "./crm-group-name";
import type { CrmGroupRow } from "./crm-row-mappers";
import type { WorkspacePowerSync } from "./workspace-data-types";

const CRM_GROUPS_LIST_SQL = `
  SELECT id, name, description, color, icon, sort_order, created_at, updated_at, deleted_at
  FROM crm_groups
  WHERE deleted_at IS NULL
  ORDER BY sort_order ASC, created_at ASC
`.trim();

const CRM_GROUP_MEMBERS_FOR_GROUP_SQL = `
  SELECT id, subject_type, subject_id
  FROM crm_group_members
  WHERE deleted_at IS NULL AND group_id = ?
  ORDER BY created_at ASC
`.trim();

type LocalMemberRow = {
  id: string;
  subject_type: string;
  subject_id: string;
};

export type CrmGroupReconcileResult = {
  mergedGroupCount: number;
  movedMemberCount: number;
  redirectGroupIds: Map<string, string>;
};

async function flushCrmCrudUpload(
  powerSync: WorkspacePowerSync,
  label: string,
): Promise<void> {
  if (!powerSync.flushCrudUpload) return;
  try {
    await powerSync.flushCrudUpload();
  } catch (error) {
    console.warn(`[desktop] ${label} upload flush deferred`, error);
  }
}

async function fetchServerCrmGroups(
  client: BacksterosApiClient,
): Promise<CrmGroup[]> {
  const body = await client.requestJson<{ groups: CrmGroup[] }>(
    "/api/v1/crm-groups",
  );
  return body.groups ?? [];
}

async function softDeleteCrmGroupLocally(
  powerSync: WorkspacePowerSync,
  groupId: string,
): Promise<void> {
  if (!powerSync.patchMetadata) return;
  const deletedAt = new Date().toISOString();
  await powerSync.patchMetadata("crm_groups", groupId, {
    deleted_at: deletedAt,
  });
}

function groupRowsByName(rows: CrmGroupRow[]): Map<string, CrmGroupRow[]> {
  const buckets = new Map<string, CrmGroupRow[]>();
  for (const row of rows) {
    const key = normalizeCrmGroupName(row.name);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(row);
    buckets.set(key, list);
  }
  return buckets;
}

/**
 * Merge duplicate local CRM groups that share a name into the server-canonical
 * row, move memberships, upload to cloud, and soft-delete orphan groups.
 */
export async function reconcileDuplicateCrmGroups(
  client: BacksterosApiClient,
  powerSync: WorkspacePowerSync,
): Promise<CrmGroupReconcileResult> {
  const db = powerSync.database;
  if (!db || !powerSync.ready || !powerSync.createMetadata || !powerSync.patchMetadata) {
    return { mergedGroupCount: 0, movedMemberCount: 0, redirectGroupIds: new Map() };
  }

  let serverGroups: CrmGroup[];
  try {
    serverGroups = await fetchServerCrmGroups(client);
  } catch {
    return { mergedGroupCount: 0, movedMemberCount: 0, redirectGroupIds: new Map() };
  }

  const serverGroupIds = new Set(serverGroups.map((group) => group.id));
  const serverByName = new Map(
    serverGroups.map((group) => [normalizeCrmGroupName(group.name), group]),
  );

  const localRows = await db.getAll<CrmGroupRow>(CRM_GROUPS_LIST_SQL);
  const redirectGroupIds = new Map<string, string>();
  let mergedGroupCount = 0;
  let movedMemberCount = 0;

  for (const [nameKey, rows] of groupRowsByName(localRows)) {
    if (rows.length <= 1) continue;

    const canonical = pickCanonicalCrmGroupRow(
      rows,
      serverGroupIds,
      serverByName.get(nameKey),
    );

    const canonicalMembers = await db.getAll<LocalMemberRow>(
      CRM_GROUP_MEMBERS_FOR_GROUP_SQL,
      [canonical.id],
    );
    const canonicalMemberKeys = new Set(
      canonicalMembers.map(
        (member) => `${member.subject_type}:${member.subject_id}`,
      ),
    );

    for (const duplicate of rows) {
      if (duplicate.id === canonical.id) continue;
      redirectGroupIds.set(duplicate.id, canonical.id);

      const duplicateMembers = await db.getAll<LocalMemberRow>(
        CRM_GROUP_MEMBERS_FOR_GROUP_SQL,
        [duplicate.id],
      );

      for (const member of duplicateMembers) {
        const memberKey = `${member.subject_type}:${member.subject_id}`;
        if (!canonicalMemberKeys.has(memberKey)) {
          await addCrmGroupMemberWithRetry(client, powerSync, {
            groupId: canonical.id,
            subjectType: member.subject_type as "contact" | "organization",
            subjectId: member.subject_id,
          });
          canonicalMemberKeys.add(memberKey);
          movedMemberCount += 1;
        }
        await removeCrmGroupMemberViaPowerSyncOrApi(client, powerSync, {
          groupId: duplicate.id,
          subjectType: member.subject_type as "contact" | "organization",
          subjectId: member.subject_id,
          memberId: member.id,
        });
      }

      await softDeleteCrmGroupLocally(powerSync, duplicate.id);
      mergedGroupCount += 1;
    }
  }

  if (mergedGroupCount > 0 || movedMemberCount > 0) {
    await flushCrmCrudUpload(powerSync, "crm group reconcile");
  }

  return { mergedGroupCount, movedMemberCount, redirectGroupIds };
}

export function dedupeCatalogGroups(
  groups: CrmGroup[],
  serverGroups: CrmGroup[] | null,
): CrmGroup[] {
  const serverGroupIds = new Set((serverGroups ?? groups).map((group) => group.id));
  return dedupeCrmGroupsForDisplay(groups, serverGroupIds);
}
