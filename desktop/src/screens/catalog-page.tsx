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
  ContactDetailOverlay,
  DomainDetailView,
  FinanceSyncIcon,
  ProjectsListSkeleton,
  ProjectsOverviewView,
  RegisterPageTitle,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  buildTransipDomainProjectIcon,
  collectTransipDomainTagsFromProjects,
  getCatalogListTypeHref,
  parseListBoardViewFromLocation,
  parseProjectTypeFilterFromLocation,
  persistListBoardView,
  primeTabTitle,
  projectReorderPatches,
  projectTypeForCatalogCreate,
  type DomainRegistrarDetail,
  type DomainRegistrarContact,
  type DomainCloudflareDnsResult,
  type ListBoardView,
  type OrganizationRef,
  type ProjectOverviewRowProject,
  type ProjectReorderRequest,
  type ProjectStatus,
  type ProjectTypeFilter,
} from "@backsteros/ui";

import { DesktopCollapsibleRightSidePanelLayout } from "../components/desktop-journal-day-layout";
import { DevelopmentDeploymentsSidePanel } from "../components/development-deployments-side-panel";
import { useDesktopApi } from "../lib/api-context";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
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
  const [domainsSyncing, setDomainsSyncing] = useState(false);

  // Domains tab: keep the list mounted and open the project in a contacts-style panel.
  const [selectedDomainKey, setSelectedDomainKey] = useState<string | null>(
    null,
  );
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [detailCollapseAnimating, setDetailCollapseAnimating] = useState(false);
  const [contentFaded, setContentFaded] = useState(false);
  const [panelProjectId, setPanelProjectId] = useState<string | null>(null);
  const detailCollapseAnimTimerRef = useRef<number | null>(null);
  const detailCollapseRafRef = useRef<number | null>(null);
  const contentFadeTokenRef = useRef(0);
  const prevSelectedDomainIdRef = useRef<string | null>(null);

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
    ) ?? "all";

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
    setPanelProjectId(null);
    setContentFaded(false);
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

  const loadDomainRegistrarDetail = useCallback(
    async (domainName: string): Promise<DomainRegistrarDetail> => {
      return client.requestJson<DomainRegistrarDetail>(
        `/api/v1/transip/domains/${encodeURIComponent(domainName)}`,
      );
    },
    [client],
  );

  const knownDomainTags = useMemo(
    () =>
      collectTransipDomainTagsFromProjects(
        projects.filter((project) => project.type === "domeinname"),
      ),
    [projects],
  );

  const updateDomainTags = useCallback(
    async (domainName: string, tags: string[]) => {
      return client.requestJson<{ tags: string[]; projectId: string | null }>(
        `/api/v1/transip/domains/${encodeURIComponent(domainName)}/tags`,
        {
          method: "PUT",
          body: JSON.stringify({ tags }),
        },
      );
    },
    [client],
  );

  const updateDomainContacts = useCallback(
    async (
      domainName: string,
      contacts: DomainRegistrarContact[],
    ) => {
      return client.requestJson<{ contacts: DomainRegistrarContact[] }>(
        `/api/v1/transip/domains/${encodeURIComponent(domainName)}/contacts`,
        {
          method: "PUT",
          body: JSON.stringify({ contacts }),
        },
      );
    },
    [client],
  );

  const loadCloudflareDnsRecords = useCallback(
    async (zoneId: string): Promise<DomainCloudflareDnsResult> => {
      return client.requestJson<DomainCloudflareDnsResult>(
        `/api/v1/cloudflare/zones/${encodeURIComponent(zoneId)}/dns-records`,
      );
    },
    [client],
  );

  const purgeCloudflareCache = useCallback(
    async (zoneId: string): Promise<void> => {
      await client.requestJson(
        `/api/v1/cloudflare/zones/${encodeURIComponent(zoneId)}/purge-cache`,
        { method: "POST" },
      );
    },
    [client],
  );

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

  useEffect(() => {
    return () => {
      if (detailCollapseAnimTimerRef.current != null) {
        window.clearTimeout(detailCollapseAnimTimerRef.current);
      }
      if (detailCollapseRafRef.current != null) {
        window.cancelAnimationFrame(detailCollapseRafRef.current);
      }
    };
  }, []);

  const hideDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(true);
    });
  }, [beginDetailCollapseAnimation]);

  const showDetail = useCallback(() => {
    beginDetailCollapseAnimation(() => {
      setDetailCollapsed(false);
    });
  }, [beginDetailCollapseAnimation]);

  useEffect(() => {
    const prevId = prevSelectedDomainIdRef.current;
    prevSelectedDomainIdRef.current = selectedDomainProject?.id ?? null;
    if (!selectedDomainProject?.id) {
      setDetailCollapsed(false);
      return;
    }
    // Switching domains while the strip is showing: keep the strip.
    if (detailCollapsed && prevId != null) return;
  }, [selectedDomainProject?.id, detailCollapsed]);

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
      };
      navigate(href, { state });
    },
    [createType, navigate, projects],
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
    const panelOpen = Boolean(panelProject ?? selectedDomainProject);

    return (
      <>
        <RegisterPageTitle title="Catalog" />
        <div
          className={[
            "journal-day-layout",
            "desktop-journal-day-layout",
            panelOpen && detailCollapsed ? "is-calendar-collapsed" : null,
          ]
            .filter(Boolean)
            .join(" ")}
          data-detail-split
          data-calendar-collapsed={
            panelOpen && detailCollapsed ? "true" : "false"
          }
        >
          <div className="journal-day-layout__main">
            <div className="flex min-h-0 flex-1 flex-col">
              <ProjectsOverviewView
                {...listProps}
                selectedProjectId={selectedDomainProject?.id ?? null}
                onSelectProject={(key) => {
                  setSelectedDomainKey(key);
                  // First open expands; switches while collapsed keep the strip.
                  if (!selectedDomainKey) {
                    setDetailCollapsed(false);
                  }
                }}
                onCreatedProject={(_id, key) => {
                  if (!key) return;
                  setSelectedDomainKey(key);
                  setDetailCollapsed(false);
                }}
              />
            </div>
          </div>

          <ContactDetailOverlay
            open={panelOpen}
            collapsed={detailCollapsed}
            collapseAnimating={detailCollapseAnimating}
            contentFaded={contentFaded}
            title={panelProject?.name ?? selectedDomainProject?.name ?? "Domain"}
            onHide={hideDetail}
            onShow={showDetail}
          >
            {panelProject ? (
              <DomainDetailView
                project={{
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
                }}
                organizationOptions={organizationOptions}
                knownTags={knownDomainTags}
                loadDetail={loadDomainRegistrarDetail}
                loadCloudflareDnsRecords={loadCloudflareDnsRecords}
                purgeCloudflareCache={purgeCloudflareCache}
                onSaveName={async (name) => {
                  try {
                    await workspace.patchProject(panelProject.id, { name });
                    return { ok: true as const };
                  } catch {
                    return {
                      ok: false as const,
                      error: "Could not rename project",
                    };
                  }
                }}
                onSaveKey={async (key) => {
                  try {
                    await workspace.patchProject(panelProject.id, { key });
                    setSelectedDomainKey(key);
                    return { ok: true as const, key };
                  } catch {
                    return {
                      ok: false as const,
                      error: "Could not update key",
                    };
                  }
                }}
                onStatusChange={(status) => {
                  void workspace.patchProject(panelProject.id, { status });
                }}
                onPriorityChange={(priority) => {
                  void workspace.patchProject(panelProject.id, { priority });
                }}
                onOrganizationChange={(organizationId) => {
                  void workspace.patchProject(panelProject.id, {
                    organizationId,
                  });
                }}
                onCreateOrganizationFromQuery={(query) => {
                  void workspace
                    .createOrganization({ name: query })
                    .then((created) => {
                      void workspace.patchProject(panelProject.id, {
                        organizationId: created.id,
                      });
                    });
                }}
                onIconChange={(icon) => {
                  void workspace.patchProject(panelProject.id, { icon });
                }}
                onTagsChange={async (tags) => {
                  try {
                    const result = await updateDomainTags(
                      panelProject.name,
                      tags,
                    );
                    await workspace.patchProject(panelProject.id, {
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
                }}
                onContactsChange={async (contacts) => {
                  try {
                    const result = await updateDomainContacts(
                      panelProject.name,
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
                }}
              />
            ) : null}
          </ContactDetailOverlay>
        </div>
      </>
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
