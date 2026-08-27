import { useNavigation } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";

import {
  confirmEntitySoftDelete,
  type EntitySoftDeleteKind,
} from "./confirm-entity-soft-delete";
import {
  softDeleteEntityViaPowerSyncOrApi,
  type MobileSoftDeletePowerSync,
} from "./entity-mutations";
import { useMobilePowerSync } from "./powersync-context";
import { useMobileApiClient } from "./use-mobile-api-client";

export function useEntitySoftDeletePowerSync(): MobileSoftDeletePowerSync {
  const powerSync = useMobilePowerSync();
  return useMemo(() => ({ ...powerSync }), [powerSync]);
}

export function useEntitySoftDelete() {
  const client = useMobileApiClient();
  const powerSync = useEntitySoftDeletePowerSync();
  const router = useRouter();
  const navigation = useNavigation();

  const softDelete = useCallback(
    async (table: EntitySoftDeleteKind, id: string) => {
      await softDeleteEntityViaPowerSyncOrApi(client, powerSync, table, id);
    },
    [client, powerSync],
  );

  const navigateBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    router.back();
  }, [navigation, router]);

  const confirmAndDelete = useCallback(
    (
      kind: EntitySoftDeleteKind,
      id: string | undefined,
      displayName: string,
      opts?: { onDeleted?: () => void },
    ) => {
      if (!id) return;
      confirmEntitySoftDelete(kind, displayName, async () => {
        await softDelete(kind, id);
        if (opts?.onDeleted) {
          opts.onDeleted();
          return;
        }
        navigateBack();
      });
    },
    [navigateBack, softDelete],
  );

  return { softDelete, confirmAndDelete, navigateBack };
}
