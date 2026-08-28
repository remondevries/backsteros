import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  CalendarDayTimeline,
  DocumentDetailIcon,
  DocumentOcticon,
  JournalDueTasksSection,
  MarkdownDocumentDetailView,
  RegisterEntityDeleteAction,
  RegisterPageIcon,
  buildJournalDayTaskModel,
  buildJournalTaskTrailHref,
  formatJournalEntryTitle,
  getCalendarMeetingOverlayHref,
  getDocumentEditorBody,
  getJournalHref,
  getTodayJournalDateSlug,
  meetingsToCalendarEventsForDate,
  mergeJournalContent,
  tasksToCalendarEvents,
  type JournalHabitDayItem,
  type MeetingCalendarPatch,
  type TaskCalendarPatch,
  type TaskItemRowTask,
} from "@backsteros/ui";

import { JournalWhoopLeading } from "../components/journal-whoop-leading";
import { DesktopJournalDayLayout } from "../components/desktop-journal-day-layout";
import { useDesktopApi } from "../lib/api-context";
import {
  ensureJournalDocumentId,
  peekJournalDocumentId,
  rememberJournalDocumentId,
} from "../lib/prefetch-workspace-content";
import { useDesktopDocumentContent } from "../lib/use-document-content";
import {
  useKeepAliveActive,
  useShellLocation,
  useShellParams,
} from "../lib/shell-route-keep-alive";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import {
  useDesktopWorkspaceActions,
  useDesktopWorkspaceDocuments,
  useDesktopWorkspaceMeta,
  useDesktopWorkspacePeople,
  useDesktopWorkspaceTasks,
} from "../lib/workspace-data";
import { navigateToHref } from "../router/navigate-href";

/** Cached once — constructing DateTimeFormat only to read the zone is wasteful. */
const JOURNAL_CALENDAR_TIME_ZONE =
  Intl.DateTimeFormat().resolvedOptions().timeZone;

function useJournalCalendarTimeZone(): string {
  return JOURNAL_CALENDAR_TIME_ZONE;
}

function JournalDayBody({ children }: { children: ReactNode }) {
  return (
    <div className="inbox-detail-layout">
      <div className="inbox-detail-body inbox-detail-body--document">
        {children}
      </div>
    </div>
  );
}

/** Journal list stays mounted; Tier C/D body loads on demand. */
export function JournalPage() {
  const { dateSlug: rawSlug } = useShellParams() as { dateSlug?: string };
  return <JournalPageContent rawSlug={rawSlug} />;
}

function JournalPageContent({ rawSlug }: { rawSlug?: string }) {
  const dateSlug = rawSlug ?? getTodayJournalDateSlug();
  const displayTitle = useMemo(
    () => formatJournalEntryTitle(dateSlug),
    [dateSlug],
  );

  const [breadcrumbDate, setBreadcrumbDate] = useState(dateSlug);
  const [resolvedBreadcrumbTitle, setResolvedBreadcrumbTitle] = useState<
    string | null
  >(null);
  if (dateSlug !== breadcrumbDate) {
    setBreadcrumbDate(dateSlug);
    setResolvedBreadcrumbTitle(null);
  }

  const keepAliveActive = useKeepAliveActive();
  useDesktopSectionBreadcrumb(
    rawSlug
      ? [
          { label: "Journal", href: "/journal" },
          {
            label: resolvedBreadcrumbTitle ?? displayTitle,
          },
        ]
      : [{ label: "Journal" }],
    { enabled: keepAliveActive },
  );

  return (
    <JournalScreen
      date={dateSlug}
      onResolvedTitle={setResolvedBreadcrumbTitle}
    />
  );
}

function useJournalDayModel(dateSlug: string) {
  const { habits } = useDesktopWorkspaceMeta();
  const { allTasks } = useDesktopWorkspaceTasks();
  const calendarTimeZone = useJournalCalendarTimeZone();

  return useMemo(
    () =>
      buildJournalDayTaskModel(
        allTasks,
        habits,
        dateSlug,
        calendarTimeZone,
      ),
    [allTasks, calendarTimeZone, dateSlug, habits],
  );
}

/** Journal entry editor + habits/due footer for a date (no day-calendar column). */
const NOOP_RESOLVED_TITLE = (_title: string) => {};

export function JournalDayEntryMain({
  dateSlug,
  onResolvedTitle = NOOP_RESOLVED_TITLE,
}: {
  dateSlug: string;
  onResolvedTitle?: (title: string) => void;
}) {
  const displayTitle = useMemo(
    () => formatJournalEntryTitle(dateSlug),
    [dateSlug],
  );
  const { client } = useDesktopApi();
  const { journalDocumentIdsByDate } = useDesktopWorkspaceDocuments();
  const dayModel = useJournalDayModel(dateSlug);
  const knownId =
    journalDocumentIdsByDate[dateSlug] ??
    peekJournalDocumentId(dateSlug) ??
    null;

  const [ensuredId, setEnsuredId] = useState<string | null>(null);
  const [ensureError, setEnsureError] = useState<Error | null>(null);
  const [ensureNonce, setEnsureNonce] = useState(0);
  const [trackedDate, setTrackedDate] = useState(dateSlug);

  if (dateSlug !== trackedDate) {
    setTrackedDate(dateSlug);
    setEnsuredId(null);
    setEnsureError(null);
  }

  const documentId = knownId ?? ensuredId;

  useEffect(() => {
    onResolvedTitle(displayTitle);
  }, [displayTitle, onResolvedTitle]);

  useEffect(() => {
    if (!knownId) return;
    rememberJournalDocumentId(dateSlug, knownId);
  }, [dateSlug, knownId]);

  useEffect(() => {
    if (knownId) return;
    let cancelled = false;
    setEnsureError(null);
    void ensureJournalDocumentId(client, dateSlug).then((id) => {
      if (cancelled) return;
      if (id) setEnsuredId(id);
      else setEnsureError(new Error("Could not open journal entry."));
    });
    return () => {
      cancelled = true;
    };
  }, [client, dateSlug, ensureNonce, knownId]);

  if (ensureError && !documentId) {
    return (
      <div className="inbox-detail-empty">
        <p>{ensureError.message}</p>
        <button type="button" onClick={() => setEnsureNonce((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <JournalDayBody>
      <JournalEntryDetail
        dateSlug={dateSlug}
        displayTitle={displayTitle}
        documentId={documentId}
        dueTasks={dayModel.dueTasks}
        habitItems={dayModel.habitItems}
        onResolvedTitle={onResolvedTitle}
      />
    </JournalDayBody>
  );
}

function JournalScreen({
  date,
  onResolvedTitle,
}: {
  date: string;
  onResolvedTitle: (title: string) => void;
}) {
  const dayModel = useJournalDayModel(date);

  return (
    <DesktopJournalDayLayout
      main={
        <JournalDayEntryMain
          dateSlug={date}
          onResolvedTitle={onResolvedTitle}
        />
      }
      dayCalendar={
        <JournalDayCalendarColumn
          dateSlug={date}
          dayTasks={dayModel.dayTasks}
        />
      }
    />
  );
}

function JournalEntryDetail({
  dateSlug,
  displayTitle,
  documentId,
  dueTasks,
  habitItems,
  onResolvedTitle,
}: {
  dateSlug: string;
  displayTitle: string;
  documentId: string | null;
  dueTasks: TaskItemRowTask[];
  habitItems: readonly JournalHabitDayItem[];
  onResolvedTitle: (title: string) => void;
}) {
  const location = useShellLocation();
  const keepAliveActive = useKeepAliveActive();
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const { client } = useDesktopApi();
  const { documents } = useDesktopWorkspaceDocuments();
  const { allTasks } = useDesktopWorkspaceTasks();
  const { contacts } = useDesktopWorkspacePeople();
  const { source, ready } = useDesktopWorkspaceMeta();
  const { updateDocumentIcon, patchTask } = useDesktopWorkspaceActions();
  const calendarTimeZone = useJournalCalendarTimeZone();
  const localDoc = documentId
    ? documents.find((doc) => doc.id === documentId)
    : undefined;

  const { initialBody, onSave: saveContent } =
    useDesktopDocumentContent(documentId);

  const metadataIcon = localDoc?.icon ?? null;
  const storedTitle = dateSlug;

  useEffect(() => {
    onResolvedTitle(displayTitle);
  }, [displayTitle, onResolvedTitle]);

  const editorBody = useMemo(
    () => getDocumentEditorBody(initialBody, storedTitle),
    [initialBody, storedTitle],
  );

  const handleDeleteJournalDocument = useCallback(async () => {
    if (!documentId) {
      return { ok: false as const, error: "Journal entry is still opening." };
    }
    try {
      await client.requestJson(
        `/api/v1/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE" },
      );
      navigate(getJournalHref(getTodayJournalDateSlug()), { replace: true });
      return { ok: true as const };
    } catch (error) {
      return {
        ok: false as const,
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete journal entry.",
      };
    }
  }, [client, documentId, navigate]);

  const handleSelectDueTask = useCallback(
    (taskId: string) => {
      const task = allTasks.find((entry) => entry.id === taskId);
      if (!task) return;
      const contact = task.contactId
        ? contacts.find((entry) => entry.id === task.contactId)
        : null;
      navigate(
        buildJournalTaskTrailHref(location.pathname, {
          id: task.id,
          number: task.number,
          projectKey: task.projectKey,
          contactKey: contact?.key ?? null,
        }),
      );
    },
    [allTasks, contacts, location.pathname, navigate],
  );

  return (
    <>
      {keepAliveActive ? (
        <>
          <RegisterPageIcon icon={metadataIcon} />
          {documentId ? (
            <RegisterEntityDeleteAction
              entityLabel={`journal entry "${displayTitle}"`}
              onDelete={handleDeleteJournalDocument}
            />
          ) : null}
        </>
      ) : null}
      <MarkdownDocumentDetailView
        sectionLabel="Journal"
        title={displayTitle}
        resetKey={documentId ?? dateSlug}
        titleEditable={false}
        previewTitleEditable={false}
        embedded
        leading={<JournalWhoopLeading dateSlug={dateSlug} fetchEnabled />}
        icon={
          documentId ? (
            <DocumentDetailIcon
              documentId={documentId}
              icon={metadataIcon}
              title={displayTitle}
              onSaveIcon={async (icon) => {
                const result = await updateDocumentIcon(documentId, icon);
                if (!result.ok) return result;
                try {
                  if (source === "powersync") {
                    await client.requestJson(
                      `/api/v1/documents/${encodeURIComponent(documentId)}`,
                      {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ icon }),
                      },
                    );
                  }
                  return { ok: true as const };
                } catch (error) {
                  return {
                    ok: false as const,
                    error:
                      error instanceof Error
                        ? error.message
                        : "Could not update document icon.",
                  };
                }
              }}
            />
          ) : (
            <div className="document-detail-icon">
              <span className="document-detail-icon__button">
                <DocumentOcticon
                  icon={metadataIcon}
                  size={16}
                  className="document-detail-icon__glyph"
                  title={displayTitle}
                />
              </span>
            </div>
          )
        }
        initialBody={editorBody}
        onSave={async (nextEditorBody) => {
          if (!documentId) return;
          const nextContent = mergeJournalContent(storedTitle, nextEditorBody);
          if (nextContent === initialBody) return;
          await saveContent(nextContent);
        }}
        footer={
          <JournalDueTasksSection
            dateSlug={dateSlug}
            tasks={allTasks}
            dueTasks={dueTasks}
            habits={habitItems}
            isLoading={!ready}
            calendarTimeZone={calendarTimeZone}
            dayTimelineDraggable
            onSelectTask={handleSelectDueTask}
            onToggleHabit={(item, checked) => {
              void patchTask(item.taskId, {
                status: checked ? "completed" : "ready_to_start",
              });
            }}
          />
        }
      />
    </>
  );
}

function JournalDayCalendarColumn({
  dateSlug,
  dayTasks,
}: {
  dateSlug: string;
  dayTasks: TaskItemRowTask[];
}) {
  const location = useShellLocation();
  const routerNavigate = useNavigate();
  const navigate = useCallback(
    (to: string, options?: { replace?: boolean; state?: unknown }) => {
      navigateToHref(routerNavigate, to, options);
    },
    [routerNavigate],
  );
  const { allTasks } = useDesktopWorkspaceTasks();
  const { contacts } = useDesktopWorkspacePeople();
  const { habits, meetings } = useDesktopWorkspaceMeta();
  const { patchTask, patchMeeting } = useDesktopWorkspaceActions();
  const calendarTimeZone = useJournalCalendarTimeZone();

  const events = useMemo(() => {
    const habitIconById = new Map(
      habits.map((habit) => [habit.id, habit.icon ?? null] as const),
    );
    const tasksWithHabitIcons = dayTasks.map((task) => {
      const habitId = task.habitId?.trim() || null;
      if (!habitId) return task;
      return {
        ...task,
        habitIcon: habitIconById.get(habitId) ?? null,
      };
    });
    return [
      ...tasksToCalendarEvents(tasksWithHabitIcons),
      ...meetingsToCalendarEventsForDate(
        meetings,
        dateSlug,
        calendarTimeZone,
      ),
    ];
  }, [calendarTimeZone, dateSlug, dayTasks, habits, meetings]);

  const handleReschedule = (taskId: string, patch: TaskCalendarPatch) => {
    void patchTask(taskId, patch);
  };

  const handleMeetingReschedule = (
    meetingId: string,
    patch: MeetingCalendarPatch,
  ) => {
    void patchMeeting(meetingId, patch);
  };

  const handleTaskOpen = useCallback(
    (taskId: string) => {
      const task = allTasks.find((entry) => entry.id === taskId);
      if (!task) return;
      const contact = task.contactId
        ? contacts.find((entry) => entry.id === task.contactId)
        : null;
      navigate(
        buildJournalTaskTrailHref(location.pathname, {
          id: task.id,
          number: task.number,
          projectKey: task.projectKey,
          contactKey: contact?.key ?? null,
        }),
      );
    },
    [allTasks, contacts, location.pathname, navigate],
  );

  const handleMeetingOpen = useCallback(
    (meetingId: string) => {
      navigate(getCalendarMeetingOverlayHref(meetingId));
    },
    [navigate],
  );

  return (
    <CalendarDayTimeline
      dateSlug={dateSlug}
      events={events}
      onTaskReschedule={handleReschedule}
      onMeetingReschedule={handleMeetingReschedule}
      onTaskOpen={handleTaskOpen}
      onMeetingOpen={handleMeetingOpen}
    />
  );
}
