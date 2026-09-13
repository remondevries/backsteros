import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";

import {
  ProjectsListSkeleton,
  ProjectsOverviewView,
  RegisterPageTitle,
  PROJECTS_LIST_BOARD_STORAGE_KEY,
  getCatalogListTypeHref,
  getIntegrationsSettingsHref,
  parseListBoardViewFromLocation,
  parseProjectTypeFilterFromLocation,
  persistListBoardView,
  primeTabTitle,
  projectReorderPatches,
  projectTypeForCatalogCreate,
  type ListBoardView,
  type OrganizationRef,
  type ProjectOverviewRowProject,
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
import {
  type ProjectLocationState,
} from "../lib/project-type-cache";
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
  const [transipSyncing, setTransipSyncing] = useState(false);
  const [transipMessage, setTransipMessage] = useState<string | null>(null);
  const [cloudflareMatching, setCloudflareMatching] = useState(false);
  const [cloudflareMessage, setCloudflareMessage] = useState<string | null>(
    null,
  );

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
  const showTransipSync = typeFilter === "domeinname";

  const workingProjectIds = useMemo(
    () =>
      buildWorkingProjectIdSet(
        workspace.allTasks,
        agentStatus?.workingTaskIds ?? new Set(),
      ),
    [agentStatus?.workingTaskIds, workspace.allTasks],
  );

  useDesktopSectionBreadcrumb([{ label: "Catalog" }]);

  const organizations = useMemo<OrganizationRef[]>(
    () =>
      workspace.organizations.map((org) => ({
        id: org.id,
        name: org.name,
      })),
    [workspace.organizations],
  );

  const createType = projectTypeForCatalogCreate(typeFilter);

  const syncTransipDomains = useCallback(async () => {
    setTransipSyncing(true);
    setTransipMessage(null);
    try {
      const result = await client.requestJson<TransipSyncResult>(
        "/api/v1/transip/domains/sync",
        { method: "POST" },
      );
      const healed = result.healed ?? 0;
      setTransipMessage(
        healed > 0
          ? `Synced TransIP: ${result.created} new, ${healed} fixed type, ${result.skipped} already present (${result.fetched} fetched).`
          : `Synced TransIP: ${result.created} new, ${result.skipped} already present (${result.fetched} fetched).`,
      );
      // New projects arrive via PowerSync / workspace live events.
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not sync TransIP domains.";
      setTransipMessage(message);
    } finally {
      setTransipSyncing(false);
    }
  }, [client]);

  const matchCloudflareZones = useCallback(async () => {
    setCloudflareMatching(true);
    setCloudflareMessage(null);
    try {
      const result = await client.requestJson<CloudflareMatchResult>(
        "/api/v1/cloudflare/zones/match",
        { method: "POST" },
      );
      setCloudflareMessage(
        `Cloudflare: ${result.updated} zone ids saved, ${result.unchanged} already linked, ${result.unmatchedProjects} domains without a zone (${result.fetched} zones fetched).`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not match Cloudflare zones.";
      setCloudflareMessage(message);
    } finally {
      setCloudflareMatching(false);
    }
  }, [client]);

  if (!workspace.ready) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2">
        <RegisterPageTitle title="Catalog" />
        <ProjectsListSkeleton />
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
            {showTransipSync ? (
              <div className="catalog-transip-sync">
                <div className="catalog-transip-sync__actions">
                  <button
                    type="button"
                    className="catalog-transip-sync__button"
                    disabled={transipSyncing}
                    onClick={() => {
                      void syncTransipDomains();
                    }}
                  >
                    {transipSyncing ? "Syncing…" : "Sync from TransIP"}
                  </button>
                  <button
                    type="button"
                    className="catalog-transip-sync__button"
                    disabled={cloudflareMatching}
                    onClick={() => {
                      void matchCloudflareZones();
                    }}
                  >
                    {cloudflareMatching
                      ? "Matching…"
                      : "Match Cloudflare zones"}
                  </button>
                </div>
                {transipMessage ? (
                  <p className="catalog-transip-sync__message" role="status">
                    {transipMessage}
                  </p>
                ) : null}
                {cloudflareMessage ? (
                  <p className="catalog-transip-sync__message" role="status">
                    {cloudflareMessage}
                  </p>
                ) : null}
                {!transipMessage && !cloudflareMessage ? (
                  <p className="catalog-transip-sync__hint">
                    Import domains from TransIP, then match Cloudflare zone ids.
                    Configure tokens in{" "}
                    <button
                      type="button"
                      className="catalog-transip-sync__link"
                      onClick={() =>
                        navigate(getIntegrationsSettingsHref("cloudflare"))
                      }
                    >
                      Settings → Integrations
                    </button>
                    .
                  </p>
                ) : null}
              </div>
            ) : null}
            <ProjectsOverviewView
              projects={projects}
              workingProjectIds={workingProjectIds}
              organizations={organizations}
              secondaryGrouping="organization"
              showAreaFilters={false}
              showTypeFilters
              showTypeGroups
              typeFilter={typeFilter}
              onTypeFilterChange={(nextType) => {
                navigate(buildCatalogListHref(nextType, listView));
              }}
              emptyMessage={
                showTransipSync
                  ? "No domains yet. Sync from TransIP or add one."
                  : "No projects in this type."
              }
              view={listView}
              onViewChange={(nextView) => {
                persistListBoardView(nextView, PROJECTS_LIST_BOARD_STORAGE_KEY);
                navigate(buildCatalogListHref(typeFilter, nextView));
              }}
              onSelectProject={(key) => {
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
              }}
              onStatusChange={(projectId, status: ProjectStatus) => {
                void workspace.patchProject(projectId, { status });
              }}
              onPriorityChange={(projectId, priority) => {
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
              onCreateProject={async ({ status, name }) => {
                return workspace.createProject({
                  name,
                  status,
                  type: createType,
                });
              }}
              onCreatedProject={(_id, key) => {
                if (!key) return;
                const href = `/projects/${key}`;
                const match = projects.find(
                  (entry) => entry.key.toLowerCase() === key.toLowerCase(),
                );
                if (match?.name) primeTabTitle(href, match.name);
                const state: ProjectLocationState = {
                  projectType: createType,
                  from: "catalog",
                };
                navigate(href, { state });
              }}
              onReorder={(request) => {
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
