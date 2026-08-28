import { useEffect, useMemo } from "react";

import {
  getProjectRouteParamFromPathname,
  getProjectRouteScopeFromPathname,
  isFinanceSectionPath,
  isInboxPanelPath,
  isProjectDocumentsSectionPath,
  isSettingsPath,
  parseNavigationTrailPath,
} from "@backsteros/ui/navigation";
import { shouldShowContentSidePanel } from "@backsteros/ui/shell";

import {
  projectNavFromLocationState,
  rememberProjectNavFrom,
  resolveProjectNavFromForPath,
  resolveSidebarActivePathname,
} from "../lib/project-type-cache";
import { useShellLocation } from "../lib/shell-route-keep-alive";
import { useDesktopWorkspaceProjects } from "../lib/workspace-data";

export function useShellSidePanel() {
  const location = useShellLocation();
  const { projects } = useDesktopWorkspaceProjects();

  const pathname = location.pathname;
  const search = location.searchStr;
  const navigationTrail = parseNavigationTrailPath(pathname);
  const panelHref = navigationTrail?.sourceHref ?? pathname;
  const panelUrl = useMemo(
    () => new URL(panelHref, "http://local.invalid"),
    [panelHref],
  );
  const panelPathname = panelUrl.pathname;
  const panelSearch =
    panelUrl.search ||
    (panelPathname === pathname ? search : "");
  const inInboxPanel =
    isInboxPanelPath(panelPathname, panelSearch) ||
    isInboxPanelPath(pathname, search);
  const settingsPage = isSettingsPath(pathname);

  const projectRouteParam = getProjectRouteParamFromPathname(panelPathname);
  const projectRouteScope = getProjectRouteScopeFromPathname(panelPathname);
  const activeProject = projectRouteParam
    ? (projects.find(
        (project) =>
          project.id === projectRouteParam ||
          project.key.toLowerCase() === projectRouteParam.toLowerCase(),
      ) ?? null)
    : null;

  const showSidePanel =
    !settingsPage &&
    (shouldShowContentSidePanel(panelPathname, panelSearch) ||
      shouldShowContentSidePanel(pathname, search)) &&
    !(
      activeProject?.type === "codebase" &&
      isProjectDocumentsSectionPath(panelPathname)
    );

  const projectNavFrom = resolveProjectNavFromForPath({
    locationState: location.state,
    projectId: activeProject?.id,
    projectKey: activeProject?.key,
    routeParam: projectRouteParam,
  });

  useEffect(() => {
    if (!activeProject) return;
    const from = projectNavFromLocationState(location.state);
    if (from) {
      rememberProjectNavFrom(activeProject.id, activeProject.key, from);
    }
  }, [activeProject, location.state]);

  const sidebarActivePathname = resolveSidebarActivePathname(
    pathname,
    projectNavFrom,
  );
  const financeSection = isFinanceSectionPath(panelPathname);

  return {
    pathname,
    panelPathname,
    panelSearch,
    inInboxPanel,
    settingsPage,
    projectRouteParam,
    projectRouteScope,
    activeProject,
    showSidePanel,
    sidebarActivePathname,
    financeSection,
  };
}
