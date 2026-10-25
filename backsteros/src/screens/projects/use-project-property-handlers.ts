import { useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import {
  buildProjectKeyRenameRedirectPath,
  getProjectEmailCategoryDefaultIcon,
  getProjectProviderDefaultIcon,
  type ProjectDetailViewProps,
} from "@backsteros/ui";
import type { DesktopWorkspaceData } from "../../lib/workspace/workspace-data-types";
import type { ProjectOverlay, WorkspaceProject } from "./project-overlay";

type ProjectPropertyHandlers = Required<
  Pick<
    ProjectDetailViewProps,
    | "onSaveName"
    | "onSaveKey"
    | "onSaveSummary"
    | "onSaveDescription"
    | "onIconChange"
    | "onStatusChange"
    | "onPriorityChange"
    | "onProviderChange"
    | "onCategoryChange"
    | "onHealthCheckChange"
    | "onHourlyRateChange"
    | "onBudgetsChange"
    | "onAreaChange"
    | "onAreaIdChange"
    | "onOrganizationChange"
    | "onCreateOrganizationFromQuery"
    | "onStartDateChange"
    | "onDueDateChange"
  >
>;

type ProjectSaveResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export type UseProjectPropertyHandlersOptions = {
  /** Routed project; handlers no-op while it is unresolved. */
  project: { id: string; key: string } | null;
  projects: readonly { id: string; key: string }[];
  pathname: string;
  navigate: (to: string, options?: { replace?: boolean }) => void;
  patchProject: DesktopWorkspaceData["patchProject"];
  createOrganization: DesktopWorkspaceData["createOrganization"];
  setProjectOverlay: Dispatch<SetStateAction<ProjectOverlay>>;
};

/**
 * Stable property handlers for the project detail / domain workbench views:
 * optimistic overlay patch followed by the workspace write.
 */
export function useProjectPropertyHandlers(
  options: UseProjectPropertyHandlersOptions,
): ProjectPropertyHandlers & {
  onSaveName: (name: string) => Promise<ProjectSaveResult>;
  onSaveKey: (key: string) => Promise<ProjectSaveResult<{ key: string }>>;
} {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  return useMemo(() => {
    const current = () => {
      const opts = optionsRef.current;
      return opts.project ? { ...opts, project: opts.project } : null;
    };
    const patchSelected = (patch: Partial<WorkspaceProject>) => {
      const ctx = current();
      if (!ctx) return;
      const projectId = ctx.project.id;
      ctx.setProjectOverlay((overlay) => ({
        ...overlay,
        [projectId]: { ...overlay[projectId], ...patch },
      }));
    };
    const write = (values: Record<string, unknown>) => {
      const ctx = current();
      if (!ctx) return;
      void ctx.patchProject(ctx.project.id, values);
    };
    const patchAndWrite = (
      values: Partial<WorkspaceProject> & Record<string, unknown>,
    ) => {
      patchSelected(values);
      write(values);
    };

    return {
      onSaveName: async (name: string): Promise<ProjectSaveResult> => {
        const ctx = current();
        if (!ctx) return { ok: false, error: "Project not found." };
        patchSelected({ name });
        try {
          await ctx.patchProject(ctx.project.id, { name });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not save project name.",
          };
        }
      },
      onSaveKey: async (
        key: string,
      ): Promise<ProjectSaveResult<{ key: string }>> => {
        const ctx = current();
        if (!ctx) return { ok: false, error: "Project not found." };
        const { project } = ctx;
        const conflict = ctx.projects.some(
          (entry) =>
            entry.id !== project.id &&
            entry.key.toLowerCase() === key.toLowerCase(),
        );
        if (conflict) {
          return { ok: false, error: "Project key already exists." };
        }
        const previousKey = project.key;
        patchSelected({ key });
        try {
          await ctx.patchProject(project.id, { key });
        } catch (error) {
          patchSelected({ key: previousKey });
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Could not update project ID.",
          };
        }
        const { pathname, navigate } = optionsRef.current;
        const nextPath = buildProjectKeyRenameRedirectPath(
          pathname,
          previousKey,
          key,
        );
        if (nextPath !== pathname) {
          navigate(nextPath, { replace: true });
        }
        return { ok: true, key };
      },
      onSaveSummary: (summary) => write({ summary }),
      onSaveDescription: (description) => write({ description }),
      onIconChange: (icon) => patchAndWrite({ icon }),
      onStatusChange: (status) => patchAndWrite({ status }),
      onPriorityChange: (priority) => patchAndWrite({ priority }),
      onProviderChange: (provider) => {
        const patch: { provider: string | null; icon?: string } = { provider };
        if (provider === "transip") {
          patch.icon = getProjectProviderDefaultIcon("transip");
        }
        patchAndWrite(patch);
      },
      onCategoryChange: (category) => {
        const patch: { category: string | null; icon?: string } = {
          category,
        };
        if (category) {
          patch.icon = getProjectEmailCategoryDefaultIcon(category);
        }
        patchAndWrite(patch);
      },
      onHealthCheckChange: (next) => patchAndWrite(next),
      onHourlyRateChange: (hourlyRateCents) =>
        patchAndWrite({ hourlyRateCents }),
      onBudgetsChange: (budgets) => patchAndWrite({ budgets }),
      onAreaChange: (area) => patchAndWrite({ area, areaId: null }),
      onAreaIdChange: (areaId) => patchAndWrite({ areaId }),
      onOrganizationChange: (organizationId) =>
        patchAndWrite({ organizationId }),
      onCreateOrganizationFromQuery: (query) => {
        const ctx = current();
        if (!ctx) return;
        const projectId = ctx.project.id;
        void ctx.createOrganization({ name: query }).then((created) => {
          optionsRef.current.setProjectOverlay((overlay) => ({
            ...overlay,
            [projectId]: {
              ...overlay[projectId],
              organizationId: created.id,
            },
          }));
          void optionsRef.current.patchProject(projectId, {
            organizationId: created.id,
          });
        });
      },
      onStartDateChange: (startDate) => {
        patchSelected({ startDate: startDate ? startDate.getTime() : null });
        write({ startDate: startDate ? startDate.toISOString() : null });
      },
      onDueDateChange: (dueDate) => {
        patchSelected({ dueDate: dueDate ? dueDate.getTime() : null });
        write({ dueDate: dueDate ? dueDate.toISOString() : null });
      },
    };
  }, []);
}
