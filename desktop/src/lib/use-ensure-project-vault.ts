import { useEffect } from "react";

import { useDesktopApi } from "./api-context";
import { ensureProjectVault } from "./ensure-project-vault";
import { useDesktopWorkspaceData } from "./workspace-data";

/**
 * On project open: ensure vault folder + `.cursor` skills exist, and refresh
 * local working directory when the server assigns the vault project root.
 */
export function useEnsureProjectVault(projectId: string | null | undefined) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const patchProject = workspace.patchProject;

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
        await patchProject(id, {
          localWorkingDirectory: ensured.localWorkingDirectory,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client, patchProject, projectId]);
}
