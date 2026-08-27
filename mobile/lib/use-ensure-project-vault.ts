import { useEffect } from "react";

import { ensureProjectVault } from "./ensure-project-vault";
import { patchEntityViaPowerSyncOrApi } from "./entity-mutations";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useMobilePowerSync } from "./powersync-context";

/**
 * On project open: ensure vault folder + `.cursor` skills exist.
 * When the server assigns a default working directory, patch PowerSync metadata.
 */
export function useEnsureProjectVault(projectId: string | null | undefined) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();

  useEffect(() => {
    const id = projectId?.trim();
    if (!id) return;

    let cancelled = false;
    void (async () => {
      const ensured = await ensureProjectVault(client, id);
      if (cancelled || !ensured?.configured) return;
      if (
        ensured.assignedWorkingDirectory &&
        ensured.localWorkingDirectory?.trim()
      ) {
        try {
          await patchEntityViaPowerSyncOrApi(
            client,
            powerSync,
            "projects",
            id,
            { localWorkingDirectory: ensured.localWorkingDirectory },
            { local_working_directory: ensured.localWorkingDirectory },
          );
        } catch {
          // Best-effort — folder still exists on the core machine.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, powerSync, projectId]);
}
