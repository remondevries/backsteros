import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  AreasOverviewView,
  ProjectsListSkeleton,
  RegisterPageTitle,
  projectAreaReorderPatches,
  type NestedAreaRef,
  type ProjectArea,
  type ProjectOverviewRowProject,
} from "@backsteros/ui";

import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { buildWorkingProjectIdSet } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { type ProjectLocationState } from "../lib/project-type-cache";

type WorkspaceProject = ProjectOverviewRowProject & {
  organizationId?: string | null;
  type?: string;
};

export function AreasPage() {
  const navigate = useNavigate();
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();
  const [projectOverlay, setProjectOverlay] = useState<
    Record<string, Partial<WorkspaceProject>>
  >({});

  const projects = useMemo(
    () =>
      workspace.projects.map((project) => ({
        ...project,
        ...projectOverlay[project.id],
      })),
    [projectOverlay, workspace.projects],
  );

  const workingProjectIds = useMemo(
    () =>
      buildWorkingProjectIdSet(
        workspace.allTasks,
        agentStatus?.workingTaskIds ?? new Set(),
      ),
    [agentStatus?.workingTaskIds, workspace.allTasks],
  );

  const areas = useMemo<NestedAreaRef[]>(
    () =>
      workspace.areas.map((area) => ({
        id: area.id,
        name: area.name,
        parent:
          area.parent === "personal" ||
          area.parent === "business" ||
          area.parent === "clients"
            ? area.parent
            : null,
        sortOrder: area.sortOrder,
      })),
    [workspace.areas],
  );

  if (!workspace.ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
        <RegisterPageTitle title="Areas" />
        <ProjectsListSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <RegisterPageTitle title="Areas" />
      <AreasOverviewView
        projects={projects}
        workingProjectIds={workingProjectIds}
        areas={areas}
        onSelectProject={(key) => {
          const match = projects.find(
            (entry) => entry.key.toLowerCase() === key.toLowerCase(),
          );
          const state: ProjectLocationState = {
            from: "areas",
            ...(match?.type ? { projectType: match.type } : {}),
          };
          navigate(`/projects/${key}`, { state });
        }}
        onStatusChange={(projectId, status) => {
          setProjectOverlay((current) => ({
            ...current,
            [projectId]: { ...current[projectId], status },
          }));
          void workspace.patchProject(projectId, { status });
        }}
        onPriorityChange={(projectId, priority) => {
          setProjectOverlay((current) => ({
            ...current,
            [projectId]: { ...current[projectId], priority },
          }));
          void workspace.patchProject(projectId, { priority });
        }}
        onStartDateChange={(projectId, startDate) => {
          void workspace.patchProject(projectId, {
            startDate: startDate ? startDate.toISOString() : null,
          });
        }}
        onDueDateChange={(projectId, dueDate) => {
          void workspace.patchProject(projectId, {
            dueDate: dueDate ? dueDate.toISOString() : null,
          });
        }}
        onAreaChange={(projectId, area) => {
          setProjectOverlay((current) => ({
            ...current,
            [projectId]: {
              ...current[projectId],
              area,
              areaId: area ? current[projectId]?.areaId : null,
            },
          }));
          void workspace.patchProject(projectId, {
            area,
            ...(area ? {} : { areaId: null }),
          });
        }}
        onCreateArea={async ({ parent, name }) => {
          return workspace.createArea({ name, parent });
        }}
        onDeleteArea={async ({ areaId, parent }) => {
          const affected = projects.filter(
            (project) => project.areaId === areaId,
          );
          for (const project of affected) {
            setProjectOverlay((current) => ({
              ...current,
              [project.id]: {
                ...current[project.id],
                area: parent,
                areaId: null,
              },
            }));
          }
          await workspace.softDeleteArea(areaId);
        }}
        onReorder={(request) => {
          const patches = projectAreaReorderPatches(projects, request);
          for (const patch of patches) {
            setProjectOverlay((current) => ({
              ...current,
              [patch.id]: {
                ...current[patch.id],
                area: patch.area as ProjectArea | null,
                sortOrder: patch.sortOrder,
              },
            }));
            void workspace.patchProject(patch.id, {
              area: patch.area,
              sortOrder: patch.sortOrder,
            });
          }
        }}
      />
    </div>
  );
}
