import { useMemo } from "react";
import type { ChatProjectOption } from "@backsteros/ui";

import { useDesktopWorkspaceProjects } from "../lib/workspace-data";

/** Workspace projects for the shell chat `/` Projects group. */
export function useShellChatProjects(): readonly ChatProjectOption[] {
  const { projects } = useDesktopWorkspaceProjects();
  return useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        icon: project.icon ?? null,
        type: project.type ?? null,
      })),
    [projects],
  );
}
