import { useEffect } from "react";

import { ensureProjectVault } from "./ensure-project-vault";
import { useMobileApiClient } from "./use-mobile-api-client";
import { useMobilePowerSync } from "./powersync-context";

/**
 * On project open: ensure vault folder + `.cursor` skills exist.
 * When the server assigns a default working directory, patch PowerSync metadata.
 */
export function useEnsureProjectVault(projectId: string | null | undefined) {
  const client = useMobileApiClient();
  const powerSync = useMobilePowerSync();
  const patchProject = powerSync.patchProject;

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
          await patchProject(id, {
            localWorkingDirectory: ensured.localWorkingDirectory,
          });
        } catch {
          // Best-effort — folder still exists on the core machine.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, patchProject, projectId]);
}
