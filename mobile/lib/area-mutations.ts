import type { BacksterosApiClient } from "@backsteros/api-client";
import type { Area, AreaInput, Project } from "@backsteros/contracts";
import type { PowerSyncDatabase } from "@powersync/react-native";

import {
  patchEntityViaPowerSyncOrApi,
  softDeleteEntityViaPowerSyncOrApi,
  toSnakeFields,
  type MobileSoftDeletePowerSync,
} from "./entity-mutations";
import type { ProjectArea } from "./project-areas";
import { randomUuidCompact } from "./random-uuid";

export type MobileAreaPowerSync = MobileSoftDeletePowerSync & {
  database?: PowerSyncDatabase | null;
};

function areaApiPatchToSqlite(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const sqliteValues: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (key === "sortOrder") sqliteValues.sort_order = value;
    else sqliteValues[key] = value;
  }
  return sqliteValues;
}

async function projectIdsForArea(
  database: PowerSyncDatabase | null | undefined,
  areaId: string,
): Promise<string[]> {
  if (!database) return [];
  try {
    const rows = await database.getAll<{ id: string }>(
      `SELECT id FROM projects WHERE deleted_at IS NULL AND area_id = ?`,
      [areaId],
    );
    return rows.map((row) => row.id);
  } catch {
    return [];
  }
}

async function clearAreaFromProjects(
  client: BacksterosApiClient,
  powerSync: MobileAreaPowerSync,
  areaId: string,
): Promise<void> {
  let projectIds = await projectIdsForArea(powerSync.database, areaId);
  if (projectIds.length === 0 && !powerSync.ready) {
    const body = await client.requestJson<{ projects: Project[] }>(
      "/api/v1/projects",
    );
    projectIds = (body.projects ?? [])
      .filter((project) => project.areaId === areaId)
      .map((project) => project.id);
  }
  await Promise.all(
    projectIds.map((projectId) =>
      patchEntityViaPowerSyncOrApi(
        client,
        powerSync,
        "projects",
        projectId,
        { areaId: null },
        { area_id: null },
      ),
    ),
  );
}

export async function createAreaViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileAreaPowerSync,
  input: {
    name: string;
    parent: ProjectArea;
    icon?: string | null;
    color?: string | null;
    sortOrder?: number;
  },
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new Error("Area name is required.");

  const body = {
    name,
    parent: input.parent,
    icon: input.icon ?? null,
    color: input.color ?? null,
    sortOrder: input.sortOrder ?? Date.now(),
  };

  if (powerSync.ready && powerSync.createMetadata) {
    const id = randomUuidCompact();
    await powerSync.createMetadata("areas", toSnakeFields(body), id);
    return { id };
  }

  const area = await client.requestJson<Area>("/api/v1/areas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { id: area.id };
}

export async function updateAreaViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileAreaPowerSync,
  id: string,
  input: Partial<AreaInput>,
): Promise<void> {
  await patchEntityViaPowerSyncOrApi(
    client,
    powerSync,
    "areas",
    id,
    input,
    areaApiPatchToSqlite(input),
  );
}

/** Clears `area_id` on affected projects, then soft-deletes the area (desktop parity). */
export async function softDeleteAreaViaPowerSyncOrApi(
  client: BacksterosApiClient,
  powerSync: MobileAreaPowerSync,
  areaId: string,
): Promise<void> {
  await clearAreaFromProjects(client, powerSync, areaId);
  await softDeleteEntityViaPowerSyncOrApi(client, powerSync, "areas", areaId);
}
