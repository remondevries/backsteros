import { useCallback, useMemo } from "react";

import {
  createAreaViaPowerSyncOrApi,
  softDeleteAreaViaPowerSyncOrApi,
  updateAreaViaPowerSyncOrApi,
  type MobileAreaPowerSync,
} from "./area-mutations";
import { useMobilePowerSync } from "./powersync-context";
import type { ProjectArea } from "./project-areas";
import { useMobileApiClient } from "./use-mobile-api-client";

export function useAreaPowerSync(): MobileAreaPowerSync {
  const powerSync = useMobilePowerSync();
  return useMemo(
    () => ({ ...powerSync, database: powerSync.database }),
    [powerSync],
  );
}

export function useAreaActions(reload: () => Promise<void>) {
  const client = useMobileApiClient();
  const areaPowerSync = useAreaPowerSync();

  const createArea = useCallback(
    async (parent: ProjectArea, name: string) => {
      const result = await createAreaViaPowerSyncOrApi(client, areaPowerSync, {
        name,
        parent,
      });
      await reload();
      return result;
    },
    [areaPowerSync, client, reload],
  );

  const renameArea = useCallback(
    async (areaId: string, name: string) => {
      await updateAreaViaPowerSyncOrApi(client, areaPowerSync, areaId, {
        name,
      });
      await reload();
    },
    [areaPowerSync, client, reload],
  );

  const deleteArea = useCallback(
    async (areaId: string) => {
      await softDeleteAreaViaPowerSyncOrApi(client, areaPowerSync, areaId);
      await reload();
    },
    [areaPowerSync, client, reload],
  );

  return { createArea, renameArea, deleteArea };
}
