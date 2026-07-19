import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type { Document as ApiDocument } from "@backsteros/contracts";
import {
  DocumentDetailIcon,
  JournalDetailSkeleton,
  JournalDueTasksSection,
  MarkdownDocumentDetailView,
  RegisterEntityDeleteAction,
  RegisterPageIcon,
  buildJournalTaskTrailHref,
  formatJournalEntryTitle,
  getDocumentEditorBody,
  mergeJournalContent,
} from "@backsteros/ui";

import { JournalWhoopLeading } from "../components/journal-whoop-leading";
import { useDesktopApi } from "../lib/api-context";
import { useJournalSelection } from "../lib/journal-selection-context";
import {
  ensureJournalDocumentId,
  peekJournalDocumentId,
} from "../lib/prefetch-workspace-content";
import { useDesktopDocumentContent } from "../lib/use-document-content";
import { useDesktopResource } from "../lib/use-desktop-resource";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { useDesktopWorkspaceData } from "../lib/workspace-data";

function JournalDayShell({
  dateSlug,
  fetchEnabled,
  children,
}: {
  dateSlug: string;
  /** False until skeleton has painted — Whoop + content start together after. */
  fetchEnabled: boolean;
  children: ReactNode;
}) {
  return (
    <div className="inbox-detail-layout" data-content-detail>
      <div className="inbox-detail-body inbox-detail-body--document">
        <div className="markdown-document-leading">
          <JournalWhoopLeading dateSlug={dateSlug} fetchEnabled={fetchEnabled} />
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Selection (click / Enter / Space) calls `selectDate` with flushSync, which
 * clears `readyDate` in the same turn. This page then:
 *   1. Unmounts the journal body immediately
 *   2. Shows the skeleton
 *   3. Starts loading the new day
 *   4. Calls `markReady` when the body is available → content replaces skeleton
 */
export function JournalPage() {
  const { dateSlug: rawSlug } = useParams<{ dateSlug?: string }>();
  const routeDate = rawSlug ?? new Date().toISOString().slice(0, 10);
  const { pendingDate, readyDate, markReady, clearPending } =
    useJournalSelection();
  const dateSlug = pendingDate ?? routeDate;
  // readyDate is cleared inside selectDate's flushSync — skeleton is immediate.
  const showSkeleton = readyDate !== dateSlug;

  const [breadcrumbDate, setBreadcrumbDate] = useState(dateSlug);
  const [resolvedBreadcrumbTitle, setResolvedBreadcrumbTitle] = useState<
    string | null
  >(null);
  if (dateSlug !== breadcrumbDate) {
    setBreadcrumbDate(dateSlug);
    setResolvedBreadcrumbTitle(null);
  }

  useDesktopSectionBreadcrumb(
    rawSlug || pendingDate
      ? [
          { label: "Journal", href: "/journal" },
          {
            label:
              resolvedBreadcrumbTitle ?? formatJournalEntryTitle(dateSlug),
          },
        ]
      : [{ label: "Journal" }],
  );

  useEffect(() => {
    if (pendingDate && pendingDate === routeDate) {
      clearPending();
    }
  }, [clearPending, pendingDate, routeDate]);

  return (
    <JournalScreen
      date={dateSlug}
      showSkeleton={showSkeleton}
      onResolvedTitle={setResolvedBreadcrumbTitle}
      onContentReady={markReady}
    />
  );
}

function JournalScreen({
  date,
  showSkeleton,
  onResolvedTitle,
  onContentReady,
}: {
  date: string;
  showSkeleton: boolean;
  onResolvedTitle: (title: string) => void;
  onContentReady: (dateSlug: string) => void;
}) {
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const knownId =
    workspace.journalDocumentIdsByDate[date] ??
    peekJournalDocumentId(date) ??
    null;

  const [ensuredId, setEnsuredId] = useState<string | null>(null);
  const [ensureError, setEnsureError] = useState<Error | null>(null);
  const [ensureNonce, setEnsureNonce] = useState(0);
  const [trackedDate, setTrackedDate] = useState(date);
  // Gate: do not start Whoop/content until skeleton has painted. Cached content
  // used to call markReady inside flushSync (loading:false) and skip paint.
  const [fetchEnabled, setFetchEnabled] = useState(false);

  if (date !== trackedDate) {
    setTrackedDate(date);
    setEnsuredId(null);
    setEnsureError(null);
    setFetchEnabled(false);
  }

  const documentId = knownId ?? ensuredId;

  // After skeleton commit paints, enable Whoop + content together.
  useEffect(() => {
    if (!showSkeleton) {
      setFetchEnabled(true);
      return;
    }
    let cancelled = false;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        if (cancelled) return;
        setFetchEnabled(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [date, showSkeleton]);

  // Ensure document id only after paint (parallel with Whoop).
  useEffect(() => {
    if (!fetchEnabled || knownId) return;
    let cancelled = false;
    setEnsureError(null);
    void ensureJournalDocumentId(client, date).then((id) => {
      if (cancelled) return;
      if (id) setEnsuredId(id);
      else setEnsureError(new Error("Could not open journal entry."));
    });
    return () => {
      cancelled = true;
    };
  }, [client, date, ensureNonce, knownId, fetchEnabled]);

  let body: ReactNode;
  if (ensureError && !documentId) {
    body = (
      <div className="inbox-detail-empty">
        <p>{ensureError.message}</p>
        <button type="button" onClick={() => setEnsureNonce((n) => n + 1)}>
          Try again
        </button>
      </div>
    );
  } else if (showSkeleton) {
    // Skeleton only until paint gate; then headless loader runs (no editor).
    body = (
      <>
        <JournalDetailSkeleton framed={false} includeWhoop={false} />
        {fetchEnabled && documentId ? (
          <JournalEntryLoader
            dateSlug={date}
            documentId={documentId}
            onContentReady={onContentReady}
          />
        ) : null}
      </>
    );
  } else if (documentId) {
    body = (
      <JournalEntryDetail
        dateSlug={date}
        documentId={documentId}
        onResolvedTitle={onResolvedTitle}
        onContentReady={onContentReady}
      />
    );
  } else {
    body = <JournalDetailSkeleton framed={false} includeWhoop={false} />;
  }

  return (
    <JournalDayShell dateSlug={date} fetchEnabled={fetchEnabled}>
      {body}
    </JournalDayShell>
  );
}

/** Headless fetch while the skeleton is visible — never paints the editor. */
function JournalEntryLoader({
  dateSlug,
  documentId,
  onContentReady,
}: {
  dateSlug: string;
  documentId: string;
  onContentReady: (dateSlug: string) => void;
}) {
  const { loading } = useDesktopDocumentContent(documentId);

  useEffect(() => {
    if (loading) return;
    onContentReady(dateSlug);
  }, [loading, dateSlug, onContentReady]);

  return null;
}

function JournalEntryDetail({
  dateSlug,
  documentId,
  onResolvedTitle,
  onContentReady,
}: {
  dateSlug: string;
  documentId: string;
  onResolvedTitle: (title: string) => void;
  onContentReady: (dateSlug: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { client } = useDesktopApi();
  const workspace = useDesktopWorkspaceData();
  const localDoc = workspace.documents.find((doc) => doc.id === documentId);

  const metadata = useDesktopResource<ApiDocument>(
    (api) =>
      api.requestJson(`/api/v1/documents/${encodeURIComponent(documentId)}`),
    [documentId],
  );

  const {
    initialBody,
    onSave: saveContent,
    loading: contentLoading,
  } = useDesktopDocumentContent(documentId);

  const metadataTitle =
    metadata.data?.title ?? localDoc?.title ?? formatJournalEntryTitle(dateSlug);
  const metadataIcon = metadata.data?.icon ?? localDoc?.icon ?? null;
  const [displayTitle, setDisplayTitle] = useState(metadataTitle);
  const [titleSource, setTitleSource] = useState(metadataTitle);

  if (metadataTitle !== titleSource) {
    setTitleSource(metadataTitle);
    setDisplayTitle(metadataTitle);
  }

  useEffect(() => {
    if (metadataTitle) onResolvedTitle(metadataTitle);
  }, [metadataTitle, onResolvedTitle]);

  useEffect(() => {
    if (contentLoading) return;
    onContentReady(dateSlug);
  }, [contentLoading, dateSlug, onContentReady]);

  const resolvedTitle = displayTitle;
  const editorBody = useMemo(
    () => getDocumentEditorBody(initialBody, resolvedTitle),
    [initialBody, resolvedTitle],
  );

  const handleDeleteJournalDocument = useCallback(async () => {
    try {
      await client.requestJson(
        `/api/v1/documents/${encodeURIComponent(documentId)}`,
        { method: "DELETE" },
      );
      navigate("/journal", { replace: true });
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
      const task = workspace.allTasks.find((entry) => entry.id === taskId);
      if (!task) return;
      const contact = task.contactId
        ? workspace.contacts.find((entry) => entry.id === task.contactId)
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
    [location.pathname, navigate, workspace.allTasks, workspace.contacts],
  );

  if (contentLoading) {
    return <JournalDetailSkeleton framed={false} includeWhoop={false} />;
  }

  return (
    <>
      <RegisterPageIcon icon={metadataIcon} />
      <RegisterEntityDeleteAction
        entityLabel={`journal entry "${formatJournalEntryTitle(dateSlug)}"`}
        onDelete={handleDeleteJournalDocument}
      />
      <MarkdownDocumentDetailView
        sectionLabel="Journal"
        title={resolvedTitle}
        resetKey={documentId}
        previewTitleEditable={false}
        embedded
        icon={
          <DocumentDetailIcon
            documentId={documentId}
            icon={metadataIcon}
            title={resolvedTitle}
            onSaveIcon={async (icon) => {
              const result = await workspace.updateDocumentIcon(
                documentId,
                icon,
              );
              if (!result.ok) return result;
              try {
                if (workspace.source === "powersync") {
                  await client.requestJson(
                    `/api/v1/documents/${encodeURIComponent(documentId)}`,
                    {
                      method: "PATCH",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({ icon }),
                    },
                  );
                }
                metadata.reload();
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
        }
        initialBody={editorBody}
        onSave={async (nextEditorBody) => {
          const nextContent = mergeJournalContent(
            resolvedTitle,
            nextEditorBody,
          );
          if (nextContent === initialBody) return;
          await saveContent(nextContent);
        }}
        onSaveTitle={async (title) => {
          const trimmed = title.trim();
          if (!trimmed) {
            return { ok: false as const, error: "Title is required." };
          }
          try {
            await client.requestJson(
              `/api/v1/documents/${encodeURIComponent(documentId)}`,
              {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ title: trimmed }),
              },
            );
            setDisplayTitle(trimmed);
            metadata.reload();
            return { ok: true as const };
          } catch (error) {
            return {
              ok: false as const,
              error:
                error instanceof Error ? error.message : "Could not rename.",
            };
          }
        }}
        footer={
          <JournalDueTasksFooter
            dateSlug={dateSlug}
            onSelectTask={handleSelectDueTask}
          />
        }
      />
    </>
  );
}

function JournalDueTasksFooter({
  dateSlug,
  onSelectTask,
}: {
  dateSlug: string;
  onSelectTask: (taskId: string) => void;
}) {
  const workspace = useDesktopWorkspaceData();
  const settings = useDesktopResource<{
    settings: Record<string, unknown>;
  }>((api) => api.requestJson("/api/v1/settings"));
  const calendarTimeZone = String(
    settings.data?.settings.timezone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
  );

  return (
    <JournalDueTasksSection
      dateSlug={dateSlug}
      tasks={workspace.allTasks}
      isLoading={!workspace.ready || settings.loading}
      calendarTimeZone={calendarTimeZone}
      onSelectTask={onSelectTask}
    />
  );
}
