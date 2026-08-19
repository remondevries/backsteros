import type { Organization } from "@backsteros/contracts";
import { useMemo } from "react";

import { useMobileApiClient } from "./use-mobile-api-client";
import { useSyncedOrRest } from "./use-synced-or-rest";

export type OrganizationNameRow = {
  id: string;
  name: string;
};

type SyncedOrgRow = {
  id: string;
  name: string | null;
};

const ORGANIZATIONS_SQL = `SELECT id, name FROM organizations
 WHERE deleted_at IS NULL
 ORDER BY name COLLATE NOCASE ASC`;

/** Synced/REST organization id + display name rows. */
export function useOrganizations(): {
  rows: OrganizationNameRow[];
  loading: boolean;
} {
  const client = useMobileApiClient();
  const { rows, loading } = useSyncedOrRest<SyncedOrgRow, OrganizationNameRow>({
    sql: ORGANIZATIONS_SQL,
    mapLocal: (syncedRows) =>
      syncedRows.map((row) => ({
        id: row.id,
        name: row.name?.trim() || "Untitled",
      })),
    fetchRest: async () => {
      const body = await client.requestJson<{ organizations: Organization[] }>(
        "/api/v1/organizations",
      );
      return (body.organizations ?? []).map((organization) => ({
        id: organization.id,
        name: organization.name?.trim() || "Untitled",
      }));
    },
  });

  return { rows, loading };
}

/** id → display name for finance transaction merchant chips. */
export function useOrganizationNameMap(): Record<string, string> {
  const { rows } = useOrganizations();
  return useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) map[row.id] = row.name;
    return map;
  }, [rows]);
}
