import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { getContactEmailAddresses } from "@backsteros/contracts";
import { X } from "lucide-react";

import {
  CalendarAvailabilityView,
  CalendarDateNav,
  CalendarMeetingDetailOverlay,
  CalendarMeetingsSidePanelView,
  CalendarTaskDetailOverlay,
  CalendarTimetrackingView,
  CalendarView,
  CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM,
  CALENDAR_MEETING_OVERLAY_PARAM,
  CALENDAR_MEETINGS_SIDE_PANEL_WIDTH_KEY,
  CALENDAR_PAGE_MODE_PARAM,
  CALENDAR_TASK_OVERLAY_LAYOUT_PARAM,
  CALENDAR_TASK_OVERLAY_PARAM,
  CALENDAR_TIMETRACKING_DETAIL_PANEL_WIDTH_KEY,
  CALENDAR_VIEW_MODE_PARAM,
  DEFAULT_CALENDAR_VIEW_MODE,
  buildAssigneeDropdownOptions,
  buildCalendarBreadcrumbItems,
  buildCalendarDayHabitsByDate,
  buildProjectDropdownOptions,
  calendarSidePanelMeetingItemId,
  collectTimetrackingEntries,
  ExpandLayoutIcon,
  formatMeetingBreadcrumbLabel,
  formatMeetingDisplayId,
  getSelectedCalendarGridEventId,
  getTaskDisplayId,
  getContactsHref,
  getUniqueListItemRouteParam,
  getContactSectionHref,
  getEmailComposeHref,
  getProjectTaskHref,
  isDefinedProjectArea,
  LIST_KEYBOARD_NAV_ZONE_CONTENT,
  meetingCalendarEventClassNames,
  mergeCalendarGridEvents,
  parseCalendarMeetingOverlayId,
  parseCalendarMeetingOverlayLayout,
  parseCalendarPageModeParam,
  parseCalendarTaskOverlayId,
  parseCalendarTaskOverlayLayout,
  parseCalendarViewModeParam,
  PROJECT_AREA_LABELS,
  readTimetrackingPeriodFromSearch,
  resolveTimetrackingChartPeriod,
  RegisterEntityDeleteAction,
  EntityHeaderActionsSlot,
  RegisterPageTitle,
  ResizableSidePanel,
  ProjectOcticon,
  requestOpenComposeModal,
  useListDismissDetailShortcut,
  useListKeyboardNavigationZone,
  useCalendarDateNavigationShortcuts,
  type CalendarHabitIconItem,
  type CalendarBirthdayPopoverContact,
  type CalendarMeetingOverlayLayout,
  type CalendarTaskOverlayLayout,
  type CalendarTaskPopoverTask,
  type CalendarViewMode,
  type MeetingCalendarPatch,
  type MeetingContentTab,
  type TaskCalendarPatch,
  type TaskStatus,
  type TimetrackingEntry,
} from "@backsteros/ui";

import {
  useDesktopAvatarSrcMap,
  withAvatarSrc,
} from "../lib/avatar-src";
import { TimetrackingSessionsDetail } from "../components/timetracking-sessions-detail";
import { DesktopCollapsibleRightSidePanelLayout } from "../components/desktop-journal-day-layout";
import { useMeetingSchedulingSettings } from "../lib/use-meeting-scheduling-settings";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useMeetingDetailViewProps } from "../lib/use-meeting-detail-props";
import { useMeetingContactNavigation } from "../lib/use-meeting-contact-navigation";
import { useMeetingPortalEmailActions } from "../lib/use-meeting-portal-email-actions";
import {
  useKeepAliveActive,
  useKeepAliveFrozen,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import { useDesktopWorkspaceData } from "../lib/workspace-data";
import {
  peekTaskDescriptionCache,
  useDesktopTaskDescription,
} from "../lib/use-task-description";
import {
  resetEmailComposeSession,
  writeEmailComposeSession,
} from "../lib/email-compose-session";
import { navigateToHref } from "../router/navigate-href";
import { TaskDetailPage } from "./task-detail-page";

/** Subset of FullCalendar API used for date-nav (matches UI CalendarDateNavApi). */
type CalendarDateNavApi = {
  prev: () => void;
  next: () => void;
  today?: () => void;
};

type CalendarMeetingDraft = {
  key: number;
  startAt: string;
  endAt: string;
};

function searchParamsFromSearchStr(searchStr: string): URLSearchParams {
  return new URLSearchParams(
    searchStr.startsWith("?") ? searchStr.slice(1) : searchStr,
  );
}

export function CalendarPage() {
  return <CalendarPageBody />;
}

function CalendarPageBody() {
  const { pathname, searchStr } = useShellLocation();
  const keepAliveActive = useKeepAliveActive();
  const keepAliveFrozen = useKeepAliveFrozen();
  const navigate = useNavigate();
  const searchParams = useMemo(
    () => searchParamsFromSearchStr(searchStr),
    [searchStr],
  );
  const setSearchParams = useCallback(
    (
      nextInit:
        | URLSearchParams
        | ((prev: URLSearchParams) => URLSearchParams),
      navigateOpts?: { replace?: boolean },
    ) => {
      const prev = searchParamsFromSearchStr(searchStr);
      const resolved =
        typeof nextInit === "function" ? nextInit(prev) : nextInit;
      const next =
        resolved instanceof URLSearchParams
          ? resolved
          : new URLSearchParams(resolved);
      if (next.toString() === prev.toString()) return;
      // Absolute /calendar?... so keep-alive lastHref + address bar stay in sync
      // even when TanStack's match is stale after a warm section flip.
      const query = next.toString();
      navigateToHref(navigate, query ? `/calendar?${query}` : "/calendar", {
        replace: navigateOpts?.replace ?? false,
      });
    },
    [navigate, searchStr],
  );
  const workspace = useDesktopWorkspaceData();
  const { settings, loading: settingsLoading, setWeekdayHours } =
    useMeetingSchedulingSettings();

  const openMeetingId = parseCalendarMeetingOverlayId(searchParams.toString());
  const openTaskId = parseCalendarTaskOverlayId(searchParams.toString());
  const meetingOverlayLayout = parseCalendarMeetingOverlayLayout(
    searchParams.toString(),
  );
  const taskOverlayLayout = parseCalendarTaskOverlayLayout(
    searchParams.toString(),
  );
  // Shared across panel + page overlays so expand/collapse keeps the tab.
  const [meetingContentTab, setMeetingContentTab] =
    useState<MeetingContentTab>("summary");
  useEffect(() => {
    setMeetingContentTab("summary");
  }, [openMeetingId]);
  const viewMode = parseCalendarViewModeParam(
    searchParams.get(CALENDAR_VIEW_MODE_PARAM),
  );
  const pageMode = parseCalendarPageModeParam(
    searchParams.get(CALENDAR_PAGE_MODE_PARAM),
  );
  const isAvailabilityMode = pageMode === "availability";
  const isTimetrackingMode = pageMode === "timetracking";
  const selectedTimetrackingPeriod = isTimetrackingMode
    ? readTimetrackingPeriodFromSearch(searchParams.toString(), {
        fallbackToday: true,
      })
    : null;
  const calendarApiRef = useRef<CalendarDateNavApi | null>(null);
  const frozenEventsRef = useRef<ReturnType<
    typeof mergeCalendarGridEvents
  > | null>(null);
  const frozenDayHabitsRef = useRef<ReturnType<
    typeof buildCalendarDayHabitsByDate
  > | null>(null);
  const viewedDateRef = useRef<Date | null>(null);
  const wasFrozenRef = useRef(keepAliveFrozen);
  const meetingDraftSequenceRef = useRef(0);
  const [calendarNavReady, setCalendarNavReady] = useState(false);
  const [rangeTitle, setRangeTitle] = useState("");
  const [meetingDraft, setMeetingDraft] =
    useState<CalendarMeetingDraft | null>(null);
  /** Drives open-ended / currently-active meeting blocks on the grid. */
  const [calendarNowMs, setCalendarNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!keepAliveActive || keepAliveFrozen) return;
    const tick = () => setCalendarNowMs(Date.now());
    tick();
    const id = window.setInterval(tick, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [keepAliveActive, keepAliveFrozen]);

  useEffect(() => {
    if (!keepAliveActive) {
      setMeetingDraft(null);
    }
  }, [keepAliveActive]);

  // When PowerSync is disconnected, soft-pull REST so agent/CLI creates still
  // appear. While connected, skip — SSE liveMeetingsById + PowerSync download
  // are the live path (same as documents; avoid a full list GET on every visit).
  useEffect(() => {
    if (!keepAliveActive) return;
    void workspace.softRefreshApiMeetings().catch(() => {});
  }, [keepAliveActive, workspace.softRefreshApiMeetings]);

  const contactAvatarSrc = useDesktopAvatarSrcMap(
    "contact",
    keepAliveFrozen ? [] : workspace.contacts,
  );
  const organizationAvatarSrc = useDesktopAvatarSrcMap(
    "organization",
    keepAliveFrozen ? [] : workspace.organizations,
  );

  const panelMeetings = useMemo(
    () =>
      workspace.meetings.map((meeting) =>
        meeting.organizationId
          ? {
              ...meeting,
              organizationAvatarSrc:
                organizationAvatarSrc[meeting.organizationId] ?? null,
            }
          : meeting,
      ),
    [organizationAvatarSrc, workspace.meetings],
  );

  const projectOptions = useMemo(
    () => buildProjectDropdownOptions(workspace.projects),
    [workspace.projects],
  );

  const assigneeOptions = useMemo(
    () =>
      buildAssigneeDropdownOptions(
        withAvatarSrc(workspace.contacts, contactAvatarSrc),
      ),
    [contactAvatarSrc, workspace.contacts],
  );

  const handleCalendarApi = useCallback((api: CalendarDateNavApi | null) => {
    calendarApiRef.current = api;
    const ready = api != null;
    setCalendarNavReady((current) => (current === ready ? current : ready));
  }, []);

  useEffect(() => {
    const api = calendarApiRef.current as {
      getDate?: () => Date;
      gotoDate?: (date: Date) => void;
    } | null;
    const becameVisible = wasFrozenRef.current && !keepAliveFrozen;
    const becameHidden = !wasFrozenRef.current && keepAliveFrozen;
    wasFrozenRef.current = keepAliveFrozen;
    if (becameHidden) {
      viewedDateRef.current = api?.getDate?.() ?? null;
      return;
    }
    if (!becameVisible) return;
    const held = viewedDateRef.current;
    if (!held || !api?.gotoDate || !api.getDate) return;
    const current = api.getDate();
    if (current.getTime() === held.getTime()) return;
    requestAnimationFrame(() => {
      api.gotoDate?.(held);
    });
  }, [keepAliveFrozen]);

  const handleViewModeChange = useCallback(
    (mode: CalendarViewMode) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (mode === DEFAULT_CALENDAR_VIEW_MODE) {
            next.delete(CALENDAR_VIEW_MODE_PARAM);
          } else {
            next.set(CALENDAR_VIEW_MODE_PARAM, mode);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  useCalendarDateNavigationShortcuts({
    // Local CalendarDateNavApi is structurally compatible with FullCalendar's API;
    // avoid importing @fullcalendar/core from the desktop app package.
    calendarApiRef: calendarApiRef as never,
    enabled: keepAliveActive && calendarNavReady && !isTimetrackingMode,
  });

  const meeting = useMemo(() => {
    if (!openMeetingId || isAvailabilityMode) return null;
    const normalized = decodeURIComponent(openMeetingId).toLowerCase();
    return workspace.meetings.find((entry) => {
      if (entry.id === openMeetingId) return true;
      const displayId = formatMeetingDisplayId(entry.number).toLowerCase();
      return displayId === normalized;
    });
  }, [isAvailabilityMode, openMeetingId, workspace.meetings]);

  const displayId = meeting ? formatMeetingDisplayId(meeting.number) : null;

  const meetingDetailLabel = meeting
    ? formatMeetingBreadcrumbLabel(meeting.number, meeting.title)
    : null;

  const openTask = useMemo(() => {
    if (!openTaskId || isAvailabilityMode) return null;
    const normalized = decodeURIComponent(openTaskId).toLowerCase();
    return workspace.allTasks.find((entry) => {
      if (entry.id === openTaskId) return true;
      const displayId = getTaskDisplayId(
        {
          number: entry.number,
          projectId: entry.projectId,
        },
        entry.projectKey,
      );
      return displayId?.toLowerCase() === normalized;
    });
  }, [isAvailabilityMode, openTaskId, workspace.allTasks]);

  const taskDetailLabel = openTask
    ? getTaskDisplayId(
        {
          number: openTask.number,
          projectId: openTask.projectId,
        },
        openTask.projectKey,
      )
      ? `${getTaskDisplayId(
          {
            number: openTask.number,
            projectId: openTask.projectId,
          },
          openTask.projectKey,
        )} ${openTask.title}`
      : openTask.title
    : null;

  const dateNav = useMemo(
    () => (
      <CalendarDateNav
        disabled={!calendarNavReady}
        onPrev={() => calendarApiRef.current?.prev()}
        onNext={() => calendarApiRef.current?.next()}
        onToday={() => calendarApiRef.current?.today?.()}
      />
    ),
    [calendarNavReady],
  );

  useDesktopSectionBreadcrumb(
    buildCalendarBreadcrumbItems({
      viewMode,
      pageMode,
      rangeTitle,
      detailLabel:
        openMeetingId && meeting
          ? meetingDetailLabel
          : openTaskId && openTask
            ? taskDetailLabel
            : null,
    }),
    {
      actions: isTimetrackingMode ? undefined : dateNav,
      enabled: keepAliveActive,
      // ⋯ menu lives next to close in the meeting chrome (panel + expanded).
      hideEntityActionsSlot:
        !isTimetrackingMode && Boolean(openMeetingId && meeting),
    },
  );


  const setOpenMeetingId = useCallback(
    (
      meetingId: string | null,
      layout?: CalendarMeetingOverlayLayout,
    ) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(CALENDAR_TASK_OVERLAY_PARAM);
          next.delete(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM);
          if (meetingId) {
            next.set(CALENDAR_MEETING_OVERLAY_PARAM, meetingId);
            const resolvedLayout =
              layout ?? parseCalendarMeetingOverlayLayout(prev.toString());
            if (resolvedLayout === "page") {
              next.set(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM, "page");
            } else {
              next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
            }
          } else {
            next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
            next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setOpenTaskId = useCallback(
    (taskId: string | null, layout?: CalendarTaskOverlayLayout) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
          next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
          if (taskId) {
            next.set(CALENDAR_TASK_OVERLAY_PARAM, taskId);
            const resolvedLayout =
              layout ?? parseCalendarTaskOverlayLayout(prev.toString());
            if (resolvedLayout === "page") {
              next.set(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM, "page");
            } else {
              next.delete(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM);
            }
          } else {
            next.delete(CALENDAR_TASK_OVERLAY_PARAM);
            next.delete(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const openMeetingFromGrid = useCallback(
    (meetingId: string) => {
      setMeetingDraft(null);
      setOpenMeetingId(
        meetingId,
        viewMode === "list" ? "page" : undefined,
      );
    },
    [setOpenMeetingId, viewMode],
  );

  const openTaskFromGrid = useCallback(
    (taskId: string) => {
      setMeetingDraft(null);
      setOpenTaskId(taskId, viewMode === "list" ? "page" : undefined);
    },
    [setOpenTaskId, viewMode],
  );

  const openBirthdayFromGrid = useCallback(
    (contactId: string) => {
      const contact = workspace.contacts.find((entry) => entry.id === contactId);
      if (!contact) return;
      const slug = getUniqueListItemRouteParam(contact, workspace.contacts);
      navigateToHref(navigate, getContactsHref(slug));
    },
    [navigate, workspace.contacts],
  );

  const resolveBirthdayContact = useCallback(
    (contactId: string): CalendarBirthdayPopoverContact | null => {
      const contact = workspace.contacts.find((entry) => entry.id === contactId);
      if (!contact) return null;
      const details = workspace.contactDetails[contactId];
      const organization = contact.organizationId
        ? workspace.organizations.find(
            (entry) => entry.id === contact.organizationId,
          )
        : null;
      return {
        id: contact.id,
        name: contact.name,
        firstName: contact.firstName ?? details?.firstName ?? null,
        lastName: contact.lastName ?? details?.lastName ?? null,
        title: contact.title ?? details?.title ?? null,
        organizationName: contact.organizationName ?? null,
        organizationAvatarSrc: organization
          ? (organizationAvatarSrc[organization.id] ??
            organization.avatarSrc ??
            null)
          : null,
        email: contact.email ?? details?.email ?? null,
        emails: contact.emails ?? details?.emails ?? null,
        phone: contact.phone ?? details?.phone ?? null,
        phones: contact.phones ?? details?.phones ?? null,
        address: contact.address ?? details?.address ?? null,
        city: contact.city ?? details?.city ?? null,
        postalCode: contact.postalCode ?? details?.postalCode ?? null,
        region: contact.region ?? details?.region ?? null,
        country: contact.country ?? details?.country ?? null,
        socialAccounts:
          contact.socialAccounts ?? details?.socialAccounts ?? null,
        birthday: contact.birthday ?? details?.birthday ?? null,
        avatarSrc: contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null,
      };
    },
    [
      contactAvatarSrc,
      organizationAvatarSrc,
      workspace.contactDetails,
      workspace.contacts,
      workspace.organizations,
    ],
  );

  const openBirthdayContactSection = useCallback(
    (contactId: string, section: "overview" | "details" | "tasks") => {
      const contact = workspace.contacts.find((entry) => entry.id === contactId);
      if (!contact) return;
      const slug = getUniqueListItemRouteParam(contact, workspace.contacts);
      navigateToHref(
        navigate,
        section === "overview"
          ? getContactsHref(slug)
          : getContactSectionHref(slug, section),
      );
    },
    [navigate, workspace.contacts],
  );

  const handleBirthdayAddNote = useCallback(
    (contactId: string) => {
      openBirthdayContactSection(contactId, "overview");
    },
    [openBirthdayContactSection],
  );

  const handleBirthdayAddTask = useCallback(
    (contactId: string) => {
      openBirthdayContactSection(contactId, "tasks");
      requestOpenComposeModal();
    },
    [openBirthdayContactSection],
  );

  const handleBirthdayAddMeeting = useCallback(
    (contactId: string) => {
      const contact = workspace.contacts.find((entry) => entry.id === contactId);
      const start = new Date();
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
      const end = new Date(start.getTime() + 30 * 60 * 1000);
      void workspace
        .createMeeting({
          title: contact
            ? `Meeting with ${contact.name}`
            : "Meeting",
          status: "triage",
          startAt: start.toISOString(),
          endAt: end.toISOString(),
        })
        .then((created) => {
          navigateToHref(
            navigate,
            `/calendar/meetings/${encodeURIComponent(created.id)}`,
          );
        });
    },
    [navigate, workspace],
  );

  const handleBirthdaySendEmail = useCallback(
    (contactId: string) => {
      const contact = workspace.contacts.find((entry) => entry.id === contactId);
      const details = workspace.contactDetails[contactId];
      const rawEmails = details?.emails ?? contact?.emails ?? [];
      const emails =
        typeof rawEmails === "string"
          ? (() => {
              try {
                const parsed = JSON.parse(rawEmails) as unknown;
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : Array.isArray(rawEmails)
            ? rawEmails
            : [];
      const to =
        getContactEmailAddresses({
          email: details?.email ?? contact?.email,
          emails,
        })[0] || undefined;
      resetEmailComposeSession();
      writeEmailComposeSession({
        sessionId: crypto.randomUUID(),
        draftId: null,
        inboxId: null,
        prefill: to ? { to } : null,
      });
      navigateToHref(navigate, getEmailComposeHref());
    },
    [navigate, workspace.contactDetails, workspace.contacts],
  );

  const setMeetingOverlayLayout = useCallback(
    (layout: CalendarMeetingOverlayLayout) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!next.get(CALENDAR_MEETING_OVERLAY_PARAM)) {
            return prev;
          }
          if (layout === "page") {
            next.set(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM, "page");
          } else {
            next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setTaskOverlayLayout = useCallback(
    (layout: CalendarTaskOverlayLayout) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (!next.get(CALENDAR_TASK_OVERLAY_PARAM)) {
            return prev;
          }
          if (layout === "page") {
            next.set(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM, "page");
          } else {
            next.delete(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM);
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // List view has no meetings rail — keep open details as fullscreen overlays.
  useEffect(() => {
    if (viewMode !== "list") return;
    if (openMeetingId && meetingOverlayLayout === "panel") {
      setMeetingOverlayLayout("page");
    }
    if (openTaskId && taskOverlayLayout === "panel") {
      setTaskOverlayLayout("page");
    }
  }, [
    meetingOverlayLayout,
    openMeetingId,
    openTaskId,
    setMeetingOverlayLayout,
    setTaskOverlayLayout,
    taskOverlayLayout,
    viewMode,
  ]);

  const events = useMemo(() => {
    if (keepAliveFrozen && frozenEventsRef.current) {
      return frozenEventsRef.current;
    }
    const habitIconById = new Map(
      workspace.habits.map((habit) => [habit.id, habit.icon ?? null] as const),
    );
    const tasksWithHabitIcons = workspace.allTasks.map((task) => {
      const habitId = task.habitId?.trim() || null;
      if (!habitId) return task;
      return {
        ...task,
        habitIcon: habitIconById.get(habitId) ?? null,
      };
    });
    const next = mergeCalendarGridEvents(
      tasksWithHabitIcons,
      workspace.meetings,
      new Date(calendarNowMs),
      workspace.contacts.map((contact) => ({
        id: contact.id,
        name: contact.name,
        birthday: contact.birthday ?? null,
      })),
    );
    frozenEventsRef.current = next;
    return next;
  }, [
    calendarNowMs,
    keepAliveFrozen,
    workspace.allTasks,
    workspace.habits,
    workspace.meetings,
    workspace.contacts,
  ]);

  const calendarEvents = useMemo(() => {
    if (!meetingDraft) return events;
    return [
      ...events,
      {
        id: `meeting-draft:${meetingDraft.key}`,
        title: "Name of meeting",
        start: meetingDraft.startAt,
        end: meetingDraft.endAt,
        allDay: false,
        editable: false,
        startEditable: false,
        durationEditable: false,
        classNames: [
          ...meetingCalendarEventClassNames(),
          "meeting-calendar-event--draft",
        ],
        extendedProps: {
          entityType: "meeting" as const,
          meetingId: `draft:${meetingDraft.key}`,
          status: "triage",
          endAt: meetingDraft.endAt,
          finished: false,
          draft: true,
        },
      },
    ];
  }, [events, meetingDraft]);

  const dayHabitsByDate = useMemo(() => {
    if (keepAliveFrozen && frozenDayHabitsRef.current) {
      return frozenDayHabitsRef.current;
    }
    const next = buildCalendarDayHabitsByDate(
      workspace.habits,
      workspace.allTasks,
    );
    frozenDayHabitsRef.current = next;
    return next;
  }, [keepAliveFrozen, workspace.allTasks, workspace.habits]);

  const handleToggleDayHabit = useCallback(
    (item: CalendarHabitIconItem, completed: boolean) => {
      void workspace.patchTask(item.taskId, {
        status: completed ? "completed" : "canceled",
      });
    },
    [workspace],
  );

  const handleCreateMeetingFromSelect = useCallback(
    (range: { startAt: string; endAt: string }) => {
      meetingDraftSequenceRef.current += 1;
      setOpenMeetingId(null);
      setMeetingDraft({
        key: meetingDraftSequenceRef.current,
        startAt: range.startAt,
        endAt: range.endAt,
      });
    },
    [setOpenMeetingId],
  );

  const tasksById = useMemo(
    () => new Map(workspace.allTasks.map((task) => [task.id, task])),
    [workspace.allTasks],
  );

  const [popoverTaskId, setPopoverTaskId] = useState<string | null>(null);
  const { description: popoverDescription } = useDesktopTaskDescription(
    popoverTaskId,
    { enabled: keepAliveActive && Boolean(popoverTaskId) },
  );

  const resolveTask = useCallback(
    (taskId: string): CalendarTaskPopoverTask | null => {
      const task = tasksById.get(taskId);
      if (!task) return null;
      const fromWatch =
        taskId === popoverTaskId ? popoverDescription : null;
      const description =
        (fromWatch && fromWatch.length > 0 ? fromWatch : null) ??
        peekTaskDescriptionCache(taskId) ??
        null;
      return {
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        dueEndDate: task.dueEndDate,
        number: task.number,
        projectId: task.projectId,
        projectKey: task.projectKey,
        projectName: task.projectName,
        description,
      };
    },
    [popoverDescription, popoverTaskId, tasksById],
  );

  const patchMeeting = useCallback(
    (values: Record<string, unknown>) => {
      if (!meeting) return;
      void workspace.patchMeeting(meeting.id, values);
    },
    [meeting, workspace],
  );

  const meetingDetailProps = useMeetingDetailViewProps(
    meeting,
    workspace,
    patchMeeting,
  );
  const mergeMeetingLocalFields = useCallback(
    (fields: Record<string, unknown>) => {
      if (!meeting) return;
      workspace.mergeMeetingLocalFields(meeting.id, fields);
    },
    [meeting, workspace],
  );
  const meetingEmailActions = useMeetingPortalEmailActions(
    meeting?.id,
    mergeMeetingLocalFields,
  );
  const meetingContactNavigation = useMeetingContactNavigation(
    workspace.contacts,
  );

  const discardMeetingDraft = useCallback(() => {
    setMeetingDraft(null);
  }, []);

  const saveMeetingDraftTitle = useCallback(
    async (title: string) => {
      const draft = meetingDraft;
      const trimmed = title.trim();
      if (!draft || !trimmed) {
        setMeetingDraft(null);
        return;
      }
      const created = await workspace.createMeeting({
        title: trimmed,
        status: "triage",
        startAt: draft.startAt,
        endAt: draft.endAt,
      });
      setMeetingDraft((current) =>
        current?.key === draft.key ? null : current,
      );
      setOpenMeetingId(created.id);
    },
    [meetingDraft, setOpenMeetingId, workspace],
  );

  const activeMeetingDetailProps = meetingDraft
    ? {
        format: "video_call",
        meeting: {
          status: "triage" as const,
          format: "video_call",
          startAt: new Date(meetingDraft.startAt),
          endAt: new Date(meetingDraft.endAt),
          projectKey: null,
          projectName: null,
          organizationId: null,
          organizationName: null,
          locationOrganizationId: null,
          locationOrganizationName: null,
          locationOrganizationAddress: null,
          attendeeContactIds: [],
          trackedMinutes: null,
          trackedDurationSeconds: null,
        },
      }
    : meetingDetailProps;

  const handleDeleteMeeting = useCallback(async () => {
    if (!meeting) {
      return { ok: false as const, error: "Meeting is required." };
    }
    try {
      await workspace.softDeleteMeeting(meeting.id);
      setOpenMeetingId(null);
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error ? error.message : "Failed to delete meeting.",
      };
    }
  }, [meeting, setOpenMeetingId, workspace]);

  const handleTaskReschedule = (taskId: string, patch: TaskCalendarPatch) => {
    void workspace.patchTask(taskId, patch);
  };

  const handleMeetingReschedule = (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => {
    void workspace.patchMeeting(meetingId, patch);
  };

  const handleMeetingDuplicate = (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => {
    void workspace.duplicateMeeting(meetingId, patch);
  };

  const timetrackingEntrySources = useMemo(() => {
    const taskHref = (id: string) =>
      `/calendar?${CALENDAR_PAGE_MODE_PARAM}=timetracking&${CALENDAR_TASK_OVERLAY_PARAM}=${encodeURIComponent(id)}`;
    const meetingHref = (id: string) =>
      `/calendar?${CALENDAR_PAGE_MODE_PARAM}=timetracking&${CALENDAR_MEETING_OVERLAY_PARAM}=${encodeURIComponent(id)}`;

    const areaById = new Map(
      workspace.areas.map((area) => [area.id, area] as const),
    );
    const projectById = new Map(
      workspace.projects.map((project) => [project.id, project] as const),
    );
    const resolveArea = (projectId: string | null | undefined) => {
      if (!projectId) return { areaId: null, areaName: null, areaColor: null };
      const project = projectById.get(projectId);
      if (!project) return { areaId: null, areaName: null, areaColor: null };

      // Nested custom area under Personal / Business / Clients.
      const nestedId = project.areaId?.trim() || null;
      if (nestedId) {
        const nested = areaById.get(nestedId);
        return {
          areaId: nestedId,
          areaName: nested?.name?.trim() || "Untitled area",
          areaColor: nested?.color ?? null,
        };
      }

      // Top-level project.area (personal | business | clients) — most projects
      // only set this; nested areaId stays null.
      const topLevel = project.area ?? null;
      if (isDefinedProjectArea(topLevel)) {
        return {
          areaId: topLevel,
          areaName: PROJECT_AREA_LABELS[topLevel],
          areaColor: null,
        };
      }

      return { areaId: null, areaName: null, areaColor: null };
    };

    return {
      tasks: workspace.allTasks.map((task) => {
        const area = resolveArea(task.projectId);
        return {
          id: task.id,
          title: task.title,
          number: task.number,
          displayId: getTaskDisplayId(
            {
              number: task.number,
              projectId: task.projectId,
            },
            task.projectKey,
          ),
          trackedDurationSeconds: task.trackedDurationSeconds ?? null,
          scheduleAt: task.dueDate,
          projectId: task.projectId ?? null,
          projectKey: task.projectKey ?? null,
          projectName: task.projectName ?? null,
          areaId: area.areaId,
          areaName: area.areaName,
          areaColor: area.areaColor,
          relatedContactIds: task.relatedContactIds ?? null,
        };
      }),
      meetings: workspace.meetings.map((meeting) => {
        const area = resolveArea(meeting.projectId);
        return {
          id: meeting.id,
          title: meeting.title,
          number: meeting.number,
          displayId: formatMeetingDisplayId(meeting.number),
          trackedDurationSeconds: meeting.trackedDurationSeconds ?? null,
          scheduleAt: meeting.startAt,
          projectId: meeting.projectId ?? null,
          projectKey: meeting.projectKey ?? null,
          projectName: meeting.projectName ?? null,
          areaId: area.areaId,
          areaName: area.areaName,
          areaColor: area.areaColor,
          relatedContactIds: meeting.attendeeContactIds ?? null,
        };
      }),
      taskHref,
      meetingHref,
    };
  }, [workspace.allTasks, workspace.areas, workspace.meetings, workspace.projects]);

  const timetrackingEntries = useMemo(
    () =>
      collectTimetrackingEntries({
        ...timetrackingEntrySources,
        period: selectedTimetrackingPeriod,
      }),
    [selectedTimetrackingPeriod, timetrackingEntrySources],
  );

  /** Day list → chart uses the containing week so the line has daily points. */
  const timetrackingChartEntries = useMemo(() => {
    if (
      !selectedTimetrackingPeriod ||
      selectedTimetrackingPeriod.kind !== "day"
    ) {
      return timetrackingEntries;
    }
    const chartPeriod = resolveTimetrackingChartPeriod(
      selectedTimetrackingPeriod,
    );
    if (!chartPeriod) return timetrackingEntries;
    return collectTimetrackingEntries({
      ...timetrackingEntrySources,
      period: chartPeriod,
    });
  }, [
    selectedTimetrackingPeriod,
    timetrackingEntries,
    timetrackingEntrySources,
  ]);

  const timetrackingContactNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const contact of workspace.contacts) {
      const name = contact.name?.trim();
      if (name) map.set(contact.id, name);
    }
    return map;
  }, [workspace.contacts]);

  const timetrackingContactAvatarSrc = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of workspace.contacts) {
      map.set(
        contact.id,
        contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null,
      );
    }
    return map;
  }, [contactAvatarSrc, workspace.contacts]);

  const timetrackingActorAvatarSrc = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of workspace.contacts) {
      const src =
        contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null;
      if (!src) continue;
      const fullName = contact.name?.trim().toLowerCase();
      if (fullName) {
        map.set(fullName, src);
        const firstToken = fullName.split(/\s+/)[0];
        if (firstToken && !map.has(firstToken)) {
          map.set(firstToken, src);
        }
      }
      const firstName = contact.firstName?.trim().toLowerCase();
      if (firstName && !map.has(firstName)) {
        map.set(firstName, src);
      }
    }
    return map;
  }, [contactAvatarSrc, workspace.contacts]);

  const timetrackingActorEmailAvatarSrc = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const contact of workspace.contacts) {
      const src =
        contactAvatarSrc[contact.id] ?? contact.avatarSrc ?? null;
      if (!src) continue;
      const email = contact.email?.trim().toLowerCase();
      if (email) map.set(email, src);
      for (const entry of contact.emails ?? []) {
        const address = entry.address?.trim().toLowerCase();
        if (address) map.set(address, src);
      }
    }
    return map;
  }, [contactAvatarSrc, workspace.contacts]);

  const closeTimetrackingDetail = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(CALENDAR_MEETING_OVERLAY_PARAM);
        next.delete(CALENDAR_MEETING_OVERLAY_LAYOUT_PARAM);
        next.delete(CALENDAR_TASK_OVERLAY_PARAM);
        next.delete(CALENDAR_TASK_OVERLAY_LAYOUT_PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  const { setActiveZone } = useListKeyboardNavigationZone();
  const pendingReturnMeetingIdRef = useRef<string | null>(null);

  const closeMeetingDetail = useCallback(() => {
    if (openMeetingId) {
      pendingReturnMeetingIdRef.current = openMeetingId;
    }
    setOpenMeetingId(null);
  }, [openMeetingId, setOpenMeetingId]);

  // After the overlay unmounts, reclaim the meetings rail on that row. Wait a
  // frame so React has torn down the overlay; use container-only focus so we
  // do not re-focus the row (that flashed while the rail un-faded).
  useEffect(() => {
    if (openMeetingId != null || isTimetrackingMode) return;
    const returnId = pendingReturnMeetingIdRef.current;
    if (!returnId) return;
    pendingReturnMeetingIdRef.current = null;

    const frame = requestAnimationFrame(() => {
      setActiveZone(LIST_KEYBOARD_NAV_ZONE_CONTENT, {
        activate: true,
        preferSidepanelForJk: false,
        highlightItemId: calendarSidePanelMeetingItemId(returnId),
        focusContainerOnly: true,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [isTimetrackingMode, openMeetingId, setActiveZone]);

  const dismissTimetrackingDetail = useCallback(() => {
    const returnId = openTask?.id ?? meeting?.id ?? null;
    closeTimetrackingDetail();
    if (!returnId) return;
    queueMicrotask(() => {
      setActiveZone("main", {
        activate: true,
        preferSidepanelForJk: false,
        highlightItemId: returnId,
      });
    });
  }, [closeTimetrackingDetail, meeting?.id, openTask?.id, setActiveZone]);

  const handleTimetrackingEntryOpen = useCallback(
    (entry: TimetrackingEntry) => {
      if (entry.kind === "task") {
        if (openTaskId === entry.id) {
          setOpenTaskId(null);
          return;
        }
        setOpenTaskId(entry.id);
        return;
      }
      if (openMeetingId === entry.id) {
        setOpenMeetingId(null);
        return;
      }
      setOpenMeetingId(entry.id);
    },
    [openMeetingId, openTaskId, setOpenMeetingId, setOpenTaskId],
  );

  const timetrackingDetailOpen = Boolean(
    isTimetrackingMode && (meeting || openTask),
  );

  useListDismissDetailShortcut({
    enabled: timetrackingDetailOpen,
    onDismiss: dismissTimetrackingDetail,
  });

  const handleTimetrackingTaskStatusChange = useCallback(
    (taskId: string, status: TaskStatus) => {
      void workspace.patchTask(taskId, { status });
    },
    [workspace],
  );

  const handleTimetrackingTaskPriorityChange = useCallback(
    (taskId: string, priority: number) => {
      void workspace.patchTask(taskId, { priority });
    },
    [workspace],
  );

  const handleTimetrackingTaskDueDateChange = useCallback(
    (taskId: string, dueDate: Date | null) => {
      void workspace.patchTask(taskId, {
        dueDate: dueDate ? dueDate.toISOString() : null,
      });
    },
    [workspace],
  );

  const handleTimetrackingTaskAssigneeChange = useCallback(
    (taskId: string, assigneeId: string | null) => {
      void workspace.patchTask(taskId, { assigneeId });
    },
    [workspace],
  );

  const handleTimetrackingTaskProjectChange = useCallback(
    (taskId: string, projectKey: string | null) => {
      const project = projectKey
        ? workspace.projects.find((entry) => entry.key === projectKey) ?? null
        : null;
      void workspace.patchTask(taskId, {
        projectId: project?.id ?? null,
      });
    },
    [workspace],
  );

  const search = searchParams.toString();

  const selectedGridEventId = useMemo(
    () => getSelectedCalendarGridEventId(pathname, search),
    [pathname, search],
  );

  const isListView = viewMode === "list";

  const calendarGrid = (
    <CalendarView
      events={calendarEvents}
      viewMode={viewMode}
      onViewModeChange={handleViewModeChange}
      onCalendarApi={handleCalendarApi}
      onRangeTitleChange={setRangeTitle}
      selectedGridEventId={selectedGridEventId}
      keyboardNavigationEnabled={
        keepAliveActive && !openMeetingId && !openTaskId
      }
      bookingAvailability={
        settings
          ? {
              weekdayHours: settings.weekdayHours,
              timezone: settings.timezone,
            }
          : undefined
      }
      onTaskReschedule={handleTaskReschedule}
      onMeetingReschedule={handleMeetingReschedule}
      onMeetingDuplicate={handleMeetingDuplicate}
      onCreateMeetingFromSelect={handleCreateMeetingFromSelect}
      resolveTask={resolveTask}
      onTaskPopoverChange={setPopoverTaskId}
      resolveBirthdayContact={resolveBirthdayContact}
      onTaskOpen={openTaskFromGrid}
      onBirthdayOpen={openBirthdayFromGrid}
      onBirthdayAddNote={handleBirthdayAddNote}
      onBirthdayAddTask={handleBirthdayAddTask}
      onBirthdayAddMeeting={handleBirthdayAddMeeting}
      onBirthdaySendEmail={handleBirthdaySendEmail}
      onMeetingOpen={openMeetingFromGrid}
      dayHabitsByDate={dayHabitsByDate}
      onToggleDayHabit={handleToggleDayHabit}
    />
  );

  return (
    <div className="calendar-page" data-calendar-page data-calendar-page-mode={pageMode}>
      {meeting ? (
        <>
          {keepAliveActive ? (
            <>
              <RegisterPageTitle
                active={keepAliveActive}
                href={pathname}
                title={
                  displayId ? `${displayId} ${meeting.title}` : meeting.title
                }
              />
              <RegisterEntityDeleteAction
                entityLabel={`meeting ${displayId ?? meeting.title}`}
                onDelete={handleDeleteMeeting}
              />
            </>
          ) : null}
        </>
      ) : null}
      {isTimetrackingMode ? (
        <div
          className={[
            "journal-day-layout",
            "desktop-journal-day-layout",
            "calendar-timetracking-layout",
            timetrackingDetailOpen ? null : "is-detail-closed",
          ]
            .filter(Boolean)
            .join(" ")}
          data-content-detail
          data-detail-split
          data-timetracking-detail={timetrackingDetailOpen ? "open" : "closed"}
        >
          <div className="journal-day-layout__main">
            <CalendarTimetrackingView
              key="timetracking-detail-side-panel"
              entries={timetrackingEntries}
              chartEntries={timetrackingChartEntries}
              contactNames={timetrackingContactNames}
              contactAvatarSrc={timetrackingContactAvatarSrc}
              tasks={workspace.allTasks}
              meetings={workspace.meetings}
              period={selectedTimetrackingPeriod}
              selectedEntryId={openTask?.id ?? meeting?.id ?? null}
              onEntryOpen={handleTimetrackingEntryOpen}
              projectOptions={projectOptions}
              assigneeOptions={assigneeOptions}
              onTaskStatusChange={handleTimetrackingTaskStatusChange}
              onTaskPriorityChange={handleTimetrackingTaskPriorityChange}
              onTaskDueDateChange={handleTimetrackingTaskDueDateChange}
              onTaskAssigneeChange={handleTimetrackingTaskAssigneeChange}
              onTaskProjectChange={handleTimetrackingTaskProjectChange}
            />
          </div>
          {timetrackingDetailOpen ? (
            <ResizableSidePanel
              storageKey={CALENDAR_TIMETRACKING_DETAIL_PANEL_WIDTH_KEY}
              defaultWidth={440}
              minWidth={320}
              maxWidth={720}
              edge="start"
              className="journal-day-layout__calendar calendar-timetracking-detail-panel"
            >
              <div className="desktop-journal-day-layout__chrome">
                <div className="desktop-agent-surface-tab-actions">
                  <button
                    type="button"
                    className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                    onClick={dismissTimetrackingDetail}
                    title="Close details (Esc)"
                    aria-label="Close details"
                  >
                    <ProjectOcticon icon="x" size={14} />
                  </button>
                </div>
              </div>
              <div className="desktop-journal-day-layout__calendar-body calendar-timetracking-detail-panel__body">
                {meeting ? (
                  <TimetrackingSessionsDetail
                    kind="meeting"
                    entityId={meeting.id}
                    displayId={displayId}
                    title={meeting.title}
                    trackedDurationSeconds={
                      meeting.trackedDurationSeconds ?? null
                    }
                    avatarSrcByContactId={timetrackingContactAvatarSrc}
                    avatarSrcByActorName={timetrackingActorAvatarSrc}
                    avatarSrcByActorEmail={timetrackingActorEmailAvatarSrc}
                    onOpenEntity={() => {
                      setMeetingOverlayLayout("page");
                    }}
                  />
                ) : openTask ? (
                  <TimetrackingSessionsDetail
                    kind="task"
                    entityId={openTask.id}
                    displayId={getTaskDisplayId(
                      {
                        number: openTask.number,
                        projectId: openTask.projectId,
                      },
                      openTask.projectKey,
                    )}
                    title={openTask.title}
                    trackedDurationSeconds={
                      openTask.trackedDurationSeconds ?? null
                    }
                    boardTask={{
                      id: openTask.id,
                      number: openTask.number,
                      title: openTask.title,
                      status: openTask.status,
                      priority: openTask.priority,
                      dueDate: openTask.dueDate,
                      projectId: openTask.projectId,
                      projectKey: openTask.projectKey,
                      assigneeId: openTask.assigneeId,
                      support: openTask.support,
                      notification: openTask.notification,
                    }}
                    assigneeOptions={assigneeOptions}
                    avatarSrcByContactId={timetrackingContactAvatarSrc}
                    avatarSrcByActorName={timetrackingActorAvatarSrc}
                    avatarSrcByActorEmail={timetrackingActorEmailAvatarSrc}
                    onOpenEntity={() => {
                      if (
                        openTask.projectKey &&
                        openTask.number != null
                      ) {
                        navigateToHref(
                          navigate,
                          getProjectTaskHref(
                            openTask.projectKey,
                            openTask.number,
                          ),
                        );
                        return;
                      }
                      setTaskOverlayLayout("page");
                    }}
                  />
                ) : null}
              </div>
            </ResizableSidePanel>
          ) : null}
        </div>
      ) : isAvailabilityMode && settings ? (
        <CalendarAvailabilityView
          weekdayHours={settings.weekdayHours}
          timezone={settings.timezone}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          onWeekdayHoursChange={setWeekdayHours}
          onCalendarApi={handleCalendarApi}
          onRangeTitleChange={setRangeTitle}
        />
      ) : isAvailabilityMode ? (
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {settingsLoading ? "Loading availability…" : "Unable to load availability settings."}
        </div>
      ) : isListView ? (
        calendarGrid
      ) : (
        <DesktopCollapsibleRightSidePanelLayout
          storageKey={CALENDAR_MEETINGS_SIDE_PANEL_WIDTH_KEY}
          panelAriaLabel="Meetings"
          showPanelLabel="Show meetings"
          hidePanelLabel="Close"
          defaultWidth={360}
          minWidth={280}
          maxWidth={560}
          showChrome={Boolean(
            meetingDraft ||
              (!isTimetrackingMode &&
                openMeetingId &&
                meeting &&
                meetingOverlayLayout === "panel") ||
              (!isTimetrackingMode &&
                openTaskId &&
                openTask &&
                taskOverlayLayout === "panel"),
          )}
          chromeHideIcon={<X size={14} />}
          chromeStart={
            !isTimetrackingMode &&
            openMeetingId &&
            meeting &&
            meetingOverlayLayout === "panel" ? (
              <button
                type="button"
                className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                onClick={() => setMeetingOverlayLayout("page")}
                aria-label="Expand meeting"
                title="Expand (Enter)"
              >
                <ExpandLayoutIcon size={14} />
              </button>
            ) : !isTimetrackingMode &&
              openTaskId &&
              openTask &&
              taskOverlayLayout === "panel" ? (
              <button
                type="button"
                className="desktop-agent-surface-tab desktop-agent-surface-tab--icon"
                onClick={() => setTaskOverlayLayout("page")}
                aria-label="Expand task"
                title="Expand (Enter)"
              >
                <ExpandLayoutIcon size={14} />
              </button>
            ) : null
          }
          chromeEnd={
            !isTimetrackingMode &&
            openMeetingId &&
            meeting &&
            meetingOverlayLayout === "panel" ? (
              <EntityHeaderActionsSlot />
            ) : null
          }
          onChromeHide={
            meetingDraft
              ? discardMeetingDraft
              : !isTimetrackingMode &&
                  openMeetingId &&
                  meeting &&
                  meetingOverlayLayout === "panel"
              ? closeMeetingDetail
              : !isTimetrackingMode &&
                  openTaskId &&
                  openTask &&
                  taskOverlayLayout === "panel"
                ? () => setOpenTaskId(null)
                : undefined
          }
          main={calendarGrid}
          sidePanel={
            <div className="calendar-right-rail">
              <div
                className={[
                  "calendar-right-rail__meetings",
                  !isTimetrackingMode &&
                  (meetingDraft ||
                    (openTaskId && openTask && taskOverlayLayout === "panel") ||
                    (openMeetingId &&
                      meeting &&
                      meetingOverlayLayout === "panel"))
                    ? "is-faded"
                    : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <CalendarMeetingsSidePanelView
                  meetings={panelMeetings}
                  viewMode={viewMode}
                  selectedMeetingId={openMeetingId}
                  onMeetingOpen={openMeetingFromGrid}
                  keyboardNavigationEnabled={
                    keepAliveActive && !isTimetrackingMode
                  }
                />
              </div>
              <CalendarMeetingDetailOverlay
                key={meetingDraft ? `draft-${meetingDraft.key}` : "meeting"}
                open={Boolean(
                  !isTimetrackingMode &&
                    (meetingDraft ||
                      (openMeetingId &&
                        meeting &&
                        meetingOverlayLayout === "panel")),
                )}
                overlayLayout="panel"
                placement="rail"
                showChrome={false}
                onClose={
                  meetingDraft ? discardMeetingDraft : closeMeetingDetail
                }
                onExpand={
                  meetingDraft
                    ? undefined
                    : () => setMeetingOverlayLayout("page")
                }
                displayId={meetingDraft ? "" : (displayId ?? "M-?")}
                title={meeting?.title ?? ""}
                titlePlaceholder={
                  meetingDraft ? "Name of meeting" : undefined
                }
                titleAutoEdit={Boolean(meetingDraft)}
                onEmptyTitleDiscard={
                  meetingDraft ? discardMeetingDraft : undefined
                }
                summary={meeting?.summary ?? ""}
                notes={meeting?.notes ?? ""}
                transcription={meeting?.transcription ?? ""}
                contentTab={meetingContentTab}
                onContentTabChange={setMeetingContentTab}
                onTitleChange={
                  meetingDraft
                    ? saveMeetingDraftTitle
                    : (title) => patchMeeting({ title })
                }
                onSummaryChange={(summary) => patchMeeting({ summary })}
                onNotesChange={(notes) => patchMeeting({ notes })}
                onTranscriptionChange={(transcription) =>
                  patchMeeting({ transcription })
                }
                {...activeMeetingDetailProps}
                {...meetingEmailActions}
                {...meetingContactNavigation}
              />
              <CalendarTaskDetailOverlay
                open={Boolean(
                  !isTimetrackingMode &&
                    openTaskId &&
                    openTask &&
                    taskOverlayLayout === "panel",
                )}
                overlayLayout="panel"
                placement="rail"
                showChrome={false}
                onClose={() => setOpenTaskId(null)}
                onExpand={() => setTaskOverlayLayout("page")}
                ariaLabel={
                  openTask?.title?.trim()
                    ? `Task ${openTask.title}`
                    : "Task details"
                }
              >
                {openTaskId && openTask ? (
                  <TaskDetailPage taskRouteParam={openTask.id} overlayMode />
                ) : null}
              </CalendarTaskDetailOverlay>
            </div>
          }
        />
      )}
      <CalendarMeetingDetailOverlay
        open={Boolean(
          !isTimetrackingMode &&
            openMeetingId &&
            meeting &&
            meetingOverlayLayout === "page",
        )}
        overlayLayout="page"
        placement="overlay"
        onClose={closeMeetingDetail}
        onCollapse={
          isListView ? undefined : () => setMeetingOverlayLayout("panel")
        }
        displayId={displayId ?? "M-?"}
        title={meeting?.title ?? ""}
        summary={meeting?.summary ?? ""}
        notes={meeting?.notes ?? ""}
        transcription={meeting?.transcription ?? ""}
        contentTab={meetingContentTab}
        onContentTabChange={setMeetingContentTab}
        onTitleChange={(title) => patchMeeting({ title })}
        onSummaryChange={(summary) => patchMeeting({ summary })}
        onNotesChange={(notes) => patchMeeting({ notes })}
        onTranscriptionChange={(transcription) =>
          patchMeeting({ transcription })
        }
        {...meetingDetailProps}
        {...meetingEmailActions}
        {...meetingContactNavigation}
        headerMoreAction={<EntityHeaderActionsSlot />}
      />
      <CalendarTaskDetailOverlay
        open={Boolean(
          !isTimetrackingMode &&
            openTaskId &&
            openTask &&
            taskOverlayLayout === "page",
        )}
        overlayLayout="page"
        placement="overlay"
        onClose={() => setOpenTaskId(null)}
        onCollapse={
          isListView ? undefined : () => setTaskOverlayLayout("panel")
        }
        ariaLabel={
          openTask?.title?.trim()
            ? `Task ${openTask.title}`
            : "Task details"
        }
      >
        {openTaskId && openTask ? (
          <TaskDetailPage taskRouteParam={openTask.id} overlayMode />
        ) : null}
      </CalendarTaskDetailOverlay>
    </div>
  );
}
