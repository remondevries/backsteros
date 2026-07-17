"use client";

import type { Document, DocumentContent } from "@backsteros/contracts";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  buildContentIconTitleHeaders,
  ContentDetailStaticTitle,
} from "@/components/content/content-detail-title-header";
import {
  ContentMarkdownPreviewBody,
  ContentMarkdownViewLayout,
} from "@/components/content/content-markdown-view-layout";
import { RegisterEntityDeleteAction } from "@/components/entity-actions/register-entity-delete-action";
import { DetailBreadcrumbLeaf } from "@/components/navigation/detail-breadcrumb-leaf";
import { JournalLayoutBreadcrumb } from "@/components/journal/journal-layout-breadcrumb";
import { KnowledgeLayoutBreadcrumb } from "@/components/knowledge/knowledge-layout-breadcrumb";
import { ProjectRouteBreadcrumb } from "@/components/projects/project-route-breadcrumb";
import { useContentTitleEditorNavigation } from "@/components/content/use-content-title-editor-navigation";
import { useMarkdownDetailEditor } from "@/components/content/use-markdown-detail-editor";
import { DocumentDetailIcon } from "@/components/documents/document-detail-icon";
import { DocumentDetailSkeleton } from "@/components/documents/document-detail-skeleton";
import { DocumentMarkdownPreview } from "@/components/documents/document-markdown-preview";
import { DocumentTitleEditor } from "@/components/documents/document-title-editor";
import { JournalDueTasksSection } from "@/components/journal/journal-due-tasks-section";
import { JournalDetailSkeleton } from "@/components/journal/journal-detail-skeleton";
import { JournalWhoopLeading } from "@/components/journal/journal-whoop-leading";
import { KnowledgeDetailSkeleton } from "@/components/knowledge/knowledge-detail-skeleton";
import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import {
  MentionCatalogProvider,
  useMentionCatalog,
} from "@/hooks/use-mention-catalog";
import {
  apiErrorMessage,
  useApiResource,
  useAppApi,
} from "@/lib/api-context";
import { getProjectDocumentHref } from "@/lib/document-navigation-path";
import { DOCUMENT_CONTENT_MAX_WIDTH } from "@/lib/documents/content-layout";
import {
  getDocumentEditorBody,
  mergeJournalContent,
  serializeDocumentBody,
} from "@/lib/documents/editor-content";
import { parseMarkdownDocument } from "@/lib/documents/frontmatter";
import { stripDuplicateDocumentTitleHeading } from "@/lib/documents/titles";
import { isEntityRouteUuid } from "@/lib/entity-slugs";
import { getKnowledgeDocumentHref } from "@/lib/knowledge/navigation-path";
import { deleteDocumentEntryAction } from "@/lib/mutations/documents";
import { usePowerSyncQuery } from "@/lib/powersync-context";

const DocumentMarkdownEditor = dynamic(
  () =>
    import("@/components/documents/document-markdown-editor").then(
      (module) => module.DocumentMarkdownEditor,
    ),
  {
    ssr: false,
    loading: () => null,
  },
);

function snakeToCamelRow(row: Record<string, unknown>): Document {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output as Document;
}

function StateView({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  if (loading) {
    return (
      <div className="loading-list">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="error-state">
        <strong>Could not load this view</strong>
        <p>{error.message}</p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </div>
    );
  }
  return null;
}

type DocumentDetailScreenProps = {
  routeParam: string;
  backHref?: string;
  projectRouteParam?: string;
  /** Which section chrome to register for breadcrumbs. */
  breadcrumbContext?: "knowledge" | "journal" | "project";
  /** Journal entry date (`YYYY-MM-DD`); renders the due-tasks section below the entry. */
  journalDateSlug?: string;
};

export function DocumentDetailScreen(props: DocumentDetailScreenProps) {
  return (
    <MentionCatalogProvider>
      <DocumentDetailScreenInner {...props} />
    </MentionCatalogProvider>
  );
}

function DocumentDetailScreenInner({
  routeParam,
  backHref: _backHref = "/knowledge",
  projectRouteParam,
  breadcrumbContext = projectRouteParam ? "project" : "knowledge",
  journalDateSlug,
}: DocumentDetailScreenProps) {
  void _backHref;
  const router = useRouter();
  const { catalog: mentionCatalog } = useMentionCatalog();
  const { client } = useAppApi();
  const resolveFromList = !isEntityRouteUuid(routeParam);
  const documentsResource = useApiResource<{ documents: Document[] }>(
    (api) => {
      if (!resolveFromList) {
        return Promise.resolve({ documents: [] as Document[] });
      }
      if (projectRouteParam) {
        return api.requestJson(
          `/api/v1/documents?type=project&projectId=${encodeURIComponent(projectRouteParam)}`,
        );
      }
      return api.requestJson("/api/v1/documents?type=knowledge");
    },
    [projectRouteParam, resolveFromList],
  );
  const localDocuments = usePowerSyncQuery<Record<string, unknown>>(
    resolveFromList
      ? projectRouteParam
        ? "SELECT * FROM documents WHERE deleted_at IS NULL AND type = 'project' AND (project_id = ? OR project_id IN (SELECT id FROM projects WHERE lower(key) = lower(?)))"
        : "SELECT * FROM documents WHERE deleted_at IS NULL AND type = 'knowledge'"
      : null,
    resolveFromList && projectRouteParam
      ? [projectRouteParam, projectRouteParam]
      : [],
  );
  const documentId = useMemo(() => {
    if (!resolveFromList) return routeParam;
    const rows =
      localDocuments.data?.map(snakeToCamelRow) ??
      documentsResource.data?.documents ??
      [];
    const match = rows.find(
      (document) =>
        document.id === routeParam ||
        ("path" in document && document.path === routeParam) ||
        ("path" in document &&
          document.path === decodeURIComponent(routeParam)),
    );
    return match?.id ?? routeParam;
  }, [
    documentsResource.data,
    localDocuments.data,
    resolveFromList,
    routeParam,
  ]);

  const metadata = useApiResource<Document>(
    (api) =>
      api.requestJson(`/api/v1/documents/${encodeURIComponent(documentId)}`),
    [documentId],
  );
  const content = useApiResource<DocumentContent>(
    (api) =>
      api.requestJson(
        `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
      ),
    [documentId],
  );

  const initialContent = content.data?.content ?? "";
  const contentVersion = content.data?.contentVersion;

  const save = useCallback(
    (nextContent: string) => {
      if (!content.data || nextContent === content.data.content) {
        return null;
      }

      return (async () => {
        try {
          await client.requestJson(
            `/api/v1/documents/${encodeURIComponent(documentId)}/content`,
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                content: nextContent,
                ifMatchVersion: contentVersion,
              }),
            },
          );
          content.reload();
          return { ok: true as const };
        } catch (error) {
          toast.error(apiErrorMessage(error));
          return { ok: false as const, error: apiErrorMessage(error) };
        }
      })();
    },
    [client, content, contentVersion, documentId],
  );

  const {
    value: markdown,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    isPending,
    handleChange,
    handleBlur: handleBlurSave,
    requestEditorFocus,
    activateEditMode,
    switchToEdit,
    switchToPreview,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: initialContent,
    save,
    blurOnPreview: true,
  });

  const {
    titleRenameFocusRequest,
    requestTitleFocus,
    handleLeaveTitleForEditor,
  } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const [displayTitle, setDisplayTitle] = useState(metadata.data?.title ?? "");
  const [titleSource, setTitleSource] = useState(metadata.data?.title ?? "");
  const metadataTitle = metadata.data?.title ?? "";

  if (metadataTitle !== titleSource) {
    setTitleSource(metadataTitle);
    setDisplayTitle(metadataTitle);
  }

  const isJournal = breadcrumbContext === "journal";
  const isKnowledge = breadcrumbContext === "knowledge";
  const isProject = breadcrumbContext === "project";

  const { body: parsedBody } = parseMarkdownDocument(markdown);
  const previewBody = stripDuplicateDocumentTitleHeading(
    parsedBody || markdown,
    displayTitle,
  );
  const editorBody = useMemo(
    () => getDocumentEditorBody(markdown, displayTitle),
    [displayTitle, markdown],
  );

  function handleContentChange(nextEditorBody: string) {
    handleChange(
      isJournal
        ? mergeJournalContent(displayTitle, nextEditorBody)
        : serializeDocumentBody(nextEditorBody),
    );
  }

  const listLoading =
    localDocuments.data === null && documentsResource.loading;
  const loading = listLoading || metadata.loading || content.loading;

  const handleDeleteDocument = useCallback(async () => {
    const result = await deleteDocumentEntryAction({ id: documentId });
    if (!result.ok) {
      return result;
    }

    const redirectHref =
      breadcrumbContext === "project" && projectRouteParam
        ? getProjectDocumentHref(projectRouteParam, "")
        : breadcrumbContext === "journal"
          ? "/journal"
          : getKnowledgeDocumentHref("");
    router.replace(redirectHref);
    return { ok: true as const };
  }, [breadcrumbContext, documentId, projectRouteParam, router]);

  const viewModeToggle = (
    <SegmentedPillToggle
      value={mode}
      options={[
        { value: "edit", label: "Edit" },
        { value: "preview", label: "Preview" },
      ]}
      onChange={(nextMode) => {
        if (nextMode === "edit") {
          switchToEdit();
          return;
        }
        switchToPreview();
      }}
      ariaLabel="Document view mode"
      className="pointer-events-auto"
    />
  );

  if (loading || !metadata.data || !content.data) {
    if (isJournal) {
      return (
        <div
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          data-content-detail
        >
          <JournalLayoutBreadcrumb />
          {metadata.error || content.error ? (
            <StateView
              loading={false}
              error={metadata.error ?? content.error}
              retry={() => {
                documentsResource.reload();
                metadata.reload();
                content.reload();
              }}
            />
          ) : (
            <JournalDetailSkeleton framed={false} />
          )}
        </div>
      );
    }

    if (isKnowledge) {
      return (
        <div
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          data-content-detail
        >
          <KnowledgeLayoutBreadcrumb />
          {metadata.error || content.error ? (
            <StateView
              loading={false}
              error={metadata.error ?? content.error}
              retry={() => {
                documentsResource.reload();
                metadata.reload();
                content.reload();
              }}
            />
          ) : (
            <KnowledgeDetailSkeleton framed={false} />
          )}
        </div>
      );
    }

    if (isProject && projectRouteParam) {
      return (
        <div
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          data-content-detail
        >
          <ProjectRouteBreadcrumb projectRouteParam={projectRouteParam} />
          {metadata.error || content.error ? (
            <StateView
              loading={false}
              error={metadata.error ?? content.error}
              retry={() => {
                documentsResource.reload();
                metadata.reload();
                content.reload();
              }}
            />
          ) : (
            <DocumentDetailSkeleton framed={false} />
          )}
        </div>
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-1 flex-col" data-content-detail>
        <StateView
          loading={loading}
          error={metadata.error ?? content.error}
          retry={() => {
            documentsResource.reload();
            metadata.reload();
            content.reload();
          }}
        />
      </div>
    );
  }

  const documentDetailIcon = (
    <DocumentDetailIcon
      documentId={documentId}
      icon={metadata.data.icon}
      title={displayTitle}
    />
  );

  const documentTitleEditor = (
    <DocumentTitleEditor
      documentId={documentId}
      value={displayTitle}
      renameFocusRequest={titleRenameFocusRequest}
      onLeaveTitle={handleLeaveTitleForEditor}
      onTitleSaved={(title) => {
        setDisplayTitle(title);
        metadata.reload();
      }}
    />
  );

  const { editHeader, previewTitleHeader } = buildContentIconTitleHeaders({
    icon: documentDetailIcon,
    editTitle: documentTitleEditor,
    previewTitle: (
      <ContentDetailStaticTitle>{displayTitle}</ContentDetailStaticTitle>
    ),
  });

  return (
    <div
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
      data-content-detail
      data-content-view-mode={mode}
    >
      <RegisterEntityDeleteAction
        entityLabel={`document "${displayTitle}"`}
        onDelete={handleDeleteDocument}
      />
      {breadcrumbContext === "project" && projectRouteParam ? (
        <ProjectRouteBreadcrumb projectRouteParam={projectRouteParam} />
      ) : breadcrumbContext === "journal" ? (
        <JournalLayoutBreadcrumb />
      ) : (
        <KnowledgeLayoutBreadcrumb />
      )}
      <DetailBreadcrumbLeaf label={displayTitle} />
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {breadcrumbContext === "journal" && journalDateSlug ? (
          <div
            className="mx-auto w-full shrink-0 px-4 pt-8"
            style={{ maxWidth: DOCUMENT_CONTENT_MAX_WIDTH }}
          >
            <JournalWhoopLeading dateSlug={journalDateSlug} />
          </div>
        ) : null}
        <ContentMarkdownViewLayout
          mode={mode}
          editorActivated={editorActivated}
          editHeader={editHeader}
          onToggleMode={toggleViewMode}
          editor={
            <DocumentMarkdownEditor
              value={editorBody}
              onChange={handleContentChange}
              onBlur={handleBlurSave}
              disabled={isPending}
              ariaLabel="Document content"
              mentionCatalog={mentionCatalog}
              focusRequest={editorFocusRequest}
              onShiftTabFocusTitle={requestTitleFocus}
            />
          }
          preview={
            <>
              <ContentMarkdownPreviewBody titleHeader={previewTitleHeader}>
                {previewBody.trim() ? (
                  <DocumentMarkdownPreview
                    body={previewBody}
                    mentionCatalog={mentionCatalog}
                  />
                ) : (
                  <p className="text-sm text-foreground/40">
                    This document is empty.
                  </p>
                )}
              </ContentMarkdownPreviewBody>
              {isJournal && journalDateSlug ? (
                <JournalDueTasksSection dateSlug={journalDateSlug} />
              ) : null}
            </>
          }
          toggle={viewModeToggle}
        />
      </div>

      {error ? (
        <p className="shrink-0 px-4 pb-3 text-xs text-red-400" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
