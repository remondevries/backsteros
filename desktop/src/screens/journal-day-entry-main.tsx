/** Journal day markdown body + habits/due footer (shared by JournalPage). */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  DocumentDetailIcon,
  DocumentOcticon,
  JournalDueTasksSection,
  MarkdownDocumentDetailView,
  RegisterEntityDeleteAction,
  RegisterPageIcon,
  buildJournalTaskTrailHref,
  formatJournalEntryTitle,
  getDocumentEditorBody,
  getJournalHref,
  getTodayJournalDateSlug,
  mergeJournalContent,
  type JournalDayTaskModel,
  type JournalHabitDayItem,
  type TaskItemRowTask,
} from "@backsteros/ui";

import { JournalWhoopLeading } from "../components/journal-whoop-leading";
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
} from "../lib/shell-route-keep-alive";
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

function JournalDayBody({ children }: { children: ReactNode }) {
  return (
    <div className="inbox-detail-layout">
      <div className="inbox-detail-body inbox-detail-body--document">
        {children}
      </div>
    </div>
  );
}

/** Journal entry editor + habits/due footer for a date (no day-calendar column). */
const NOOP_RESOLVED_TITLE = (_title: string) => {};

export function JournalDayEntryMain({
  dateSlug,
  dayModel,
  onResolvedTitle = NOOP_RESOLVED_TITLE,
}: {
  dateSlug: string;
  dayModel: JournalDayTaskModel<TaskItemRowTask>;
  onResolvedTitle?: (title: string) => void;
}) {
  const keepAliveActive = useKeepAliveActive();
  const displayTitle = useMemo(
    () => formatJournalEntryTitle(dateSlug),
    [dateSlug],
  );
  const { client } = useDesktopApi();
  const { journalDocumentIdsByDate } = useDesktopWorkspaceDocuments();
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
    if (!keepAliveActive || knownId) return;
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
  }, [client, dateSlug, ensureNonce, keepAliveActive, knownId]);

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
  const calendarTimeZone = JOURNAL_CALENDAR_TIME_ZONE;
  const localDoc = documentId
    ? documents.find((doc) => doc.id === documentId)
    : undefined;

  const { initialBody, onSave: saveContent } = useDesktopDocumentContent(
    documentId,
    { enabled: keepAliveActive },
  );

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
          <RegisterPageIcon
            active={keepAliveActive}
            href={location.pathname}
            icon={metadataIcon}
          />
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
        shortcutsEnabled={keepAliveActive}
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
            listKeyboardEnabled={keepAliveActive}
            onSelectTask={handleSelectDueTask}
            onToggleHabit={(item, checked) => {
              void patchTask(item.taskId, {
                status: checked ? "completed" : "canceled",
              });
            }}
          />
        }
      />
    </>
  );
}
