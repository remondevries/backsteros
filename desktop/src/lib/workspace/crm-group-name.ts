import type { BacksterosApiClient } from "@backsteros/api-client";
import type { CrmGroup } from "@backsteros/contracts";

import type { CrmGroupRow } from "./crm-row-mappers";
import type { WorkspacePowerSync } from "./workspace-data-types";

/** Case-insensitive CRM group name key for dedupe and lookup. */
export function normalizeCrmGroupName(name: string): string {
  return name.trim().toLowerCase();
}

export function findCrmGroupByNormalizedName<T extends { name: string }>(
  groups: T[],
  name: string,
): T | null {
  const needle = normalizeCrmGroupName(name);
  if (!needle) return null;
  return groups.find((group) => normalizeCrmGroupName(group.name) === needle) ?? null;
}

/**
 * When multiple local rows share a name, prefer the row that exists on the
 * server (downloaded canonical id), then the oldest created_at.
 */
export function pickCanonicalCrmGroupRow(
  rows: CrmGroupRow[],
  serverGroupIds: ReadonlySet<string>,
  serverGroupForName: CrmGroup | null | undefined,
): CrmGroupRow {
  if (rows.length === 1) return rows[0]!;

  if (serverGroupForName) {
    const match = rows.find((row) => row.id === serverGroupForName.id);
    if (match) return match;
  }

  const onServer = rows.filter((row) => serverGroupIds.has(row.id));
  if (onServer.length > 0) {
    return onServer.sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;
  }

  return rows.sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;
}

/** One catalog row per normalized name (canonical id wins). */
export function dedupeCrmGroupsForDisplay(
  groups: CrmGroup[],
  serverGroupIds: ReadonlySet<string>,
): CrmGroup[] {
  const buckets = new Map<string, CrmGroup[]>();
  for (const group of groups) {
    const key = normalizeCrmGroupName(group.name);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(group);
    buckets.set(key, list);
  }

  const deduped: CrmGroup[] = [];
  for (const rows of buckets.values()) {
    const canonical = pickCanonicalCrmGroupRow(
      rows.map((group) => ({
        id: group.id,
        name: group.name,
        description: group.description,
        color: group.color,
        icon: group.icon,
        sort_order: group.sortOrder ?? 0,
        created_at: group.createdAt,
        updated_at: group.updatedAt,
        deleted_at: group.deletedAt,
      })),
      serverGroupIds,
      rows.find((row) => serverGroupIds.has(row.id)) ?? rows[0],
    );
    const group =
      rows.find((row) => row.id === canonical.id) ??
      rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!;
    deduped.push(group);
  }

  return deduped.sort(
    (a, b) =>
      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  );
}

async function fetchServerCrmGroups(
  client: BacksterosApiClient,
): Promise<CrmGroup[]> {
  const body = await client.requestJson<{ groups: CrmGroup[] }>(
    "/api/v1/crm-groups",
  );
  return body.groups ?? [];
}

/** Return an existing group with the same name instead of creating a duplicate. */
export async function findExistingCrmGroupByName(
  client: BacksterosApiClient,
  _powerSync: WorkspacePowerSync,
  name: string,
): Promise<CrmGroup | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  // API/Postgres only — do not treat PowerSync-only local rows as canonical.
  try {
    const serverGroups = await fetchServerCrmGroups(client);
    return findCrmGroupByNormalizedName(serverGroups, trimmed);
  } catch {
    return null;
  }
}
