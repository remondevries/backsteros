import type { Area } from "@backsteros/contracts";
import { useCallback, useMemo } from "react";

import type { NestedAreaRef } from "./group-projects-by-area";
import { isProjectArea, type ProjectArea } from "./project-areas";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useSyncedOrRest } from "./use-synced-or-rest";

/** Mirrors desktop `AREA_LIST_COLUMNS` / `@backsteros/powersync-schema` areas table. */
export const AREAS_LIST_SQL = `SELECT id, name, parent, icon, color, sort_order, created_at, updated_at, deleted_at
 FROM areas
 WHERE deleted_at IS NULL
 ORDER BY sort_order ASC, name COLLATE NOCASE ASC`;

/** @deprecated Prefer `AREAS_LIST_SQL`. */
export const AREAS_SQL = AREAS_LIST_SQL;

export type SyncedAreaRow = {
  id: string;
  name: string | null;
  parent: string | null;
  icon: string | null;
  color: string | null;
  sort_order: number | null;
  created_at: string | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export type AreaListItem = {
  id: string;
  name: string;
  parent: ProjectArea | null;
  icon: string | null;
  color: string | null;
  sortOrder: number;
};

function parentFromSynced(value: string | null): ProjectArea | null {
  return value != null && isProjectArea(value) ? value : null;
}

function parentFromRest(value: Area["parent"]): ProjectArea | null {
  return value != null && isProjectArea(value) ? value : null;
}

export function mapSyncedAreaRow(row: SyncedAreaRow): AreaListItem {
  return {
    id: row.id,
    name: row.name?.trim() || "Untitled",
    parent: parentFromSynced(row.parent),
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order ?? 0,
  };
}

export function mapRestArea(area: Area): AreaListItem {
  return {
    id: area.id,
    name: area.name?.trim() || "Untitled",
    parent: parentFromRest(area.parent),
    icon: area.icon,
    color: area.color,
    sortOrder: area.sortOrder,
  };
}

export function toNestedAreaRef(item: AreaListItem): NestedAreaRef {
  return {
    id: item.id,
    name: item.name,
    parent: item.parent,
    sortOrder: item.sortOrder,
  };
}

export async function fetchAreasRest(
  client: ReturnType<typeof useMobileApiClient>,
): Promise<AreaListItem[]> {
  const body = await client.requestJson<{ areas: Area[] }>("/api/v1/areas");
  return (body.areas ?? []).map(mapRestArea);
}

type UseSyncedAreasOptions = {
  /** When false, local watch only — no REST hydrate (e.g. projects tab). */
  restEnabled?: boolean;
};

/**
 * Prefer live PowerSync area rows when connected; REST list when offline or SQLite empty.
 * Writes via `area-mutations.ts` (create / update / soft-delete).
 */
export function useSyncedAreas(options?: UseSyncedAreasOptions) {
  const restEnabled = options?.restEnabled !== false;
  const client = useMobileApiClient();

  const fetchRest = useCallback(async () => {
    if (!restEnabled) return [];
    return fetchAreasRest(client);
  }, [client, restEnabled]);

  const query = useSyncedOrRest<SyncedAreaRow, AreaListItem>({
    sql: AREAS_LIST_SQL,
    mapLocal: (rows) => rows.map(mapSyncedAreaRow),
    fetchRest,
    restEnabled,
  });

  const nestedAreas = useMemo(
    () => query.rows.map(toNestedAreaRef),
    [query.rows],
  );

  return {
    ...query,
    nestedAreas,
  };
}
