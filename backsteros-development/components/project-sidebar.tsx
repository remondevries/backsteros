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
  isBlockingModalOpen,
  isProjectListDragActive,
  isTargetInsideBlockingModal,
  keyboardNavItemClass,
  keyboardNavItemProps,
  mapProjectStatusToTaskStatusIcon,
  migrateLegacyProjectStatus,
  projectGroupAppendOrderKey,
  projectOrderKey,
  readProjectDragPayload,
  resolveProjectDropBeforeProject,
  resolveProjectDropOnGroupAppend,
  shouldHandleGlobalShortcut,
  useCommandPalette,
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
  writeProjectDragPayload,
  type ProjectReorderRequest,
  type ProjectStatus,
} from "@backsteros/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";

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

/** Sentinel id so Inbox participates in the side-panel j/k list. */
const INBOX_NAV_ID = "__console-inbox__";

/** First project in rail order (active → …) — used by G then P. */
export function getFirstConsoleProjectId(
  projects: readonly ApiProject[],
): string | null {
  const grouped = groupProjectsByStatus([...projects], { includeEmpty: true });
  const byStatus = new Map(grouped.map((group) => [group.status, group]));
  for (const status of CONSOLE_PROJECT_STATUS_ORDER) {
    const first = byStatus.get(status)?.projects[0];
    if (first) return first.id;
  }
  return null;
}

export function ProjectSidebar({
  projects,
  selectedProjectId,
  inboxActive = false,
  loading,
  error,
  collapsed = false,
  workingProjectIds = [],
  /** When false, j/k on this rail is off (e.g. project task → terminal focus). */
  listKeyboardNavEnabled = true,
  onToggleCollapsed,
  onCompose,
  onSelect,
  onSelectInbox,
  onOpenAppSettings,
  onRetry,
  onReorder,
}: {
  projects: ApiProject[];
  selectedProjectId: string | null;
  inboxActive?: boolean;
  loading: boolean;
  error: Error | null;
  collapsed?: boolean;
  /** Projects that currently have at least one working agent. */
  workingProjectIds?: readonly string[];
  listKeyboardNavEnabled?: boolean;
  onToggleCollapsed?: () => void;
  onCompose?: () => void;
  onSelect: (projectId: string) => void;
  onSelectInbox?: () => void;
  onOpenAppSettings?: () => void;
  onRetry?: () => void;
  onReorder?: (request: ProjectReorderRequest) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(),
  );
  const [dragInsertBeforeKey, setDragInsertBeforeKey] = useState<string | null>(
    null,
  );
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(
    null,
  );
  const navListRef = useRef<HTMLDivElement>(null);
  const { open: commandPaletteOpen } = useCommandPalette();
  const { setActiveZone } = useListKeyboardNavigationZone();
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
  );

  const canReorder = Boolean(onReorder) && !collapsed;
  const includeInbox = Boolean(onSelectInbox);

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

  /** Full status order — used by ⌘⌥↑/↓ even when a status group is collapsed. */
  const allProjectIds = useMemo(
    () => groups.flatMap((group) => group.projects.map((project) => project.id)),
    [groups],
  );

  const projectItemIds = useMemo(() => {
    if (collapsed) {
      return allProjectIds;
    }
    return flattenGroupedListItemIds(
      groups.map((group) => ({ key: group.status, items: group.projects })),
      collapsedGroups,
      (project) => project.id,
    );
  }, [allProjectIds, collapsed, collapsedGroups, groups]);

  const itemIds = useMemo(
    () => (includeInbox ? [INBOX_NAV_ID, ...projectItemIds] : projectItemIds),
    [includeInbox, projectItemIds],
  );

  const quickNavIds = useMemo(
    () => (includeInbox ? [INBOX_NAV_ID, ...allProjectIds] : allProjectIds),
    [allProjectIds, includeInbox],
  );

  const selectedNavId = inboxActive
    ? INBOX_NAV_ID
    : selectedProjectId;

  const activateProject = useCallback(
    (projectId: string) => {
      onSelect(projectId);
      // Move j/k focus into the task list (skip Files/commits/PRs — 1 / 2 / 3).
      // Double rAF: task list remounts on project change before it can register.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setActiveZone("main", { activate: true });
        });
      });
    },
    [onSelect, setActiveZone],
  );

  const activateNavItem = useCallback(
    (itemId: string) => {
      if (itemId === INBOX_NAV_ID) {
        onSelectInbox?.();
        return;
      }
      activateProject(itemId);
    },
    [activateProject, onSelectInbox],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: navListRef,
    itemIds,
    selectedId: selectedNavId,
    onNavigate: activateNavItem,
    zone: LIST_KEYBOARD_NAV_ZONE_SIDE_PANEL,
    enabled: listKeyboardNavEnabled && itemIds.length > 0,
  });

  // ⌘⌥↑ / ⌘⌥↓ (Ctrl+Alt on non-Mac) — jump inbox + projects without
  // stealing focus from the terminal or task list.
  useEffect(() => {
    if (quickNavIds.length === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (commandPaletteOpen) return;
      if (
        !(event.metaKey || event.ctrlKey) ||
        !event.altKey ||
        event.shiftKey
      ) {
        return;
      }

      const direction =
        event.key === "ArrowDown" || event.code === "ArrowDown"
          ? 1
          : event.key === "ArrowUp" || event.code === "ArrowUp"
            ? -1
            : 0;
      if (!direction) return;

      const target = event.target;
      const inXterm =
        target instanceof HTMLElement && Boolean(target.closest(".xterm"));
      if (inXterm) {
        if (
          isBlockingModalOpen() &&
          !isTargetInsideBlockingModal(event.target)
        ) {
          return;
        }
      } else if (!shouldHandleGlobalShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const currentId = inboxActive
        ? INBOX_NAV_ID
        : selectedProjectId;
      const currentIndex = currentId ? quickNavIds.indexOf(currentId) : -1;
      let nextIndex: number;
      if (currentIndex < 0) {
        nextIndex = direction > 0 ? 0 : quickNavIds.length - 1;
      } else {
        nextIndex =
          (currentIndex + direction + quickNavIds.length) % quickNavIds.length;
      }
      const nextId = quickNavIds[nextIndex];
      if (!nextId || nextId === currentId) return;
      if (nextId === INBOX_NAV_ID) {
        onSelectInbox?.();
        return;
      }
      onSelect(nextId);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [
    commandPaletteOpen,
    inboxActive,
    onSelect,
    onSelectInbox,
    quickNavIds,
    selectedProjectId,
  ]);

  const handleProjectDragEnd = useCallback(() => {
    setDraggingProjectId(null);
    setDragInsertBeforeKey(null);
  }, []);

  const handleProjectReorder = useCallback(
    (request: ProjectReorderRequest) => {
      handleProjectDragEnd();
      if (request.fromStatus !== request.toStatus) {
        setCollapsedGroups((current) => {
          const next = new Set(current);
          next.delete(request.toStatus);
          return next;
        });
      }
      onReorder?.(request);
    },
    [handleProjectDragEnd, onReorder],
  );

  const renderProjectRow = (project: ApiProject) => (
    <div
      className={`console-project-item${
        selectedProjectId === project.id ? " is-active" : ""
      }${highlightedId === project.id ? ` ${keyboardNavItemClass(true)}` : ""}${
        draggingProjectId === project.id ? " is-dragging" : ""
      }`}
      draggable={canReorder}
      onDragStart={
        canReorder
          ? (event: DragEvent<HTMLDivElement>) => {
              writeProjectDragPayload(event.dataTransfer, project);
              event.dataTransfer.effectAllowed = "move";
              setDraggingProjectId(project.id);
            }
          : undefined
      }
      onDragEnd={canReorder ? handleProjectDragEnd : undefined}
    >
      <button
        type="button"
        className="console-project-item-select"
        onClick={() => activateProject(project.id)}
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
              style={{ color: "inherit" }}
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
          <div
            className="app-side-panel-history-toolbar"
            data-tauri-drag-region
          >
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
              No codebase projects yet. Set a project&apos;s type to{" "}
              <strong>Codebase</strong> in the web app Properties to show it
              here.
            </div>
          ) : null}
          <div
            ref={navListRef}
            className="console-sidebar-nav-list"
            {...listContainerProps}
          >
          {onSelectInbox ? (
            <nav
              className={`sidebar-sections console-sidebar-nav${
                collapsed ? " is-collapsed" : ""
              }`}
              aria-label="Workspace"
            >
              <section>
                {/*
                  Same row chrome as projects so j/k uses the proven
                  `.console-project-item.keyboard-nav-item-highlight` ring.
                */}
                <div
                  className={`console-project-item console-inbox-nav-item${
                    inboxActive ? " is-active" : ""
                  }${
                    highlightedId === INBOX_NAV_ID
                      ? ` ${keyboardNavItemClass(true)}`
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="console-project-item-select"
                    aria-current={inboxActive ? "page" : undefined}
                    title="Inbox"
                    aria-label="Inbox"
                    onClick={onSelectInbox}
                    {...keyboardNavItemProps(INBOX_NAV_ID)}
                  >
                    <span className="console-project-name-row">
                      <InboxNavIcon className="nav-icon console-project-icon" />
                      {!collapsed ? (
                        <span className="console-project-name">Inbox</span>
                      ) : null}
                    </span>
                  </button>
                </div>
              </section>
            </nav>
          ) : null}
          {collapsed ? (
            <ul className="console-project-list" role="list">
              {groups.flatMap((group) =>
                group.projects.map((project) => (
                  <li key={project.id}>{renderProjectRow(project)}</li>
                )),
              )}
            </ul>
          ) : (
            <ul className="console-project-groups overview-grouped-list" role="list">
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
                    dragInsertBeforeKey={dragInsertBeforeKey}
                    onDragInsertBeforeKey={
                      canReorder ? setDragInsertBeforeKey : undefined
                    }
                    onListDragEnd={canReorder ? handleProjectDragEnd : undefined}
                    listDrag={
                      canReorder
                        ? {
                            appendOrderKey: projectGroupAppendOrderKey(
                              group.status,
                            ),
                            isActive: isProjectListDragActive,
                            onDrop: (dataTransfer) => {
                              const payload =
                                readProjectDragPayload(dataTransfer);
                              handleProjectDragEnd();
                              if (!payload) return;
                              handleProjectReorder(
                                resolveProjectDropOnGroupAppend({
                                  payload,
                                  status: group.status,
                                }),
                              );
                            },
                          }
                        : undefined
                    }
                  >
                    {group.projects.map((project) => (
                      <li
                        key={project.id}
                        className={
                          dragInsertBeforeKey === projectOrderKey(project.id)
                            ? "console-project-row-item console-project-row-item--insert-before"
                            : "console-project-row-item"
                        }
                        onDragOver={
                          canReorder
                            ? (event: DragEvent<HTMLLIElement>) => {
                                if (
                                  !isProjectListDragActive(event.dataTransfer)
                                ) {
                                  return;
                                }
                                event.preventDefault();
                                event.stopPropagation();
                                event.dataTransfer.dropEffect = "move";
                                setDragInsertBeforeKey(
                                  projectOrderKey(project.id),
                                );
                              }
                            : undefined
                        }
                        onDrop={
                          canReorder
                            ? (event: DragEvent<HTMLLIElement>) => {
                                event.preventDefault();
                                event.stopPropagation();
                                const payload = readProjectDragPayload(
                                  event.dataTransfer,
                                );
                                handleProjectDragEnd();
                                if (!payload) return;
                                const request = resolveProjectDropBeforeProject(
                                  {
                                    payload,
                                    targetProject: project,
                                  },
                                );
                                if (request) handleProjectReorder(request);
                              }
                            : undefined
                        }
                      >
                        {renderProjectRow(project)}
                      </li>
                    ))}
                  </StatusGroupSection>
                );
              })}
            </ul>
          )}
          </div>
        </div>
      </div>
    </aside>
  );
}
