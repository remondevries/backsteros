"use client";

import type { Project as ApiProject } from "@backsteros/contracts";
import {
  DotScrollLoader,
  InboxNavIcon,
  LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  ProjectOcticon,
  ProjectStatusIcon,
  SidebarComposeIcon,
  StatusGroupSection,
  flattenGroupedListItemIds,
  groupProjectsByStatus,
  keyboardNavItemClass,
  keyboardNavItemProps,
  mapProjectStatusToTaskStatusIcon,
  migrateLegacyProjectStatus,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  type ProjectStatus,
} from "@backsteros/ui";
import { useCallback, useMemo, useRef, useState } from "react";

import { ProjectsSidePanelIcon } from "@/components/panel-icons";
import { ConsoleProfileMenu } from "@/components/console-profile-menu";
import { apiErrorMessage } from "@/lib/api-context";

/** Active first for the development console rail. */
const CONSOLE_PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "active",
  "backlog",
  "on_hold",
  "completed",
  "canceled",
];

export function ProjectSidebar({
  projects,
  selectedProjectId,
  inboxActive = false,
  loading,
  error,
  collapsed = false,
  workingProjectIds = [],
  onToggleCollapsed,
  onCompose,
  onSelect,
  onSelectInbox,
  onOpenAppSettings,
  onRetry,
}: {
  projects: ApiProject[];
  selectedProjectId: string | null;
  inboxActive?: boolean;
  loading: boolean;
  error: Error | null;
  collapsed?: boolean;
  /** Projects that currently have at least one working agent. */
  workingProjectIds?: readonly string[];
  onToggleCollapsed?: () => void;
  onCompose?: () => void;
  onSelect: (projectId: string) => void;
  onSelectInbox?: () => void;
  onOpenAppSettings?: () => void;
  onRetry?: () => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const listRef = useRef<HTMLUListElement>(null);
  const { setActiveZone } = useListKeyboardNavigationZone();
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  const workingProjectIdSet = useMemo(
    () => new Set(workingProjectIds),
    [workingProjectIds],
  );

  const groups = useMemo(() => {
    const grouped = groupProjectsByStatus(projects, { includeEmpty: true });
    const byStatus = new Map(grouped.map((group) => [group.status, group]));
    return CONSOLE_PROJECT_STATUS_ORDER.map((status) =>
      byStatus.get(status),
    ).filter((group): group is NonNullable<typeof group> => Boolean(group));
  }, [projects]);

  const itemIds = useMemo(() => {
    if (collapsed) {
      return groups.flatMap((group) =>
        group.projects.map((project) => project.id),
      );
    }
    return flattenGroupedListItemIds(
      groups.map((group) => ({ key: group.status, items: group.projects })),
      collapsedGroups,
      (project) => project.id,
    );
  }, [collapsed, collapsedGroups, groups]);

  const activateProject = useCallback(
    (projectId: string) => {
      onSelect(projectId);
      // Move j/k focus into the task list after selecting a project.
      requestAnimationFrame(() => {
        setActiveZone("main", { activate: true });
      });
    },
    [onSelect, setActiveZone],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedProjectId,
    onNavigate: activateProject,
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: itemIds.length > 0,
  });

  const renderProjectRow = (project: ApiProject) => (
    <div
      className={`console-project-item${
        selectedProjectId === project.id ? " is-active" : ""
      }${highlightedId === project.id ? ` ${keyboardNavItemClass(true)}` : ""}`}
    >
      <button
        type="button"
        className="console-project-item-select"
        onClick={() => onSelect(project.id)}
        title={project.name}
        aria-label={`${project.key} — ${project.name}`}
        {...keyboardNavItemProps(project.id)}
      >
        <span className="console-project-name-row">
          {workingProjectIdSet.has(project.id) ? (
            <DotScrollLoader
              status="working"
              className="task-sync-loader console-project-icon console-project-icon--agent"
              aria-label={`${project.name} — agent working`}
            />
          ) : (
            <ProjectOcticon
              icon={project.icon}
              size={collapsed ? 16 : 14}
              className="console-project-icon"
              title={project.name}
            />
          )}
          {collapsed ? (
            <span className="console-project-code">{project.key}</span>
          ) : (
            <span className="console-project-name">{project.name}</span>
          )}
        </span>
      </button>
    </div>
  );

  return (
    <aside
      className={`console-pane console-pane--projects${
        collapsed ? " is-collapsed" : ""
      }`}
    >
      <div className="sidebar-inner console-sidebar-inner">
        <div className="console-sidebar-chrome">
          <div className="app-side-panel-history-toolbar">
            <div className="app-side-panel-history-actions">
              {onToggleCollapsed ? (
                <button
                  type="button"
                  className="app-side-panel-history-button"
                  onClick={onToggleCollapsed}
                  title={collapsed ? "Expand projects" : "Collapse projects"}
                  aria-label={
                    collapsed ? "Expand projects" : "Collapse projects"
                  }
                  aria-pressed={collapsed}
                >
                  <ProjectsSidePanelIcon collapsed={collapsed} />
                </button>
              ) : null}
            </div>
          </div>

          <ConsoleProfileMenu
            collapsed={collapsed}
            onOpenSettings={onOpenAppSettings}
            trailingAction={
              onCompose ? (
                <button
                  type="button"
                  className="app-side-panel-compose-trigger"
                  onClick={onCompose}
                  title="Create task"
                  aria-label="Create task"
                  disabled={projects.length === 0}
                >
                  <SidebarComposeIcon />
                </button>
              ) : null
            }
          />
        </div>

        <div className="console-pane-body">
          {onSelectInbox ? (
            <nav
              className={`console-sidebar-nav${
                collapsed ? " is-collapsed" : ""
              }`}
              aria-label="Workspace"
            >
              <button
                type="button"
                className={`sidebar-link${inboxActive ? " is-active" : ""}`}
                aria-current={inboxActive ? "page" : undefined}
                title="Inbox"
                aria-label="Inbox"
                onClick={onSelectInbox}
              >
                <span className="nav-icon">
                  <InboxNavIcon />
                </span>
                {!collapsed ? (
                  <span className="sidebar-link-label">Inbox</span>
                ) : null}
              </button>
            </nav>
          ) : null}

          {!collapsed && loading && !projects.length ? (
            <div className="console-empty">Loading projects…</div>
          ) : null}
          {!collapsed && error ? (
            <div className="console-error">
              <div>{apiErrorMessage(error)}</div>
              {onRetry ? (
                <button
                  type="button"
                  className="console-btn"
                  style={{ marginTop: 8 }}
                  onClick={onRetry}
                >
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {!collapsed && !loading && !error && projects.length === 0 ? (
            <div className="console-empty">
              No codebase projects yet. Mark a project with{" "}
              <code>type: &quot;codebase&quot;</code> via the API to show it
              here.
            </div>
          ) : null}
          {collapsed ? (
            <ul
              className="console-project-list"
              role="list"
              ref={listRef}
              {...listContainerProps}
            >
              {groups.flatMap((group) =>
                group.projects.map((project) => (
                  <li key={project.id}>{renderProjectRow(project)}</li>
                )),
              )}
            </ul>
          ) : (
            <ul
              className="console-project-groups overview-grouped-list"
              role="list"
              ref={listRef}
              {...listContainerProps}
            >
              {groups.map((group) => {
                const isGroupCollapsed = collapsedGroups.has(group.status);
                const headerStatus = mapProjectStatusToTaskStatusIcon(
                  migrateLegacyProjectStatus(group.status),
                );
                return (
                  <StatusGroupSection
                    key={group.status}
                    groupKey={headerStatus}
                    title={group.label}
                    collapsed={isGroupCollapsed}
                    icon={
                      <ProjectStatusIcon
                        status={group.status}
                        size={14}
                        title={group.label}
                      />
                    }
                    onToggle={() =>
                      setCollapsedGroups((current) => {
                        const next = new Set(current);
                        if (next.has(group.status)) next.delete(group.status);
                        else next.add(group.status);
                        return next;
                      })
                    }
                  >
                    {group.projects.map((project) => (
                      <li key={project.id}>{renderProjectRow(project)}</li>
                    ))}
                  </StatusGroupSection>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
