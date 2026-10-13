import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { findProjectByPath } from "@t3tools/client-runtime/state/projects";
import type { EnvironmentId, ScopedProjectRef } from "@t3tools/contracts";
import { useCallback, useRef } from "react";

import { toastManager } from "~/components/ui/toast";
import { inferProjectTitleFromPath } from "~/lib/projectPaths";
import { newProjectId } from "~/lib/utils";
import { resolveDefaultProviderModelSelection } from "~/providerInstances";
import { useProjects, waitForProject } from "~/state/entities";
import { usePrimaryEnvironment } from "~/state/environments";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Ensures a T3 project exists for a BacksterOS local working directory,
 * reusing a matching checkout when present and creating one otherwise.
 */
export function useEnsureBacksterosT3Project(): (input: {
  readonly workspaceRoot: string;
  readonly title: string;
}) => Promise<ScopedProjectRef | null> {
  const primaryEnvironment = usePrimaryEnvironment();
  const projects = useProjects();
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });

  return useCallback(
    async (input: {
      readonly workspaceRoot: string;
      readonly title: string;
    }): Promise<ScopedProjectRef | null> => {
      const existing = findProjectByPath(projectsRef.current, input.workspaceRoot);
      if (existing) {
        return scopeProjectRef(existing.environmentId, existing.id);
      }

      if (
        primaryEnvironment?.connection.phase !== "connected" ||
        primaryEnvironment.serverConfig === null
      ) {
        toastManager.add({
          type: "error",
          title: "Environment unavailable",
          description: "Connect a local environment before opening BacksterOS tasks.",
        });
        return null;
      }

      const environmentId = primaryEnvironment.environmentId as EnvironmentId;
      const projectId = newProjectId();
      const title =
        input.title.trim().length > 0
          ? input.title.trim()
          : inferProjectTitleFromPath(input.workspaceRoot);
      const result = await createProject({
        environmentId,
        input: {
          projectId,
          title,
          workspaceRoot: input.workspaceRoot,
          createWorkspaceRootIfMissing: false,
          defaultModelSelection: resolveDefaultProviderModelSelection(
            primaryEnvironment.serverConfig.providers ?? [],
            null,
          ),
        },
      });

      if (result._tag === "Failure") {
        // Another client may have created the same checkout while we were racing.
        const raced = findProjectByPath(projectsRef.current, input.workspaceRoot);
        if (raced) {
          return scopeProjectRef(raced.environmentId, raced.id);
        }
        if (!isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add({
            type: "error",
            title: "Failed to add project",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        }
        return null;
      }

      const projectRef = scopeProjectRef(environmentId, projectId);
      try {
        await waitForProject(projectRef);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to add project",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
        return null;
      }

      toastManager.add({
        type: "success",
        title: "Project added",
        description: `${title} is ready for chat.`,
      });
      return projectRef;
    },
    [createProject, primaryEnvironment],
  );
}
