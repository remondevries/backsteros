import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { resolveLogicalProjectKeyForBacksterosWorkingDirectory } from "~/backsteros/resolveT3Project";
import type { BacksterosCodebaseProject } from "~/backsteros/types";
import { useEnsureBacksterosT3Project } from "~/backsteros/useEnsureBacksterosT3Project";
import { selectProjectGroupingSettings } from "~/logicalProject";
import { useAllEnvironmentProjectSnapshotsReady, useProjects } from "~/state/entities";
import { useClientSettings } from "../../hooks/useSettings";
import { ProjectSettingsPanel } from "../settings/ProjectSettingsPanel";
import { SettingsScopeProvider } from "../settings/SettingsScopeContext";
import type { SettingsScopeSearch } from "../settings/settingsScope";
import { useSettingsProjectGroups } from "../settings/useSettingsProjectGroups";

/**
 * Embeds the T3 project settings panel as a tab on a BacksterOS project page.
 * Scope is local to this tab (not the global `/settings` URL).
 */
export function BacksterosProjectSettingsTab(props: {
  readonly project: BacksterosCodebaseProject;
  /** Logical T3 project key from the route when known (e.g. opened from a thread). */
  readonly t3ProjectKey?: string | null;
}) {
  const { project, t3ProjectKey = null } = props;
  const projects = useProjects();
  const groups = useSettingsProjectGroups();
  const projectsReady = useAllEnvironmentProjectSnapshotsReady();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const ensureT3Project = useEnsureBacksterosT3Project();
  const [ensureState, setEnsureState] = useState<"idle" | "working" | "failed">("idle");
  const ensureAttemptedForCwdRef = useRef<string | null>(null);

  const projectKey = useMemo(
    () =>
      resolveLogicalProjectKeyForBacksterosWorkingDirectory({
        workspaceRoot: project.localWorkingDirectory,
        explicitProjectKey: t3ProjectKey,
        groups,
        projects,
        settings: projectGroupingSettings,
      }),
    [groups, project.localWorkingDirectory, projectGroupingSettings, projects, t3ProjectKey],
  );

  const workspaceRoot = project.localWorkingDirectory?.trim() || null;

  useEffect(() => {
    if (projectKey || !projectsReady || !workspaceRoot) return;
    if (ensureAttemptedForCwdRef.current === workspaceRoot) return;
    ensureAttemptedForCwdRef.current = workspaceRoot;
    setEnsureState("working");
    void ensureT3Project({
      workspaceRoot,
      title: project.name,
    }).then((ref) => {
      setEnsureState(ref ? "idle" : "failed");
    });
  }, [ensureT3Project, project.name, projectKey, projectsReady, workspaceRoot]);

  const [search, setSearch] = useState<SettingsScopeSearch>(() =>
    projectKey ? { project: projectKey } : {},
  );

  const scopedSearch = useMemo((): SettingsScopeSearch => {
    if (!projectKey) return search;
    if (search.project === projectKey) return search;
    return { ...search, project: projectKey };
  }, [projectKey, search]);

  const handleScopeChange = useCallback((next: SettingsScopeSearch) => {
    setSearch(next);
  }, []);

  if (!workspaceRoot) {
    return (
      <div className="bos-codebase-workbench__empty">
        <p>
          This BacksterOS project has no local working directory, so T3 settings are unavailable.
        </p>
      </div>
    );
  }

  if (!projectKey) {
    if (!projectsReady || ensureState === "working") {
      return (
        <div className="bos-codebase-workbench__empty">
          <p>Loading project settings…</p>
        </div>
      );
    }
    return (
      <div className="bos-codebase-workbench__empty">
        <p>Could not open T3 project settings for this working directory.</p>
        <p className="text-muted-foreground">{workspaceRoot}</p>
      </div>
    );
  }

  return (
    <SettingsScopeProvider search={scopedSearch} onChange={handleScopeChange}>
      <div className="bos-codebase-workbench__settings-scroll min-h-0 flex-1 overflow-y-auto">
        <ProjectSettingsPanel
          projectKey={scopedSearch.project ?? projectKey}
          environmentId={null}
          checkoutKey={scopedSearch.checkout ?? null}
        />
      </div>
    </SettingsScopeProvider>
  );
}
