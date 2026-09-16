import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  CONTACT_DETAIL_COLLAPSE_DURATION_MS,
  CONTACT_DETAIL_CONTENT_FADE_MS,
  CONTACT_DETAIL_EXPAND_FADE_MS,
  DomainDetailView,
  DOMAIN_EXPANDED_WORKSPACE_TAB_IDS,
  DOMAIN_EXPANDED_WORKSPACE_TABS,
  EntityDetailOverlay,
  FinanceSyncIcon,
  ProjectsListSkeleton,
  ProjectsOverviewView,
  ProjectTasksView,
  RegisterPageTitle,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  TASKS_LIST_BOARD_STORAGE_KEY,
  buildAssigneeDropdownOptions,
  buildTransipDomainProjectIcon,
  getCatalogListTypeHref,
  getProjectSectionHref,
  getScopedProjectTaskHref,
  parseListBoardViewFromLocation,
  parseProjectTypeFilterFromLocation,
  parseSectionTabIndex,
  persistListBoardView,
  primeTabTitle,
  projectReorderPatches,
  projectTypeForCatalogCreate,
  resolveDomainCardSections,
  shouldHandleGlobalShortcut,
  taskReorderPatches,
  type DomainSectionId,
  type ListBoardView,
  type OrganizationRef,
  type ProjectOverviewRowProject,
  type ProjectReorderRequest,
  type ProjectStatus,
  type ProjectArea,
  type ProjectTypeFilter,
  type DomainRegistrarContact,
  type DomainOverlayLayout,
} from "@backsteros/ui";

import { DesktopCollapsibleRightSidePanelLayout } from "../components/desktop-journal-day-layout";
import { DevelopmentDeploymentsSidePanel } from "../components/development-deployments-side-panel";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { useDesktopApi } from "../lib/api-context";
import { isAgentPanelToggleShortcut } from "../lib/agent/agent-panel-toggle-shortcut";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDomainProjectApi } from "../lib/use-domain-project-api";
import { useRoutePathActive } from "../lib/shell-route-keep-alive";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { buildWorkingProjectIdSet } from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { type ProjectLocationState } from "../lib/project-type-cache";
import { navigateToHref } from "../router/navigate-href";

const CATALOG_SIDE_PANEL_WIDTH_KEY = "catalog-side-panel-width";

type TransipSyncResult = {
  fetched: number;
  created: number;
  skipped: number;
  healed?: number;
};

type CloudflareMatchResult = {
  fetched: number;
  matched: number;
  updated: number;
  unchanged: number;
  unmatchedProjects: number;
  unmatchedZones: number;
};

function buildCatalogListHref(
  type: ProjectTypeFilter,
  view: ListBoardView,
): string {
  return getCatalogListTypeHref(type, view);
}

function mapWorkspaceNestedAreas(
  areas: {
    id: string;
    name: string;
    parent: string | null;
    sortOrder?: number;
  }[],
) {
  return areas.map((area) => ({
    id: area.id,
    name: area.name,
    parent:
      area.parent === "personal" ||
      area.parent === "business" ||
      area.parent === "clients"
        ? (area.parent as ProjectArea)
        : null,
    sortOrder: area.sortOrder,
  }));
}

export function CatalogPage() {
  const active = useRoutePathActive("/catalog");
  if (!active) return null;
  return <CatalogPageBody />;
}

function CatalogPageBody() {
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const location = useLocation();
  const workspace = useDesktopWorkspaceData();
  const { client } = useDesktopApi();
  const agentStatus = useDesktopAgentStatusOptional();
  const {
    knownDomainTags,
    loadDomainRegistrarDetail,
    updateDomainTags,
    updateDomainContacts,
    loadCloudflareDnsRecords,
    purgeCloudflareCache,
  } = useDomainProjectApi();
  const [domainsSyncing, setDomainsSyncing] = useState(false);

  // Domains tab: list + shared entity detail rail (contacts/orgs animations).
  const [selectedDomainKey, setSelectedDomainKey] = useState<string | null>(
    null,
  );
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailCollapseAnimating, setDetailCollapseAnimating] = useState(false);
  /** More… / Expand → page layout with tasks workspace (contacts/orgs pattern). */
  const [domainOverlayLayout, setDomainOverlayLayout] =
    useState<DomainOverlayLayout>("panel");
  const [domainCardSection, setDomainCardSection] =
    useState<DomainSectionId>("details");
  const [contentFaded, setContentFaded] = useState(false);
  const [listFaded, setListFaded] = useState(false);
  const [workspaceFaded, setWorkspaceFaded] = useState(false);
  const [panelProjectId, setPanelProjectId] = useState<string | null>(null);
  const contentFadeTokenRef = useRef(0);
  const expandAnimTokenRef = useRef(0);
  const expandAnimTimerRef = useRef<number | null>(null);
  const pendingListFadeInRef = useRef(false);
  const pendingWorkspaceFadeInRef = useRef(false);
  const detailCollapseAnimTimerRef = useRef<number | null>(null);
  const detailCollapseRafRef = useRef<number | null>(null);
  const detailCollapsedRef = useRef(detailCollapsed);
  detailCollapsedRef.current = detailCollapsed;

  const listView = useMemo(
    () =>
      parseListBoardViewFromLocation(
        location.pathname,
        location.searchStr,
        PROJECTS_LIST_BOARD_STORAGE_KEY,
      ),
    [location.pathname, location.searchStr],
  );

  const typeFilter =
    parseProjectTypeFilterFromLocation(
      location.pathname,
      location.searchStr,
    ) ?? "codebase";

  const projects = workspace.projects;
  const showDomainsSync = typeFilter === "domeinname";
  const domainDatesBackfillRef = useRef(false);

  useEffect(() => {
    if (!showDomainsSync || !workspace.ready || domainDatesBackfillRef.current) {
      return;
    }
    domainDatesBackfillRef.current = true;
    void (async () => {
      try {
        const remote = await workspace.reloadProjects();
        const localById = new Map(
          workspace.projects.map((project) => [project.id, project]),
        );
        for (const project of remote) {
          if (project.type !== "domeinname") continue;
          if (!project.startDate && !project.dueDate) continue;
          const local = localById.get(project.id);
          const localStartMissing = local?.startDate == null;
          const localDueMissing = local?.dueDate == null;
          if (!localStartMissing && !localDueMissing) continue;
          void workspace.patchProject(project.id, {
            ...(localStartMissing && project.startDate
              ? { startDate: project.startDate }
              : {}),
            ...(localDueMissing && project.dueDate
              ? { dueDate: project.dueDate }
              : {}),
          });
        }
      } catch {
        // PowerSync / next sync will catch up.
      }
    })();
  }, [showDomainsSync, workspace]);

  useEffect(() => {
    if (showDomainsSync) return;
    setSelectedDomainKey(null);
    setDetailCollapsed(false);
    setDomainOverlayLayout("panel");
    setDomainCardSection("details");
    setPanelProjectId(null);
    setContentFaded(false);
    setListFaded(false);
    setWorkspaceFaded(false);
  }, [showDomainsSync]);

  const selectedDomainProject = useMemo(() => {
    if (!selectedDomainKey) return null;
    return (
      projects.find(
        (entry) =>
          entry.key.toLowerCase() === selectedDomainKey.toLowerCase(),
      ) ?? null
    );
  }, [projects, selectedDomainKey]);

  const panelProject = useMemo(() => {
    if (!panelProjectId) return selectedDomainProject;
    return (
      projects.find((entry) => entry.id === panelProjectId) ??
      selectedDomainProject
    );
  }, [panelProjectId, projects, selectedDomainProject]);

  const workingProjectIds = useMemo(
    () =>
      buildWorkingProjectIdSet(
        workspace.allTasks,
        agentStatus?.workingTaskIds ?? new Set(),
      ),
    [agentStatus?.workingTaskIds, workspace.allTasks],
  );

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );

  const domainTasks = useMemo(() => {
    if (!panelProject) return [];
    return workspace.allTasks.filter(
      (task) =>
        !task.habitId &&
        (task.projectId === panelProject.id ||
          (task.projectKey &&
            task.projectKey.toLowerCase() ===
              panelProject.key.toLowerCase())),
    );
  }, [panelProject, workspace.allTasks]);

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(workspace.contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, workspace.contacts],
  );

  const beginDetailCollapseAnimation = useCallback((apply: () => void) => {
    setDetailCollapseAnimating(true);
    if (detailCollapseAnimTimerRef.current != null) {
      window.clearTimeout(detailCollapseAnimTimerRef.current);
      detailCollapseAnimTimerRef.current = null;
    }
    if (detailCollapseRafRef.current != null) {
      window.cancelAnimationFrame(detailCollapseRafRef.current);
      detailCollapseRafRef.current = null;
    }
    detailCollapseRafRef.current = window.requestAnimationFrame(() => {
      detailCollapseRafRef.current = window.requestAnimationFrame(() => {
        detailCollapseRafRef.current = null;
        apply();
        detailCollapseAnimTimerRef.current = window.setTimeout(() => {
          detailCollapseAnimTimerRef.current = null;
          setDetailCollapseAnimating(false);
        }, CONTACT_DETAIL_COLLAPSE_DURATION_MS);
      });
    });
  }, []);

  const hideDomainDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
  }, [beginDetailCollapseAnimation]);

  const showDomainDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(false);
    });
  }, [beginDetailCollapseAnimation]);

  const detailCloseTimerRef = useRef<number | null>(null);

  /** Match contacts/orgs Escape: slide closed, then clear selection. */
  const closeDomainOverlay = useCallback(() => {
    if (detailCloseTimerRef.current != null) {
      window.clearTimeout(detailCloseTimerRef.current);
      detailCloseTimerRef.current = null;
    }

    const leave = () => {
      expandAnimTokenRef.current += 1;
      pendingListFadeInRef.current = false;
      pendingWorkspaceFadeInRef.current = false;
      if (expandAnimTimerRef.current != null) {
        window.clearTimeout(expandAnimTimerRef.current);
        expandAnimTimerRef.current = null;
      }
      setListFaded(false);
      setWorkspaceFaded(false);
      setContentFaded(false);
      setDetailCollapsed(false);
      setDomainOverlayLayout("panel");
      setDomainCardSection("details");
      setSelectedDomainKey(null);
      setPanelProjectId(null);
    };

    if (detailCollapsedRef.current) {
      leave();
      return;
    }

    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
    detailCloseTimerRef.current = window.setTimeout(() => {
      detailCloseTimerRef.current = null;
      leave();
    }, CONTACT_DETAIL_COLLAPSE_DURATION_MS);
  }, [beginDetailCollapseAnimation]);

  const expandDomainOverlay = useCallback(() => {
    if (domainOverlayLayout === "page") return;
    setDetailCollapsed(false);
    const token = ++expandAnimTokenRef.current;
    pendingListFadeInRef.current = false;
    pendingWorkspaceFadeInRef.current = true;
    setListFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setWorkspaceFaded(true);
      setDomainOverlayLayout("page");
    }, CONTACT_DETAIL_EXPAND_FADE_MS);
  }, [domainOverlayLayout]);

  const collapseDomainOverlay = useCallback(() => {
    if (domainOverlayLayout !== "page") return;
    setDetailCollapsed(false);
    const token = ++expandAnimTokenRef.current;
    pendingWorkspaceFadeInRef.current = false;
    pendingListFadeInRef.current = true;
    setWorkspaceFaded(true);
    if (expandAnimTimerRef.current != null) {
      window.clearTimeout(expandAnimTimerRef.current);
    }
    expandAnimTimerRef.current = window.setTimeout(() => {
      expandAnimTimerRef.current = null;
      if (expandAnimTokenRef.current !== token) return;
      setListFaded(true);
      setDomainOverlayLayout("panel");
    }, CONTACT_DETAIL_EXPAND_FADE_MS);
  }, [domainOverlayLayout]);

  useLayoutEffect(() => {
    if (domainOverlayLayout !== "page") return;
    if (!pendingWorkspaceFadeInRef.current) {
      setListFaded(true);
      return;
    }
    pendingWorkspaceFadeInRef.current = false;
    setWorkspaceFaded(true);
    setListFaded(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setWorkspaceFaded(false);
      });
    });
  }, [domainOverlayLayout]);

  useLayoutEffect(() => {
    if (domainOverlayLayout !== "panel") return;
    if (!pendingListFadeInRef.current) {
      if (!selectedDomainProject) setListFaded(false);
      return;
    }
    pendingListFadeInRef.current = false;
    setListFaded(true);
    setWorkspaceFaded(false);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setListFaded(false);
      });
    });
  }, [domainOverlayLayout, selectedDomainProject]);

  useEffect(() => {
    return () => {
      if (expandAnimTimerRef.current != null) {
        window.clearTimeout(expandAnimTimerRef.current);
      }
      if (detailCollapseAnimTimerRef.current != null) {
        window.clearTimeout(detailCollapseAnimTimerRef.current);
      }
      if (detailCollapseRafRef.current != null) {
        window.cancelAnimationFrame(detailCollapseRafRef.current);
      }
      if (detailCloseTimerRef.current != null) {
        window.clearTimeout(detailCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!showDomainsSync || !selectedDomainProject) return;

    const showCloudflare = Boolean(
      selectedDomainProject.cloudflareZoneId?.trim(),
    );
    const cardSections = resolveDomainCardSections({ showCloudflare });
    const panelTabValues: Array<DomainSectionId | "more"> = [
      ...cardSections.map((entry) => entry.id),
      "more",
    ];

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (domainOverlayLayout === "page") {
          collapseDomainOverlay();
        } else {
          closeDomainOverlay();
        }
        return;
      }

      if (
        !detailCollapsedRef.current &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const tabIndex = parseSectionTabIndex(event.key);
        if (tabIndex != null) {
          if (!shouldHandleGlobalShortcut(event)) return;

          if (domainOverlayLayout === "page") {
            const tab = DOMAIN_EXPANDED_WORKSPACE_TAB_IDS[tabIndex];
            if (!tab) return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            return;
          }

          const target = panelTabValues[tabIndex];
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          if (target === "more") {
            expandDomainOverlay();
            return;
          }
          setDomainCardSection(target);
          return;
        }
      }

      if (!isAgentPanelToggleShortcut(event)) return;
      if (!shouldHandleGlobalShortcut(event)) return;
      event.preventDefault();
      event.stopPropagation();
      beginDetailCollapseAnimation(() => {
        setDetailCollapsed((current) => !current);
      });
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    beginDetailCollapseAnimation,
    closeDomainOverlay,
    collapseDomainOverlay,
    domainOverlayLayout,
    expandDomainOverlay,
    loadCloudflareDnsRecords,
    purgeCloudflareCache,
    selectedDomainProject,
    showDomainsSync,
  ]);

  const syncCatalogDomains = useCallback(async () => {
    setDomainsSyncing(true);
    try {
      await client.requestJson<TransipSyncResult>(
        "/api/v1/transip/domains/sync",
        { method: "POST" },
      );
      // Match zone ids after import; ignore match errors so TransIP sync still counts.
      try {
        await client.requestJson<CloudflareMatchResult>(
          "/api/v1/cloudflare/zones/match",
          { method: "POST" },
        );
      } catch {
        // Token missing / API error — domains are still synced from TransIP.
      }
      // PowerSync can lag behind server heals; refresh REST + write dates into
      // local SQLite so the Dates column updates immediately.
      try {
        const remote = await workspace.reloadProjects();
        const localById = new Map(
          workspace.projects.map((project) => [project.id, project]),
        );
        for (const project of remote) {
          if (project.type !== "domeinname") continue;
          if (!project.startDate && !project.dueDate) continue;
          const local = localById.get(project.id);
          const localStartMissing = local?.startDate == null;
          const localDueMissing = local?.dueDate == null;
          if (!localStartMissing && !localDueMissing) continue;
          void workspace.patchProject(project.id, {
            ...(localStartMissing && project.startDate
              ? { startDate: project.startDate }
              : {}),
            ...(localDueMissing && project.dueDate
              ? { dueDate: project.dueDate }
              : {}),
          });
        }
      } catch {
        // List still updates once PowerSync catches up.
      }
    } catch {
      // Keep silent in chrome; button title covers the action.
    } finally {
      setDomainsSyncing(false);
    }
  }, [client, workspace]);

  const chromeActions = useMemo((): ReactNode => {
    if (!showDomainsSync) return null;
    return (
      <div className="catalog-chrome-actions">
        <button
          type="button"
          className="catalog-chrome-actions__icon-button"
          aria-label="Sync domains from TransIP"
          title="Sync domains from TransIP"
          disabled={domainsSyncing}
          onClick={() => {
            void syncCatalogDomains();
          }}
        >
          <FinanceSyncIcon
            size={14}
            className={
              domainsSyncing
                ? "catalog-chrome-actions__sync-icon is-spinning"
                : "catalog-chrome-actions__sync-icon"
            }
          />
        </button>
      </div>
    );
  }, [domainsSyncing, showDomainsSync, syncCatalogDomains]);

  useDesktopSectionBreadcrumb([{ label: "Catalog" }], {
    actions: chromeActions,
  });

  const organizations = useMemo<OrganizationRef[]>(
    () =>
      workspace.organizations.map((org) => ({
        id: org.id,
        name: org.name,
      })),
    [workspace.organizations],
  );

  const organizationOptions = useMemo(
    () =>
      workspace.organizations.map((org) => ({
        value: org.id,
        label: org.name,
      })),
    [workspace.organizations],
  );

  // After a full close (no selection), reset collapsed so the next Enter
  // can run the enter-slide animation like contacts/orgs.
  useEffect(() => {
    if (!selectedDomainProject?.id) {
      setDetailCollapsed(false);
    }
  }, [selectedDomainProject?.id]);

  useLayoutEffect(() => {
    const nextId = selectedDomainProject?.id ?? null;
    if (nextId === panelProjectId) return;
    if (nextId == null) return;

    const canFade =
      panelProjectId != null &&
      !detailCollapsed &&
      !detailCollapseAnimating;

    if (!canFade) {
      contentFadeTokenRef.current += 1;
      setPanelProjectId(nextId);
      setContentFaded(false);
      return;
    }

    const token = ++contentFadeTokenRef.current;
    setContentFaded(true);
    const timer = window.setTimeout(() => {
      if (contentFadeTokenRef.current !== token) return;
      setPanelProjectId(nextId);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (contentFadeTokenRef.current !== token) return;
          setContentFaded(false);
        });
      });
    }, CONTACT_DETAIL_CONTENT_FADE_MS);

    return () => window.clearTimeout(timer);
  }, [
    selectedDomainProject?.id,
    panelProjectId,
    detailCollapsed,
    detailCollapseAnimating,
  ]);

  const createType = projectTypeForCatalogCreate(typeFilter);

  const openProjectRoute = useCallback(
    (key: string) => {
      const match = projects.find(
        (entry) => entry.key.toLowerCase() === key.toLowerCase(),
      );
      const href = `/projects/${key}`;
      if (match?.name) primeTabTitle(href, match.name);
      const state: ProjectLocationState = {
        projectType: match?.type ?? createType,
        from: "catalog",
        listHref: `${location.pathname}${location.searchStr ?? ""}`,
      };
      navigate(href, { state });
    },
    [createType, location.pathname, location.searchStr, navigate, projects],
  );

  const listProps = {
    projects,
    workingProjectIds,
    organizations,
    secondaryGrouping: "organization" as const,
    listColumns: showDomainsSync ? ("domains" as const) : ("default" as const),
    showAreaFilters: false,
    showTypeFilters: true,
    showTypeGroups: true,
    typeFilter,
    onTypeFilterChange: (nextType: ProjectTypeFilter) => {
      navigate(buildCatalogListHref(nextType, listView));
    },
    emptyMessage: showDomainsSync
      ? "No domains yet. Sync from the header or add one."
      : "No projects in this type.",
    view: listView,
    onViewChange: (nextView: ListBoardView) => {
      persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
      navigate(buildCatalogListHref(typeFilter, nextView));
    },
    onStatusChange: (projectId: string, status: ProjectStatus) => {
      void workspace.patchProject(projectId, { status });
    },
    onPriorityChange: (projectId: string, priority: number) => {
      void workspace.patchProject(projectId, { priority });
    },
    onStartDateChange: (projectId: string, startDate: Date | null) => {
      void workspace.patchProject(projectId, {
        startDate: startDate ? startDate.toISOString() : null,
      });
    },
    onDueDateChange: (projectId: string, dueDate: Date | null) => {
      void workspace.patchProject(projectId, {
        dueDate: dueDate ? dueDate.toISOString() : null,
      });
    },
    onProjectAreaChange: (projectId: string, area: ProjectArea | null) => {
      void workspace.patchProject(projectId, { area, areaId: null });
    },
    onOrganizationChange: (projectId: string, organizationId: string | null) => {
      void workspace.patchProject(projectId, { organizationId });
    },
    onCreateProject: async ({
      status,
      name,
    }: {
      status: ProjectStatus;
      name: string;
    }) => {
      return workspace.createProject({
        name,
        status,
        type: createType,
      });
    },
    onReorder: (request: ProjectReorderRequest) => {
      const patches = projectReorderPatches(
        projects as ProjectOverviewRowProject[],
        request,
      );
      for (const patch of patches) {
        void workspace.patchProject(patch.id, {
          status: patch.status,
          sortOrder: patch.sortOrder,
        });
      }
    },
  };

  if (!workspace.ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
        <RegisterPageTitle title="Catalog" />
        <ProjectsListSkeleton />
      </div>
    );
  }

  if (showDomainsSync) {
    const domainProject = panelProject
      ? {
          ...panelProject,
          organizationId: panelProject.organizationId ?? null,
          type: panelProject.type ?? "domeinname",
          provider: panelProject.provider ?? null,
          summary: workspace.projectSummaries[panelProject.id] ?? "",
          description:
            workspace.projectDescriptions[panelProject.id] ?? "",
          taskProgress: panelProject.taskProgress ?? {
            total: 0,
            completed: 0,
          },
        }
      : null;

    const domainDetailSharedProps = domainProject
      ? {
          project: domainProject,
          organizationOptions,
          nestedAreas: mapWorkspaceNestedAreas(workspace.areas),
          knownTags: knownDomainTags,
          loadDetail: loadDomainRegistrarDetail,
          loadCloudflareDnsRecords,
          purgeCloudflareCache,
          onSaveName: async (name: string) => {
            try {
              await workspace.patchProject(domainProject.id, { name });
              return { ok: true as const };
            } catch {
              return {
                ok: false as const,
                error: "Could not rename project",
              };
            }
          },
          onSaveKey: async (key: string) => {
            try {
              await workspace.patchProject(domainProject.id, { key });
              setSelectedDomainKey(key);
              return { ok: true as const, key };
            } catch {
              return {
                ok: false as const,
                error: "Could not update key",
              };
            }
          },
          onStatusChange: (status: ProjectStatus) => {
            void workspace.patchProject(domainProject.id, { status });
          },
          onPriorityChange: (priority: number) => {
            void workspace.patchProject(domainProject.id, { priority });
          },
          onAreaChange: (area: ProjectArea | null) => {
            void workspace.patchProject(domainProject.id, {
              area,
              areaId: null,
            });
          },
          onAreaIdChange: (areaId: string | null) => {
            void workspace.patchProject(domainProject.id, { areaId });
          },
          onOrganizationChange: (organizationId: string | null) => {
            void workspace.patchProject(domainProject.id, { organizationId });
          },
          onCreateOrganizationFromQuery: (query: string) => {
            void workspace
              .createOrganization({ name: query })
              .then((created) => {
                void workspace.patchProject(domainProject.id, {
                  organizationId: created.id,
                });
              });
          },
          onIconChange: (icon: string | null) => {
            void workspace.patchProject(domainProject.id, { icon });
          },
          onTagsChange: async (tags: string[]) => {
            try {
              const result = await updateDomainTags(domainProject.name, tags);
              await workspace.patchProject(domainProject.id, {
                icon: buildTransipDomainProjectIcon(result.tags),
              });
              return { ok: true as const, tags: result.tags };
            } catch (error) {
              return {
                ok: false as const,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not update tags",
              };
            }
          },
          onContactsChange: async (contacts: DomainRegistrarContact[]) => {
            try {
              const result = await updateDomainContacts(
                domainProject.name,
                contacts,
              );
              return { ok: true as const, contacts: result.contacts };
            } catch (error) {
              return {
                ok: false as const,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not update WHOIS contacts",
              };
            }
          },
        }
      : null;

    const panelOpen = Boolean(domainDetailSharedProps);
    const listExpandFaded = listFaded && panelOpen;

    const domainTasksPanel =
      domainProject != null ? (
        <div className="domain-project-workbench__tasks" data-list-board-view>
          <ProjectTasksView
            tasks={domainTasks}
            assigneeOptions={assigneeOptions}
            view={listView}
            onViewChange={(nextView) => {
              persistListBoardView(nextView, TASKS_LIST_BOARD_STORAGE_KEY);
            }}
            onSelectTask={(id) => {
              const task = domainTasks.find((entry) => entry.id === id);
              const href =
                task?.number != null
                  ? getScopedProjectTaskHref(domainProject.key, task.number)
                  : `${getProjectSectionHref(domainProject.key, "tasks")}/${id}`;
              if (task?.title) primeTabTitle(href, task.title);
              const state: ProjectLocationState = {
                projectType: "domeinname",
                from: "catalog",
                listHref: `${location.pathname}${location.searchStr ?? ""}`,
              };
              navigate(href, { state });
            }}
            onStatusChange={(taskId, status) => {
              void workspace.patchTask(taskId, { status });
            }}
            onPriorityChange={(taskId, priority) => {
              void workspace.patchTask(taskId, { priority });
            }}
            onDueDateChange={(taskId, dueDate) => {
              void workspace.patchTask(taskId, {
                dueDate: dueDate ? dueDate.toISOString() : null,
              });
            }}
            onAssigneeChange={(taskId, assigneeId) => {
              void workspace.patchTask(taskId, { assigneeId });
            }}
            onBulkDelete={async (taskIds) => {
              for (const taskId of taskIds) {
                await workspace.softDeleteTask(taskId);
              }
            }}
            onReorder={(request) => {
              const patches = taskReorderPatches(domainTasks, request);
              for (const patch of patches) {
                void workspace.patchTask(patch.id, {
                  status: patch.status,
                  sortOrder: patch.sortOrder,
                });
              }
            }}
            onCreateTask={async ({ status, title }) => {
              return workspace.createProjectTask({
                projectId: domainProject.id,
                title,
                status,
              });
            }}
            onCreatedTask={(taskId) => {
              const task = domainTasks.find((entry) => entry.id === taskId);
              const href =
                task?.number != null
                  ? getScopedProjectTaskHref(domainProject.key, task.number)
                  : `${getProjectSectionHref(domainProject.key, "tasks")}/${taskId}`;
              if (task?.title) primeTabTitle(href, task.title);
              navigate(href, {
                state: {
                  projectType: "domeinname",
                  from: "catalog",
                  listHref: `${location.pathname}${location.searchStr ?? ""}`,
                } satisfies ProjectLocationState,
              });
            }}
          />
        </div>
      ) : null;

    return (
      <div
        className={[
          "catalog-domains-page",
          "journal-day-layout",
          "desktop-journal-day-layout",
          panelOpen && detailCollapsed ? "is-calendar-collapsed" : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-content-detail
        data-detail-split
        data-calendar-collapsed={
          panelOpen && detailCollapsed ? "true" : "false"
        }
      >
        <RegisterPageTitle title="Catalog" />
        <div
          className={[
            "journal-day-layout__main",
            listExpandFaded ? "is-expand-faded" : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <ProjectsOverviewView
              {...listProps}
              selectedProjectId={selectedDomainProject?.id ?? null}
              onSelectProject={(key) => {
                const hadSelection = selectedDomainKey != null;
                setSelectedDomainKey(key);
                setDomainOverlayLayout("panel");
                if (key !== selectedDomainKey) {
                  setDomainCardSection("details");
                }
                // Match contacts: first open slides the rail in. Activating
                // again (Enter / click) while the ] strip is showing should
                // also open — domains have no URL change to signal intent.
                if (!hadSelection || detailCollapsedRef.current) {
                  setDetailCollapsed(false);
                }
              }}
              onCreatedProject={(_id, key) => {
                if (!key) return;
                setSelectedDomainKey(key);
                setDomainOverlayLayout("panel");
                setDomainCardSection("details");
                setDetailCollapsed(false);
              }}
            />
          </div>
        </div>

        <EntityDetailOverlay
          open={panelOpen}
          collapsed={detailCollapsed}
          collapseAnimating={detailCollapseAnimating}
          contentFaded={contentFaded}
          workspaceFaded={workspaceFaded}
          overlayLayout={domainOverlayLayout}
          title={domainProject?.name ?? "Domain"}
          entityLabel="domain"
          overlayDataKey="domain"
          onExpand={expandDomainOverlay}
          onCollapse={collapseDomainOverlay}
          onHide={hideDomainDetail}
          onShow={showDomainDetail}
          workspaceTabs={DOMAIN_EXPANDED_WORKSPACE_TABS}
          workspaceTab="tasks"
          renderWorkspaceTab={() => domainTasksPanel}
        >
          {domainDetailSharedProps ? (
            <DomainDetailView
              {...domainDetailSharedProps}
              section={domainCardSection}
              onSectionChange={setDomainCardSection}
              onMore={expandDomainOverlay}
            />
          ) : null}
        </EntityDetailOverlay>
      </div>
    );
  }

  return (
    <>
      <RegisterPageTitle title="Catalog" />
      <DesktopCollapsibleRightSidePanelLayout
        storageKey={CATALOG_SIDE_PANEL_WIDTH_KEY}
        panelAriaLabel="Catalog side panel"
        showPanelLabel="Show side panel"
        hidePanelLabel="Hide side panel"
        main={
          <div className="flex min-h-0 flex-1 flex-col">
            <ProjectsOverviewView
              {...listProps}
              onSelectProject={openProjectRoute}
              onCreatedProject={(_id, key) => {
                if (!key) return;
                openProjectRoute(key);
              }}
            />
          </div>
        }
        sidePanel={<DevelopmentDeploymentsSidePanel />}
      />
    </>
  );
}

/** @deprecated Use CatalogPage — kept for any lingering imports during rename. */
export const DevelopmentPage = CatalogPage;
