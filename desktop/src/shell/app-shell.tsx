import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  ChromeHeaderProvider,
  ClientLinkProvider,
  MentionNavigationProvider,
  CommandPaletteProvider,
  CommandPaletteView,
  ComposeModal,
  EntityHeaderActionsShell,
  HistoryEntryIcon,
  ListKeyboardNavigationProvider,
  MentionCatalogProvider,
  EMPTY_MENTION_CATALOG,
  mergeMentionCatalogs,
  ProductAppShell,
  ProductSidebar,
  ResizableContextPanel,
  SettingsSidePanelNavView,
  BreadcrumbChromeSkeleton,
  buildDocumentFoldersByTarget,
  buildDocumentTree,
  buildAssigneeDropdownOptions,
  buildProjectDropdownOptions,
  contactMatchesSlug,
  findDocumentTreeNodeById,
  getContactsHref,
  getContentSidePanelWidthKey,
  getInboxTaskRouteHref,
  getKnowledgeHref,
  getLettersHref,
  getOrganizationsHref,
  getProjectDocumentHref,
  getProjectRouteParamFromPathname,
  getProjectRouteScopeFromPathname,
  getScopedProjectDocumentHref,
  getScopedProjectLetterHref,
  getScopedProjectTaskHref,
  getSelectedContactSlugFromPathname,
  getSelectedOrganizationSlugFromPathname,
  getTodayJournalDateSlug,
  isContactSectionPath,
  isEmailPath,
  getEmailComposeHref,
  isFinanceSectionPath,
  isInboxPath,
  isInboxPanelPath,
  isCalendarListPath,
  defaultNewMeetingTimes,
  getCalendarMeetingOverlayHref,
  unscheduledCalendarTasks,
  buildInboxEmailListItem,
  emailBelongsInInbox,
  sortInboxItemsByAttentionStatus,
  type InboxListItem,
  isJournalHabitsPath,
  isJournalSectionPath,
  isKnowledgeSectionPath,
  isLettersSectionPath,
  isOrganizationSectionPath,
  isProjectDocumentsSectionPath,
  isProjectLettersSectionPath,
  isSettingsPath,
  organizationMatchesSlug,
  parseNavigationTrailPath,
  resolveHistoryEntryDisplay,
  shouldHandleGlobalShortcut,
  shouldShowContentSidePanel,
  refreshOpenTabTaskStatuses,
  resolveProductTabTaskMeta,
  syncActiveTabTaskMeta,
  syncActiveTabToPath,
  useBlockBrowserTabFocus,
  useChromeHeader,
  useCommandPalette,
  useComposeShortcut,
  useContentSidePanelToggleShortcut,
  useDocumentTreeCreateFolderShortcut,
  useEscapeBackNavigation,
  useListBoardViewShortcuts,
  installSelectAllShortcutListeners,
  installClearSelectionShortcutListeners,
  useNavigationHistory,
  RegisterPageTitleProvider,
  useNavigationShortcuts,
  useFinanceNavigationShortcuts,
  useSectionTabShortcuts,
  useSettingsShortcut,
  useTabShortcuts,
  useTaskPropertyDropdownShortcuts,
  useContentPreviewScrollShortcuts,
  COMPOSE_KNOWLEDGE_BASE_VALUE,
  createProductTab,
  primeTabTitle,
  type ProductSidebarRecentPage,
  type ProductTabsState,
  type TreeReorderRequest,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import { useAgentMail } from "../lib/agentmail-context";
import { buildMailboxByIdMap } from "../lib/email-list-tasks";
import { dispatchEmailListPatch } from "../lib/use-agentmail-mailboxes";
import {
  buildDocumentLinkOptions,
  buildEmailLinkOptions,
} from "../lib/task-link-picker-options";
import {
  isTaskAgentWorkingForUi,
  renderTaskAgentTitleTrailing,
} from "../lib/agent/agent-list-indicators";
import { useDesktopAgentStatusOptional } from "../lib/agent/agent-status-context";
import { useCommandPaletteSearchFn } from "../lib/command-palette-search";
import {
  getDefaultAssigneeId,
  syncDefaultAssigneeIdFromSettings,
} from "../lib/default-assignee";
import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { warmTodayJournalEntry } from "../lib/prefetch-workspace-content";
import { JournalSelectionProvider } from "../lib/journal-selection-context";
import { buildMentionCatalogFromEmailMessages, buildMentionCatalogFromWorkspace } from "../lib/mention-catalog";
import { CursorCreditsUsageBar } from "../components/cursor-credits-usage-bar";
import { DesktopStatusBar } from "../components/desktop-status-bar";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import { useAgentAttentionNotifications } from "../lib/agent/use-agent-attention-notifications";
import { useComposeGlobalShortcut } from "../lib/use-compose-global-shortcut";
import { useCommandPaletteGlobalShortcut } from "../lib/use-command-palette-global-shortcut";
import { useTauriWindowFullscreen } from "../lib/use-tauri-window-fullscreen";
import {
  projectNavFromLocationState,
  rememberProjectNavFrom,
  resolveProjectNavFromForPath,
  resolveSidebarActivePathname,
} from "../lib/project-type-cache";
import { DesktopOverlayMainNavigationListener } from "../components/desktop-overlay-main-navigation-listener";
import { ExternalOpenHrefListener } from "../components/external-open-href-listener";
import { DesktopClerkProfileBridge } from "./app-shell-clerk";
import { DesktopClientLink, RouterLink } from "./app-shell-links";
import {
  DesktopCalendarTasksSidePanel,
  DesktopContactsSidePanel,
  DesktopFinanceSidePanel,
  DesktopHabitSidePanel,
  DesktopInboxSidePanel,
  DesktopJournalSidePanel,
  DesktopKnowledgeSidePanel,
  DesktopLettersSidePanel,
  DesktopOrganizationsSidePanel,
  DesktopProjectDocumentsSidePanel,
} from "./app-shell-side-panels";
import { loadTabsState, TABS_STORAGE_KEY } from "./app-shell-tabs";

function AppShellInner({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { open: commandPaletteOpen, openSearch, openGo, openFinanceGo, setOpen, mode } =
    useCommandPalette();
  const searchFn = useCommandPaletteSearchFn();
  const chromeHeader = useChromeHeader();
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const agentStatus = useDesktopAgentStatusOptional();
  useAgentAttentionNotifications(workspace.allTasks);
  const settingsPage = isSettingsPath(location.pathname);
  const [tabsState, setTabsState] = useState<ProductTabsState>(() =>
    loadTabsState(location.pathname),
  );
  // Sync the active tab href during render (not in an effect) so child
  // RegisterPageTitle effects run afterward and keep the real entity title.
  // Matching the legacy TabsProvider pattern avoids the child→parent effect
  // order that was overwriting project/task names with "Projects"/"Project".
  const [tabsPathname, setTabsPathname] = useState(location.pathname);
  if (location.pathname !== tabsPathname) {
    setTabsPathname(location.pathname);
    setTabsState((current) =>
      syncActiveTabToPath(current, location.pathname),
    );
  }
  const [composeOpen, setComposeOpen] = useState(false);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const windowFullscreen = useTauriWindowFullscreen();
  const [defaultAssigneeId, setDefaultAssigneeIdState] = useState<string | null>(
    () => getDefaultAssigneeId(),
  );
  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    workspace.organizations,
  );

  // Warm today's journal as soon as workspace metadata is ready so the first
  // nav to Journal is a cache hit (same class of work Knowledge already skips).
  const todayJournalSlug = getTodayJournalDateSlug();
  const todayJournalDocumentId =
    workspace.journalDocumentIdsByDate[todayJournalSlug] ?? null;
  useEffect(() => {
    if (!workspace.ready) return;
    warmTodayJournalEntry(client, {
      dateSlug: todayJournalSlug,
      documentId: todayJournalDocumentId,
    });
  }, [client, todayJournalDocumentId, todayJournalSlug, workspace.ready]);

  useEffect(() => {
    if (!workspace.ready) return;
    void workspace.reloadHabits().catch(() => {
      // Rollover runs again when Habit Tracker is opened.
    });
  }, [todayJournalSlug, workspace.ready, workspace.reloadHabits]);

  useEffect(() => {
    let cancelled = false;
    void client
      .requestJson<{ settings: Record<string, unknown> }>("/api/v1/settings")
      .then((body) => {
        if (cancelled) return;
        setDefaultAssigneeIdState(
          syncDefaultAssigneeIdFromSettings(body.settings),
        );
      })
      .catch(() => {
        // keep local cache
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  useEffect(() => {
    const stored = localStorage.getItem("backsteros:sidebar-visible");
    if (stored === null) return;
    const frame = requestAnimationFrame(() =>
      setSidebarCollapsed(stored === "false"),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    installSelectAllShortcutListeners();
    installClearSelectionShortcutListeners();
  }, []);

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("backsteros:sidebar-visible", String(!next));
      return next;
    });
  }, []);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key !== "[") {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }
      if (!shouldHandleGlobalShortcut(event)) {
        return;
      }
      event.preventDefault();
      toggleSidebarCollapsed();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [toggleSidebarCollapsed]);

  const closePalette = useCallback(() => setOpen(false), [setOpen]);
  const navigateTo = useCallback(
    (href: string) => {
      navigate(href);
    },
    [navigate],
  );

  const activeTab = tabsState.tabs.find(
    (tab) => tab.id === tabsState.activeTabId,
  );
  const tabIds = useMemo(
    () => tabsState.tabs.map((tab) => tab.id),
    [tabsState.tabs],
  );
  const history = useNavigationHistory({
    pathname: location.pathname,
    search: location.search,
    onNavigate: navigateTo,
    activeTabId: tabsState.activeTabId,
    activeTabHref: activeTab?.href ?? location.pathname,
    tabIds,
  });

  const updateActiveTabTitle = useCallback((title: string) => {
    setTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, title } : tab,
      ),
    }));
  }, []);
  const updateActiveTabIcon = useCallback((icon: string | null) => {
    setTabsState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) =>
        tab.id === current.activeTabId ? { ...tab, icon } : tab,
      ),
    }));
  }, []);

  useComposeShortcut({
    enabled: true,
    commandPaletteOpen,
    onCompose: () => setComposeOpen(true),
  });

  useComposeGlobalShortcut({
    enabled: true,
    commandPaletteOpen,
    onCompose: () => setComposeOpen(true),
  });

  useEffect(() => {
    function onOpenCompose() {
      if (commandPaletteOpen) return;
      setComposeOpen(true);
    }
    window.addEventListener("backsteros:open-compose", onOpenCompose);
    return () =>
      window.removeEventListener("backsteros:open-compose", onOpenCompose);
  }, [commandPaletteOpen]);

  useCommandPaletteGlobalShortcut({
    enabled: true,
    onOpenPalette: openSearch,
  });

  useNavigationShortcuts({
    enabled: true,
    commandPaletteOpen,
    commandPaletteMode: mode,
    openGo,
    openFinanceGo,
    closePalette,
    onNavigate: navigateTo,
  });

  useFinanceNavigationShortcuts({
    enabled: true,
    pathname: location.pathname,
    commandPaletteOpen,
    commandPaletteMode: mode,
    openFinanceGo,
    closePalette,
    onNavigate: navigateTo,
  });

  useSettingsShortcut({
    enabled: true,
    commandPaletteOpen,
    closePalette,
    onNavigate: navigateTo,
  });

  useSectionTabShortcuts({
    enabled: true,
    pathname: location.pathname,
    search: location.search,
    commandPaletteOpen,
    onNavigate: navigateTo,
  });

  useListBoardViewShortcuts({
    enabled: true,
    pathname: location.pathname,
    search: location.search,
    commandPaletteOpen,
    onNavigate: navigateTo,
  });

  useTaskPropertyDropdownShortcuts({
    commandPaletteOpen,
    pathname: location.pathname,
  });

  useContentPreviewScrollShortcuts();
  useBlockBrowserTabFocus({ enabled: true });

  useEscapeBackNavigation({
    enabled: true,
    pathname: location.pathname,
    commandPaletteOpen,
    canGoBack: history.canGoBack,
    onGoBack: history.goBack,
  });

  const composeProjects = useMemo(
    () =>
      workspace.projects.map((project) => ({
        id: project.id,
        key: project.key,
        name: project.name,
        icon: project.icon ?? null,
        type: project.type ?? null,
        color: null,
        dueDate: project.dueDate ? new Date(project.dueDate) : null,
      })),
    [workspace.projects],
  );

  const paletteEntityNames = useMemo(() => {
    const projectParam = getProjectRouteParamFromPathname(location.pathname);
    const project = projectParam
      ? workspace.projects.find(
          (entry) =>
            entry.key.toLowerCase() === projectParam.toLowerCase() ||
            entry.id === projectParam,
        )
      : null;
    const contactSlug = getSelectedContactSlugFromPathname(location.pathname);
    const contact = contactSlug
      ? workspace.contacts.find((entry) =>
          contactMatchesSlug(entry, contactSlug),
        )
      : null;
    const orgSlug = getSelectedOrganizationSlugFromPathname(location.pathname);
    const organization = orgSlug
      ? workspace.organizations.find((entry) =>
          organizationMatchesSlug(entry, orgSlug),
        )
      : null;
    return {
      projectName: project?.name ?? null,
      contactName: contact?.name ?? null,
      organizationName: organization?.name ?? null,
    };
  }, [
    location.pathname,
    workspace.contacts,
    workspace.organizations,
    workspace.projects,
  ]);

  const resolvePaletteContextIds = useCallback(
    (context: {
      kind: string;
      projectRouteParam?: string;
      contactRouteParam?: string;
      organizationRouteParam?: string;
    } | null) => {
      if (!context) {
        return {
          projectId: null as string | null,
          contactId: null as string | null,
          organizationId: null as string | null,
        };
      }
      if (context.kind === "project" && context.projectRouteParam) {
        const project = workspace.projects.find(
          (entry) =>
            entry.key.toLowerCase() ===
              context.projectRouteParam!.toLowerCase() ||
            entry.id === context.projectRouteParam,
        );
        return {
          projectId: project?.id ?? null,
          contactId: null,
          organizationId: null,
        };
      }
      if (context.kind === "contact" && context.contactRouteParam) {
        const contact = workspace.contacts.find((entry) =>
          contactMatchesSlug(entry, context.contactRouteParam!),
        );
        return {
          projectId: null,
          contactId: contact?.id ?? null,
          organizationId: null,
        };
      }
      if (context.kind === "organization" && context.organizationRouteParam) {
        const organization = workspace.organizations.find((entry) =>
          organizationMatchesSlug(entry, context.organizationRouteParam!),
        );
        return {
          projectId: null,
          contactId: null,
          organizationId: organization?.id ?? null,
        };
      }
      return { projectId: null, contactId: null, organizationId: null };
    },
    [workspace.contacts, workspace.organizations, workspace.projects],
  );

  const composeContacts = useMemo(
    () => withAvatarSrc(workspace.contacts, contactAvatarSrc),
    [contactAvatarSrc, workspace.contacts],
  );

  const sidePanelOrganizations = useMemo(
    () => withAvatarSrc(workspace.organizations, organizationAvatarSrc),
    [organizationAvatarSrc, workspace.organizations],
  );

  const documentFoldersByTarget = useMemo(
    () =>
      buildDocumentFoldersByTarget(
        [
          ...workspace.knowledgeDocuments.map((document) => ({
            path: document.path ?? "",
            title: document.title,
            kind: document.kind ?? "document",
            type: "knowledge",
            projectId: null,
          })),
          ...workspace.projectDocuments.map((document) => ({
            path: document.path ?? "",
            title: document.title,
            kind: document.kind ?? "document",
            type: "project",
            projectId: document.projectId ?? null,
          })),
        ],
        workspace.projects,
        COMPOSE_KNOWLEDGE_BASE_VALUE,
      ),
    [
      workspace.knowledgeDocuments,
      workspace.projectDocuments,
      workspace.projects,
    ],
  );

  // Keep the active tab's task id/status so product tabs show status icons
  // (and working pulse) instead of the generic tasks glyph. Inbox stays on
  // the section glyph, so clear any leftover task meta there.
  useEffect(() => {
    if (isInboxPath(location.pathname)) {
      setTabsState((current) =>
        syncActiveTabTaskMeta(current, {
          taskId: null,
          taskStatus: null,
        }),
      );
      return;
    }
    const meta = resolveProductTabTaskMeta(
      { id: "active", href: location.pathname, title: "" },
      workspace.allTasks,
    );
    setTabsState((current) =>
      syncActiveTabTaskMeta(current, {
        taskId: meta.taskId,
        taskStatus: meta.taskStatus,
      }),
    );
  }, [location.pathname, workspace.allTasks]);

  // Background tabs: refresh stored status from live workspace data.
  useEffect(() => {
    const statusByTaskId = new Map(
      workspace.allTasks.map((task) => [task.id, task.status] as const),
    );
    setTabsState((current) =>
      refreshOpenTabTaskStatuses(current, statusByTaskId),
    );
  }, [workspace.allTasks]);

  useEffect(() => {
    const payload = JSON.stringify(tabsState);
    try {
      window.localStorage.setItem(TABS_STORAGE_KEY, payload);
      return;
    } catch (error) {
      const isQuota =
        error instanceof DOMException &&
        (error.name === "QuotaExceededError" ||
          error.name === "NS_ERROR_DOM_QUOTA_REACHED");
      if (!isQuota) return;

      // Agent chat transcripts are the usual quota fillers; drop them so
      // chrome prefs (tabs) can still persist and the shell stays mounted.
      try {
        const keys: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (
            key &&
            (key.startsWith("backsteros-desktop.agent-chat-transcript.") ||
              key.startsWith("backsteros-development.agent-chat-transcript."))
          ) {
            keys.push(key);
          }
        }
        for (const key of keys) {
          window.localStorage.removeItem(key);
        }
        window.localStorage.setItem(TABS_STORAGE_KEY, payload);
      } catch {
        /* ignore — prefer a live shell over persisted tabs */
      }
    }
  }, [tabsState]);

  const activateTab = useCallback(
    (tabId: string) => {
      const tab = tabsState.tabs.find((entry) => entry.id === tabId);
      if (!tab) return;
      setTabsState((current) => ({ ...current, activeTabId: tabId }));
      if (tab.href !== location.pathname) {
        navigate(tab.href);
      }
    },
    [location.pathname, navigate, tabsState.tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      setTabsState((current) => {
        if (current.tabs.length <= 1) {
          return current;
        }
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) {
          return current;
        }
        const nextTabs = current.tabs.filter((tab) => tab.id !== tabId);
        const closingActive = current.activeTabId === tabId;
        const nextActive =
          closingActive
            ? (nextTabs[Math.max(0, index - 1)] ?? nextTabs[0])!
            : current.tabs.find((tab) => tab.id === current.activeTabId)!;
        if (closingActive) {
          queueMicrotask(() => navigate(nextActive.href));
        }
        return {
          tabs: nextTabs,
          activeTabId: closingActive ? nextActive.id : current.activeTabId,
        };
      });
    },
    [navigate],
  );

  const openNewTab = useCallback(() => {
    const tab = createProductTab("/inbox");
    setTabsState((current) => ({
      tabs: [...current.tabs, tab],
      activeTabId: tab.id,
    }));
    navigate(tab.href);
  }, [navigate]);

  const activatePreviousTab = useCallback(() => {
    setTabsState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const previous =
        current.tabs[(index - 1 + current.tabs.length) % current.tabs.length]!;
      queueMicrotask(() => navigate(previous.href));
      return { ...current, activeTabId: previous.id };
    });
  }, [navigate]);

  const activateNextTab = useCallback(() => {
    setTabsState((current) => {
      if (current.tabs.length <= 1) return current;
      const index = current.tabs.findIndex(
        (tab) => tab.id === current.activeTabId,
      );
      if (index < 0) return current;
      const next = current.tabs[(index + 1) % current.tabs.length]!;
      queueMicrotask(() => navigate(next.href));
      return { ...current, activeTabId: next.id };
    });
  }, [navigate]);

  useTabShortcuts({
    enabled: true,
    activeTabId: tabsState.activeTabId,
    openNewTab,
    closeTab,
    activatePreviousTab,
    activateNextTab,
  });

  const pathname = location.pathname;
  const navigationTrail = parseNavigationTrailPath(pathname);
  const panelHref = navigationTrail?.sourceHref ?? pathname;
  const panelUrl = new URL(panelHref, "http://local.invalid");
  const panelPathname = panelUrl.pathname;
  const panelSearch =
    panelUrl.search ||
    (panelPathname === pathname ? location.search : "");
  const agentMail = useAgentMail();

  const inboxItemsWithEmail = useMemo(() => {
    const mailboxById = buildMailboxByIdMap(agentMail.mailboxes);
    const emailItems: InboxListItem[] = agentMail.messages
      .filter((item) =>
        emailBelongsInInbox({
          status: item.status,
          dueDate: item.dueDate,
        }),
      )
      .map((item) => {
        const mailbox = mailboxById.get(item.inboxId) ?? null;
        return buildInboxEmailListItem({
        inboxId: item.inboxId,
        messageId: item.id,
        threadId: item.threadId,
        title: item.subject,
        from: item.from,
        status: item.status,
        priority: item.priority,
        dueDate: item.dueDate,
        updatedAt: item.receivedAt,
        assigneeId: item.assigneeId,
        projectId: item.projectId,
        projectKey: item.projectKey,
        projectName: item.projectName,
        organizationId: item.organizationId,
        organizationName: item.organizationName,
        contactId: item.contactId,
        contactName: item.contactName,
        emailThreadId: item.emailThreadId,
        number: item.number,
        displayId: item.displayId,
        mailboxLabel: mailbox
          ? mailbox.contactName?.trim() ||
            mailbox.displayName?.trim() ||
            mailbox.email ||
            mailbox.inboxId
          : null,
        mailboxAvatarSrc: mailbox?.contactId
          ? contactAvatarSrc[mailbox.contactId] ?? null
          : null,
        });
      });
    return sortInboxItemsByAttentionStatus([
      ...workspace.inboxItems,
      ...emailItems,
    ]);
  }, [
    agentMail.mailboxes,
    agentMail.messages,
    contactAvatarSrc,
    workspace.inboxItems,
  ]);

  const mentionCatalog = useMemo(() => {
    const base = buildMentionCatalogFromWorkspace(workspace);
    const emails = buildMentionCatalogFromEmailMessages(agentMail.messages);
    if (emails.length === 0) {
      return base;
    }
    return mergeMentionCatalogs(base, {
      ...EMPTY_MENTION_CATALOG,
      emails,
    });
  }, [
    agentMail.messages,
    workspace.allTasks,
    workspace.contacts,
    workspace.inboxItems,
    workspace.knowledgeDocuments,
    workspace.letters,
    workspace.organizations,
    workspace.projectDocuments,
    workspace.projectSummaries,
    workspace.projects,
  ]);

  const patchEmailThreadFromInbox = useCallback(
    async (
      itemId: string,
      patch: {
        status?: string;
        priority?: number;
        dueDate?: string | null;
        projectId?: string | null;
        assigneeId?: string | null;
      },
      listExtras?: {
        projectName?: string | null;
        projectKey?: string | null;
        assigneeName?: string | null;
      },
    ) => {
      const item = inboxItemsWithEmail.find(
        (entry) => entry.id === itemId && entry.kind === "email",
      );
      if (!item || item.kind !== "email") return;
      const threadKey = item.threadId?.trim() || item.messageId;
      try {
        await client.requestJson(
          `/api/v1/email/inboxes/${encodeURIComponent(item.inboxId)}/threads/${encodeURIComponent(threadKey)}/metadata`,
          {
            method: "PATCH",
            body: JSON.stringify(patch),
          },
        );
        dispatchEmailListPatch({
          inboxId: item.inboxId,
          messageId: item.messageId,
          threadId: item.threadId ?? null,
          ...(patch.status !== undefined ? { status: patch.status } : {}),
          ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
          ...(patch.dueDate !== undefined ? { dueDate: patch.dueDate } : {}),
          ...(patch.projectId !== undefined
            ? { projectId: patch.projectId }
            : {}),
          ...(patch.assigneeId !== undefined
            ? { assigneeId: patch.assigneeId }
            : {}),
          ...(listExtras?.projectName !== undefined
            ? { projectName: listExtras.projectName }
            : {}),
          ...(listExtras?.projectKey !== undefined
            ? { projectKey: listExtras.projectKey }
            : {}),
          ...(listExtras?.assigneeName !== undefined
            ? { assigneeName: listExtras.assigneeName }
            : {}),
        });
      } catch (error) {
        console.warn("[inbox] email metadata patch failed:", error);
      }
    },
    [client, inboxItemsWithEmail],
  );

  const projectRouteParam = getProjectRouteParamFromPathname(panelPathname);
  const projectRouteScope = getProjectRouteScopeFromPathname(panelPathname);
  const activeProject = projectRouteParam
    ? workspace.projects.find(
        (project) =>
          project.id === projectRouteParam ||
          project.key.toLowerCase() === projectRouteParam.toLowerCase(),
      ) ?? null
    : null;

  // Codebase Docs live in the workbench list pane — hide the chrome documents
  // side panel so we don't stack two document trees.
  const showSidePanel =
    !settingsPage &&
    shouldShowContentSidePanel(panelPathname, panelSearch) &&
    !(
      activeProject?.type === "codebase" &&
      isProjectDocumentsSectionPath(panelPathname)
    );

  useContentSidePanelToggleShortcut({
    enabled: showSidePanel,
    onToggle: () => setSidePanelCollapsed((current) => !current),
  });

  useDocumentTreeCreateFolderShortcut({
    pathname: panelPathname,
    enabled: true,
  });

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

  const projectDocumentsForPanel = useMemo(() => {
    if (!activeProject) return [];
    return workspace.projectDocuments.filter(
      (document) => document.projectId === activeProject.id,
    );
  }, [activeProject, workspace.projectDocuments]);

  const projectLettersForPanel = useMemo(() => {
    if (!activeProject) return [];
    return workspace.letters.filter(
      (letter) =>
        letter.projectId === activeProject.id ||
        (letter.projectKey &&
          letter.projectKey.toLowerCase() === activeProject.key.toLowerCase()),
    );
  }, [activeProject, workspace.letters]);

  const inboxProjectOptions = useMemo(
    () =>
      buildProjectDropdownOptions(
        workspace.projects.map((project) => ({
          key: project.key,
          name: project.name,
          icon: project.icon,
          type: project.type,
        })),
        { includeNone: true },
      ),
    [workspace.projects],
  );

  const inboxAssigneeOptions = useMemo(
    () => buildAssigneeDropdownOptions(composeContacts),
    [composeContacts],
  );

  const allTasksById = useMemo(() => {
    const map = new Map<string, (typeof workspace.allTasks)[number]>();
    for (const task of workspace.allTasks) {
      map.set(task.id, task);
    }
    return map;
  }, [workspace.allTasks]);

  const calendarSidePanelTasks = useMemo(
    () => unscheduledCalendarTasks(workspace.tasks),
    [workspace.tasks],
  );

  let sidePanelBody: ReactNode = null;
  if (showSidePanel) {
    if (isInboxPanelPath(panelPathname, panelSearch)) {
      sidePanelBody = (
        <DesktopInboxSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={inboxItemsWithEmail}
          loading={!workspace.ready && agentMail.loading}
          Link={RouterLink}
          onCreateTask={(title) => workspace.createInboxTask({ title })}
          onComposeEmail={() => navigateTo(getEmailComposeHref({ inboxList: true }))}
          onCreatedTask={(taskId) => {
            const item = inboxItemsWithEmail.find(
              (entry) => entry.id === taskId && entry.kind === "task",
            );
            const taskTitle =
              item && item.kind === "task" ? item.title : null;
            if (item && item.kind === "task" && item.number != null) {
              const href = getInboxTaskRouteHref({ number: item.number });
              if (taskTitle) primeTabTitle(href, taskTitle);
              navigate(href);
              return;
            }
            const href = `/inbox/${taskId}`;
            if (taskTitle) primeTabTitle(href, taskTitle);
            navigate(href);
          }}
          projectOptions={inboxProjectOptions}
          assigneeOptions={inboxAssigneeOptions}
          onPriorityChange={(itemId, priority) => {
            const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
            if (item?.kind === "email") {
              void patchEmailThreadFromInbox(itemId, { priority });
              return;
            }
            void workspace.patchTask(itemId, { priority });
          }}
          onDueDateChange={(itemId, dueDate) => {
            const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
            if (item?.kind === "email") {
              void patchEmailThreadFromInbox(itemId, {
                dueDate: dueDate ? dueDate.toISOString() : null,
              });
              return;
            }
            void workspace.patchTask(itemId, {
              dueDate: dueDate ? dueDate.toISOString() : null,
            });
          }}
          onProjectChange={(itemId, projectKey) => {
            const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
            const project = projectKey
              ? workspace.projects.find((entry) => entry.key === projectKey) ??
                null
              : null;
            if (item?.kind === "email") {
              void patchEmailThreadFromInbox(
                itemId,
                { projectId: project?.id ?? null },
                {
                  projectName: project?.name ?? null,
                  projectKey: project?.key ?? null,
                },
              );
              return;
            }
            void workspace.patchTask(itemId, {
              projectId: project?.id ?? null,
              inbox: !project,
              ...(project ? {} : { status: "triage" }),
            });
          }}
          onAssigneeChange={(itemId, assigneeId) => {
            const item = inboxItemsWithEmail.find((entry) => entry.id === itemId);
            if (item?.kind === "email") {
              const assignee = assigneeId
                ? workspace.contacts.find((entry) => entry.id === assigneeId) ??
                  null
                : null;
              void patchEmailThreadFromInbox(
                itemId,
                { assigneeId },
                { assigneeName: assignee?.name ?? null },
              );
              return;
            }
            void workspace.patchTask(itemId, { assigneeId });
          }}
          groupByAttentionStatus
          renderTitleTrailing={(item) => {
            if (item.kind !== "task") return null;
            const task = allTasksById.get(item.id);
            return renderTaskAgentTitleTrailing({
              taskId: item.id,
              agentChatId: task?.agentChatId,
              taskStatus: task?.status,
              agentStatus,
            });
          }}
        />
      );
    } else if (isCalendarListPath(panelPathname)) {
      sidePanelBody = (
        <DesktopCalendarTasksSidePanel
          meetings={workspace.meetings}
          tasks={calendarSidePanelTasks}
          loading={!workspace.ready}
          onCreateMeeting={() => {
            const { startAt, endAt } = defaultNewMeetingTimes();
            void workspace
              .createMeeting({ title: "New meeting", startAt, endAt })
              .then((created) => {
                navigateTo(getCalendarMeetingOverlayHref(created.id));
              });
          }}
          onMeetingOpen={(meetingId) =>
            navigateTo(getCalendarMeetingOverlayHref(meetingId))
          }
          onTaskOpen={(taskId) => navigateTo(`/calendar/tasks/${taskId}`)}
        />
      );
    } else if (isJournalHabitsPath(panelPathname)) {
      sidePanelBody = (
        <DesktopHabitSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
        />
      );
    } else if (isJournalSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopJournalSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.journalItems}
        />
      );
    } else if (isKnowledgeSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopKnowledgeSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.knowledgeDocuments}
          loading={!workspace.ready}
          onAdd={(parentFolderId) => {
            void workspace
              .createKnowledgeDocument({
                title: "Untitled",
                parentId: parentFolderId,
              })
              .then((created) => {
                navigate(getKnowledgeHref(created.path || created.id));
              });
          }}
          onCreateFolder={async ({ title, parentId }) => {
            try {
              await workspace.createKnowledgeFolder({ title, parentId });
              return { ok: true };
            } catch (error) {
              return {
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not create folder.",
              };
            }
          }}
          onRename={(id, title) => workspace.renameDocument(id, title)}
          onDelete={(id) => workspace.deleteDocument(id)}
          onReorderTreeItem={(request: TreeReorderRequest) => {
            const tree = buildDocumentTree(
              workspace.knowledgeDocuments.map((item) => ({
                id: item.id,
                title: item.title,
                path: item.path ?? item.id,
                kind:
                  item.kind === "folder"
                    ? ("folder" as const)
                    : ("document" as const),
                parentId: item.parentId ?? null,
                sortOrder: item.sortOrder ?? 0,
                icon: item.icon ?? null,
              })),
            );
            void (async () => {
              if (request.fromParentId !== request.toParentId) {
                await workspace.moveDocument(
                  request.itemId,
                  request.toParentId,
                );
                return;
              }
              const parent =
                request.toParentId === null
                  ? null
                  : findDocumentTreeNodeById(tree, request.toParentId);
              const siblings =
                parent === null
                  ? tree
                  : parent.type === "folder"
                    ? parent.children
                    : [];
              const ids = siblings
                .filter((node) => node.id !== request.itemId)
                .map((node) => node.id);
              const insertAt = request.beforeId
                ? ids.indexOf(request.beforeId)
                : -1;
              if (insertAt === -1) ids.push(request.itemId);
              else ids.splice(insertAt, 0, request.itemId);
              await workspace.reorderDocuments(ids);
            })();
          }}
        />
      );
    } else if (isProjectDocumentsSectionPath(panelPathname) && activeProject) {
      const projectKey = activeProject.key;
      sidePanelBody = (
        <DesktopProjectDocumentsSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={projectDocumentsForPanel}
          getDocumentHref={(pathOrId) =>
            getScopedProjectDocumentHref(projectKey, pathOrId, projectRouteScope)
          }
          onAdd={(parentFolderId) => {
            void workspace
              .createProjectDocument({
                projectId: activeProject.id,
                title: "Untitled",
                parentId: parentFolderId,
              })
              .then((created) => {
                navigate(
                  getScopedProjectDocumentHref(
                    projectKey,
                    created.path || created.id,
                    projectRouteScope,
                  ),
                );
              });
          }}
          onCreateFolder={async ({ title, parentId }) => {
            try {
              await workspace.createProjectFolder({
                projectId: activeProject.id,
                title,
                parentId,
              });
              return { ok: true };
            } catch (error) {
              return {
                ok: false,
                error:
                  error instanceof Error
                    ? error.message
                    : "Could not create folder.",
              };
            }
          }}
          onRename={(id, title) => workspace.renameDocument(id, title)}
          onDelete={(id) => workspace.deleteDocument(id)}
          onReorderTreeItem={(request: TreeReorderRequest) => {
            const tree = buildDocumentTree(
              projectDocumentsForPanel.map((item) => ({
                id: item.id,
                title: item.title,
                path: item.path ?? item.id,
                kind:
                  item.kind === "folder"
                    ? ("folder" as const)
                    : ("document" as const),
                parentId: item.parentId ?? null,
                sortOrder: item.sortOrder ?? 0,
                icon: item.icon ?? null,
              })),
            );
            void (async () => {
              if (request.fromParentId !== request.toParentId) {
                await workspace.moveDocument(
                  request.itemId,
                  request.toParentId,
                );
                return;
              }
              const parent =
                request.toParentId === null
                  ? null
                  : findDocumentTreeNodeById(tree, request.toParentId);
              const siblings =
                parent === null
                  ? tree
                  : parent.type === "folder"
                    ? parent.children
                    : [];
              const ids = siblings
                .filter((node) => node.id !== request.itemId)
                .map((node) => node.id);
              const insertAt = request.beforeId
                ? ids.indexOf(request.beforeId)
                : -1;
              if (insertAt === -1) ids.push(request.itemId);
              else ids.splice(insertAt, 0, request.itemId);
              await workspace.reorderDocuments(ids);
            })();
          }}
        />
      );
    } else if (isProjectLettersSectionPath(panelPathname) && activeProject) {
      const projectKey = activeProject.key;
      sidePanelBody = (
        <DesktopLettersSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={projectLettersForPanel}
          loading={!workspace.ready}
          getLetterHref={(letter) =>
            getScopedProjectLetterHref(projectKey, letter.number, projectRouteScope)
          }
          onAdd={() => {
            void workspace
              .createLetter({
                title: "New letter",
                projectId: activeProject.id,
              })
              .then((created) => {
                if (created.number == null) return;
                const href = getScopedProjectLetterHref(
                  projectKey,
                  created.number,
                  projectRouteScope,
                );
                primeTabTitle(href, "New letter");
                navigate(href);
              });
          }}
        />
      );
    } else if (isLettersSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopLettersSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={workspace.letters}
          loading={!workspace.ready}
          onAdd={() => {
            void workspace
              .createLetter({ title: "New letter" })
              .then((created) => {
                if (created.number == null) return;
                const href = getLettersHref(created.number);
                primeTabTitle(href, "New letter");
                navigate(href);
              });
          }}
        />
      );
    } else if (isContactSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopContactsSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={composeContacts}
          Link={RouterLink}
          onAdd={() => {
            void workspace
              .createContact({ name: "New contact" })
              .then((created) => {
                navigate(getContactsHref(created.id));
              });
          }}
        />
      );
    } else if (isOrganizationSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopOrganizationsSidePanel
          onNavigate={navigateTo}
          pathname={panelPathname}
          items={sidePanelOrganizations}
          Link={RouterLink}
          onAdd={() => {
            void workspace
              .createOrganization({ name: "New organization" })
              .then((created) => {
                navigate(getOrganizationsHref(created.id));
              });
          }}
        />
      );
    } else if (isFinanceSectionPath(panelPathname)) {
      sidePanelBody = (
        <DesktopFinanceSidePanel
          pathname={panelPathname}
          Link={RouterLink}
          collapsed={sidePanelCollapsed}
          onToggleCollapse={() =>
            setSidePanelCollapsed((current) => !current)
          }
          onExpand={() => setSidePanelCollapsed(false)}
        />
      );
    }
  }

  // Finance keeps a slim expand rail when collapsed (so it can be reopened
  // from the same spot); other sections hide the panel entirely.
  const financeSection = isFinanceSectionPath(panelPathname);
  const financeRail = financeSection && sidePanelCollapsed;

  const sidePanel =
    showSidePanel && sidePanelBody ? (
      financeRail ? (
        <aside className="context-panel context-panel--rail">
          {sidePanelBody}
        </aside>
      ) : (
        <ResizableContextPanel
          storageKey={getContentSidePanelWidthKey(panelPathname)}
        >
          {sidePanelBody}
        </ResizableContextPanel>
      )
    ) : undefined;

  const sidebar = settingsPage ? (
    <SettingsSidePanelNavView
      pathname={pathname}
      Link={RouterLink}
      onBack={() => navigate("/inbox")}
    />
  ) : (
    <DesktopClerkProfileBridge>
      {({ onAccount, onSignOut }) => (
        <ProductSidebar
          pathname={pathname}
          activePathname={sidebarActivePathname}
          Link={RouterLink}
          onBack={history.goBack}
          onForward={history.goForward}
          canGoBack={history.canGoBack}
          canGoForward={history.canGoForward}
          footer={<CursorCreditsUsageBar />}
          inboxHasItems={workspace.inboxItems.length > 0}
          recentPages={history.recentPages.map((page): ProductSidebarRecentPage => {
            const display = resolveHistoryEntryDisplay(page.href, page.title);
            return {
              id: page.href,
              href: page.href,
              title: display.title,
              badge: display.badgeLabel,
              icon: createElement(HistoryEntryIcon, {
                display,
                icon: page.icon,
              }),
            };
          })}
          onSelectRecentPage={(href) => history.navigateToHistoryEntry(href)}
          onCompose={() => {
            setComposeOpen(true);
          }}
          onAccount={onAccount}
          onSignOut={onSignOut}
        />
      )}
    </DesktopClerkProfileBridge>
  );

  return (
    <ClientLinkProvider Link={DesktopClientLink}>
    <MentionNavigationProvider pathname={location.pathname}>
    <MentionCatalogProvider catalog={mentionCatalog}>
    <ListKeyboardNavigationProvider pathname={location.pathname}>
      <DesktopOverlayMainNavigationListener />
      <ExternalOpenHrefListener />
      <RegisterPageTitleProvider
        pathname={location.pathname}
        registerPageIcon={history.registerPageIcon}
        registerPageTitle={history.registerPageTitle}
        updateActiveTabIcon={updateActiveTabIcon}
        updateActiveTabTitle={updateActiveTabTitle}
      >
      <ProductAppShell
        className={windowFullscreen ? "is-window-fullscreen" : undefined}
        sidebar={sidebar}
        sidebarCollapsed={sidebarCollapsed}
        tabs={tabsState.tabs}
        activeTabId={tabsState.activeTabId}
        onActivateTab={activateTab}
        onCloseTab={closeTab}
        onOpenNewTab={openNewTab}
        renderTabIcon={(tab) => {
          // Inbox tabs always keep the inbox glyph — status/working icons
          // are for task detail tabs elsewhere (projects, tasks, etc.).
          // Email tabs stay on the envelope until message entities exist.
          if (isInboxPath(tab.href)) {
            return createElement(HistoryEntryIcon, {
              display: {
                kind: "navigate",
                navId: "inbox",
                badgeLabel: "Inbox",
                title: tab.title,
              },
            });
          }
          if (isEmailPath(tab.href)) {
            return createElement(HistoryEntryIcon, {
              display: {
                kind: "navigate",
                navId: "email",
                badgeLabel: "Email",
                title: tab.title,
              },
            });
          }
          const meta = resolveProductTabTaskMeta(tab, workspace.allTasks);
          const working = Boolean(
            meta.taskId &&
              isTaskAgentWorkingForUi(
                { id: meta.taskId, status: meta.taskStatus },
                agentStatus,
              ),
          );
          return createElement(HistoryEntryIcon, {
            display: resolveHistoryEntryDisplay(tab.href, tab.title),
            icon: tab.icon,
            taskStatus: meta.taskStatus,
            working,
          });
        }}
        showSidePanel={
          Boolean(sidePanel) && (!sidePanelCollapsed || financeRail)
        }
        sidePanel={sidePanel}
        chromeHeader={
          chromeHeader ??
          (sidePanel ? <BreadcrumbChromeSkeleton /> : null)
        }
        statusBar={sidebarCollapsed ? null : <DesktopStatusBar />}
      >
        {children}
      </ProductAppShell>
      </RegisterPageTitleProvider>
      <CommandPaletteView
        navigate={(href) => navigate(href)}
        pathname={location.pathname}
        entityNames={paletteEntityNames}
        resolveContextIds={resolvePaletteContextIds}
        search={searchFn}
      />
      <ComposeModal
        open={composeOpen}
        onOpenChange={setComposeOpen}
        pathname={`${location.pathname}${location.search}`}
        projects={composeProjects}
        contacts={composeContacts}
        defaultAssigneeId={defaultAssigneeId}
        documentFoldersByTarget={documentFoldersByTarget}
        projectsHref="/projects"
        onNavigate={(href) => navigate(href)}
        documentLinkOptions={buildDocumentLinkOptions(workspace.documents)}
        emailLinkOptions={buildEmailLinkOptions(agentMail.messages)}
        onCreateTask={async (input) => {
          if (input.projectId) {
            const project = workspace.projects.find(
              (entry) => entry.id === input.projectId,
            );
            const created = await workspace.createProjectTask({
              projectId: input.projectId,
              title: input.title,
              description: input.description,
              status: input.status,
              priority: input.priority,
              assigneeId: input.assigneeId,
              dueDate: input.dueDate,
              links: input.links,
            });
            if (project && created.number != null) {
              const href = getScopedProjectTaskHref(
                project.key,
                created.number,
              );
              primeTabTitle(href, input.title);
              return { href };
            }
            const href = `/tasks/${created.id}`;
            primeTabTitle(href, input.title);
            return { href };
          }
          const created = await workspace.createInboxTask({
            title: input.title,
            description: input.description,
            status: input.status,
            priority: input.priority,
            assigneeId: input.assigneeId,
            dueDate: input.dueDate,
            links: input.links,
          });
          if (created.number != null) {
            const href = getInboxTaskRouteHref({ number: created.number });
            primeTabTitle(href, input.title);
            return { href };
          }
          const href = `/inbox/${created.id}`;
          primeTabTitle(href, input.title);
          return { href };
        }}
        onCreateDocument={async (input) => {
          if (input.target === "knowledge") {
            const created = await workspace.createKnowledgeDocument({
              title: input.title,
              folderPath: input.folderPath,
            });
            return {
              href: getKnowledgeHref(created.path || created.id),
            };
          }
          if (!input.projectId) {
            throw new Error("Select a project for this document.");
          }
          const project = workspace.projects.find(
            (entry) => entry.id === input.projectId,
          );
          if (!project) {
            throw new Error("Project not found.");
          }
          const created = await workspace.createProjectDocument({
            projectId: input.projectId,
            title: input.title,
            folderPath: input.folderPath,
          });
          return {
            href: getProjectDocumentHref(project.key, created.path || created.id),
          };
        }}
      />
    </ListKeyboardNavigationProvider>
    </MentionCatalogProvider>
    </MentionNavigationProvider>
    </ClientLinkProvider>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <CommandPaletteProvider>
      <EntityHeaderActionsShell>
        <ChromeHeaderProvider>
          <JournalSelectionProvider>
            <AppShellInner>{children}</AppShellInner>
          </JournalSelectionProvider>
        </ChromeHeaderProvider>
      </EntityHeaderActionsShell>
    </CommandPaletteProvider>
  );
}
