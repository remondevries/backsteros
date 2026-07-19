"use client";

import type {
  Contact as ApiContact,
  Letter as ApiLetter,
  LetterAttachment,
  Organization as ApiOrganization,
  Project as ApiProject,
} from "@backsteros/contracts";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ContactRouteBreadcrumb } from "@/components/contacts/contact-route-breadcrumb";
import { ContentDetailIconTitleHeader } from "@/components/content/content-detail-title-header";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
} from "@/components/content/content-markdown-view-layout";
import { useContentTitleEditorNavigation } from "@/components/content/use-content-title-editor-navigation";
import { useMarkdownDetailEditor } from "@/components/content/use-markdown-detail-editor";
import { DocumentMarkdownPreview } from "@/components/documents/document-markdown-preview";
import { RegisterEntityDeleteAction } from "@/components/entity-actions/register-entity-delete-action";
import { DetailBreadcrumbLeaf } from "@/components/navigation/detail-breadcrumb-leaf";
import { LetterDetailIcon } from "@/components/letters/letter-detail-icon";
import { LetterDetailPropertiesPanel } from "@/components/letters/letter-detail-properties-panel";
import { LetterDetailSkeleton } from "@/components/letters/letter-detail-skeleton";
import { LetterLayoutBreadcrumb } from "@/components/letters/letter-layout-breadcrumb";
import { LetterPdfSection } from "@/components/letters/letter-pdf-section";
import { LetterTitleEditor } from "@/components/letters/letter-title-editor";
import { LETTER_PDF_VISIBLE_KEY } from "@/components/letters/use-letter-pdf-layout-collapse";
import { ProjectRouteBreadcrumb } from "@/components/projects/project-route-breadcrumb";
import { FloatingPillToggleDock } from "@/components/ui/floating-pill-toggle-dock";
import { ResizableBottomPanel } from "@/components/ui/resizable-bottom-panel";
import { ResizableSidePanel } from "@/components/ui/resizable-side-panel";
import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import {
  MentionCatalogProvider,
  useMentionCatalog,
} from "@/hooks/use-mention-catalog";
import { useApiResource } from "@/lib/api-context";
import { mapContactToAssignable } from "@/lib/contacts/assignable-contact";
import {
  normalizeContact,
  normalizeLetter,
  normalizeOrganization,
  normalizeProject,
} from "@/lib/entity-normalize";
import { letterMatchesRouteSlug } from "@/lib/entity-route-hrefs";
import { getLetterDisplayId } from "@/lib/letter-display-id";
import { LETTER_PROPERTIES_PANEL_WIDTH_KEY } from "@/lib/letter-properties-panel";
import { resolveLetterDeleteRedirectHref, getLetterDeleteSectionHref } from "@/lib/letters/letter-delete-redirect";
import { deleteLetterAction, updateLetterContextAction } from "@/lib/mutations/letters";
import {
  mergeLocalAndApiByUpdatedAt,
} from "@/lib/sync/prefer-local-or-api";
import { mapOrganizationToAssignable } from "@/lib/organizations/assignable-organization";
import { usePowerSyncQuery } from "@/lib/powersync-context";
import { mapProjectToAssignable } from "@/lib/projects/assignable-project";
import { useLetterPdfAttachmentShortcuts } from "@/lib/shortcuts/letter-pdf-attachment-shortcut";
import { useLetterPdfMaximizeShortcut } from "@/lib/shortcuts/letter-pdf-maximize-shortcut";
import { useLetterPdfToggleShortcut } from "@/lib/shortcuts/letter-pdf-toggle-shortcut";

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

function snakeRow(row: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())] =
      value;
  }
  return output;
}

function readStoredPdfOpen(): boolean {
  if (typeof window === "undefined") return true;
  const stored = window.localStorage.getItem(LETTER_PDF_VISIBLE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  return true;
}

type LetterDetailScreenProps = {
  letterRouteParam: string;
  backHref?: string;
};

export function LetterDetailScreen(props: LetterDetailScreenProps) {
  return (
    <MentionCatalogProvider>
      <LetterDetailScreenInner {...props} />
    </MentionCatalogProvider>
  );
}

function LetterDetailMissingRedirect({
  pathname,
  backHref,
}: {
  pathname: string;
  backHref: string;
}) {
  const router = useRouter();

  useEffect(() => {
    router.replace(getLetterDeleteSectionHref(pathname) || backHref);
  }, [backHref, pathname, router]);

  return <LetterDetailSkeleton framed={false} />;
}

function LetterDetailScreenInner({
  letterRouteParam,
  backHref = "/letters",
}: LetterDetailScreenProps) {
  const pathname = usePathname();
  const router = useRouter();
  const layoutRef = useRef<HTMLDivElement>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);
  const propertiesPanelRef = useRef<HTMLElement | null>(null);
  const pdfPanelRef = useRef<HTMLElement | null>(null);
  const { catalog: mentionCatalog } = useMentionCatalog();
  const lettersResource = useApiResource<{ letters: ApiLetter[] }>((client) =>
    client.requestJson("/api/v1/letters"),
  );
  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );
  const localLetters = usePowerSyncQuery<Record<string, unknown>>(
    "SELECT * FROM letters WHERE deleted_at IS NULL",
  );

  const [pdfOpen, setPdfOpen] = useState(readStoredPdfOpen);
  const [pdfMaximized, setPdfMaximized] = useState(false);
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<
    string | null
  >(null);
  const pendingAttachmentIdRef = useRef<string | null>(null);

  const letter = useMemo(() => {
    const localRows = localLetters.data?.map(
      (row) => snakeRow(row) as ApiLetter,
    );
    const apiRows = lettersResource.data?.letters;
    const matchSlug = (entry: ApiLetter) =>
      letterMatchesRouteSlug(entry, letterRouteParam);
    const merged = mergeLocalAndApiByUpdatedAt(
      localRows?.filter(matchSlug) ?? [],
      apiRows?.filter(matchSlug) ?? [],
    );
    const match = merged[0] ?? null;
    return match ? normalizeLetter(match) : null;
  }, [letterRouteParam, lettersResource.data, localLetters.data]);

  const attachmentsResource = useApiResource<{
    attachments: LetterAttachment[];
  }>(
    (client) => {
      if (!letter?.id) {
        return Promise.resolve({ attachments: [] });
      }
      return client.listLetterAttachments(letter.id);
    },
    [letter?.id],
  );

  const attachments = attachmentsResource.data?.attachments ?? [];

  useEffect(() => {
    if (attachments.length === 0) {
      setSelectedAttachmentId(null);
      return;
    }
    const pending = pendingAttachmentIdRef.current;
    if (pending && attachments.some((entry) => entry.id === pending)) {
      pendingAttachmentIdRef.current = null;
      setSelectedAttachmentId(pending);
      return;
    }
    setSelectedAttachmentId((current) => {
      if (current && attachments.some((entry) => entry.id === current)) {
        return current;
      }
      return attachments[0]?.id ?? null;
    });
  }, [attachments]);

  const hasPdf = attachments.length > 0 || Boolean(letter?.storageKey);
  const pdfPanelOpen = pdfOpen && hasPdf;
  const pdfFillsContent = pdfMaximized && pdfPanelOpen;

  const assignableProjects = useMemo(
    () =>
      (projectsResource.data?.projects ?? []).map((entry) =>
        mapProjectToAssignable(normalizeProject(entry)),
      ),
    [projectsResource.data],
  );

  const assignableOrganizations = useMemo(
    () =>
      (orgsResource.data?.organizations ?? []).map((entry) =>
        mapOrganizationToAssignable(normalizeOrganization(entry)),
      ),
    [orgsResource.data],
  );

  const assignableContacts = useMemo(
    () =>
      (contactsResource.data?.contacts ?? []).map((entry) =>
        mapContactToAssignable({
          ...normalizeContact(entry),
          organization: null,
        }),
      ),
    [contactsResource.data],
  );

  const saveContext = useCallback(
    (nextContext: string) => {
      if (!letter) return null;

      const trimmed = nextContext.trim();
      const current = (letter.context ?? "").trim();
      if (trimmed === current) return null;

      return updateLetterContextAction({
        letterId: letter.id,
        context: trimmed,
      }).then((result) => {
        if (result.ok) {
          lettersResource.reload();
        }
        return result;
      });
    },
    [letter, lettersResource],
  );

  const {
    value: context,
    mode,
    editorActivated,
    editorFocusRequest,
    error: contextError,
    isPending,
    handleChange: handleContextChange,
    handleBlur: handleContextBlurSave,
    requestEditorFocus,
    activateEditMode,
    switchToEdit,
    switchToPreview,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: letter?.context ?? "",
    save: saveContext,
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

  function togglePdfOpen() {
    setPdfOpen((current) => {
      const next = !current;
      if (!next) {
        setPdfMaximized(false);
      }
      window.localStorage.setItem(LETTER_PDF_VISIBLE_KEY, next ? "1" : "0");
      return next;
    });
  }

  function openPdfPanel() {
    setPdfOpen(true);
    window.localStorage.setItem(LETTER_PDF_VISIBLE_KEY, "1");
  }

  function togglePdfMaximized() {
    setPdfMaximized((current) => {
      const next = !current;
      if (next) {
        setPdfOpen(true);
        window.localStorage.setItem(LETTER_PDF_VISIBLE_KEY, "1");
      }
      return next;
    });
  }

  function selectAttachment(attachmentId: string) {
    const nextId = attachmentId || null;
    pendingAttachmentIdRef.current = nextId;
    setSelectedAttachmentId(nextId);
    openPdfPanel();
  }

  const attachmentIds = useMemo(
    () => attachments.map((attachment) => attachment.id),
    [attachments],
  );

  useLetterPdfToggleShortcut(togglePdfOpen);
  useLetterPdfMaximizeShortcut(togglePdfMaximized);
  useLetterPdfAttachmentShortcuts({
    attachmentIds,
    hasLegacyPdf: Boolean(letter?.storageKey),
    onSelect: selectAttachment,
  });

  useEffect(() => {
    if (!pdfMaximized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPdfMaximized(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pdfMaximized]);

  useEffect(() => {
    if (!hasPdf) {
      setPdfMaximized(false);
    }
  }, [hasPdf]);

  const allLetters = useMemo(() => {
    const localRows =
      localLetters.data?.map((row) =>
        normalizeLetter(snakeRow(row) as ApiLetter),
      ) ?? [];
    const apiRows =
      lettersResource.data?.letters.map((entry) => normalizeLetter(entry)) ??
      [];
    return mergeLocalAndApiByUpdatedAt(localRows, apiRows);
  }, [lettersResource.data, localLetters.data]);

  const handleDeleteLetter = useCallback(async () => {
    if (!letter) {
      return { ok: false as const, error: "Letter is required." };
    }

    const projectKey =
      assignableProjects.find((project) => project.id === letter.projectId)
        ?.key ?? null;

    const redirectHref = resolveLetterDeleteRedirectHref({
      pathname,
      deletedLetter: letter,
      letters: allLetters,
      projectKey,
    });

    const result = await deleteLetterAction({
      letterId: letter.id,
    });
    if (!result.ok) {
      return result;
    }

    router.replace(redirectHref);
    return { ok: true as const, redirectHref };
  }, [allLetters, assignableProjects, letter, pathname, router]);

  if (lettersResource.loading && !letter) {
    return <LetterDetailSkeleton framed={false} />;
  }

  if (!letter) {
    return <LetterDetailMissingRedirect pathname={pathname} backHref={backHref} />;
  }

  const displayId = getLetterDisplayId(letter);
  const deleteEntityLabel = displayId
    ? `letter ${displayId}`
    : `letter "${letter.title}"`;
  const projectLetterMatch = pathname.match(/^\/projects\/([^/]+)\/letters(?:\/|$)/);
  const contactLetterMatch = pathname.match(/^\/contacts\/([^/]+)\/letters(?:\/|$)/);
  const orgLetterMatch = pathname.match(
    /^\/organizations\/([^/]+)\/letters(?:\/|$)/,
  );
  const orgContactLetterMatch = pathname.match(
    /^\/organizations\/([^/]+)\/contacts\/([^/]+)\/letters(?:\/|$)/,
  );
  const letterBreadcrumbTitle = displayId
    ? `${displayId} ${letter.title}`
    : letter.title;

  const letterDetailIcon = (
    <LetterDetailIcon icon={letter.icon} title={letter.title} />
  );

  const letterTitleEditor = (
    <LetterTitleEditor
      letterId={letter.id}
      value={letter.title}
      renameFocusRequest={titleRenameFocusRequest}
      onLeaveTitle={handleLeaveTitleForEditor}
      onSaved={() => lettersResource.reload()}
    />
  );

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
      ariaLabel="Letter view mode"
      className="pointer-events-auto"
    />
  );

  const letterBreadcrumb =
    projectLetterMatch?.[1] != null ? (
      <>
        <ProjectRouteBreadcrumb
          projectRouteParam={decodeURIComponent(projectLetterMatch[1])}
        />
        <DetailBreadcrumbLeaf label={letter.title} displayId={displayId} />
      </>
    ) : orgContactLetterMatch?.[1] != null &&
      orgContactLetterMatch[2] != null ? (
      <LetterLayoutBreadcrumb
        letterTitle={letterBreadcrumbTitle}
        contactContext={{
          contactRouteParam: decodeURIComponent(orgContactLetterMatch[2]),
          contactName:
            assignableContacts.find((c) => c.id === letter.contactId)?.name ??
            decodeURIComponent(orgContactLetterMatch[2]),
          organizationRouteParam: decodeURIComponent(orgContactLetterMatch[1]),
          organizationName:
            assignableOrganizations.find((o) => o.id === letter.organizationId)
              ?.name ?? decodeURIComponent(orgContactLetterMatch[1]),
        }}
      />
    ) : contactLetterMatch?.[1] != null ? (
      <>
        <ContactRouteBreadcrumb
          contactRouteParam={decodeURIComponent(contactLetterMatch[1])}
        />
        <DetailBreadcrumbLeaf label={letter.title} displayId={displayId} />
      </>
    ) : orgLetterMatch?.[1] != null ? (
      <LetterLayoutBreadcrumb
        letterTitle={letterBreadcrumbTitle}
        organizationContext={{
          organizationRouteParam: decodeURIComponent(orgLetterMatch[1]),
          organizationName:
            assignableOrganizations.find((o) => o.id === letter.organizationId)
              ?.name ?? decodeURIComponent(orgLetterMatch[1]),
        }}
      />
    ) : (
      <LetterLayoutBreadcrumb letterTitle={letterBreadcrumbTitle} />
    );

  return (
    <>
      {letterBreadcrumb}
      <RegisterEntityDeleteAction
        entityLabel={deleteEntityLabel}
        onDelete={handleDeleteLetter}
      />
      <div
        ref={layoutRef}
        className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row"
        data-content-detail
        data-content-view-mode={mode}
        data-detail-split=""
      >
        <div
          ref={contentColumnRef}
          className="document-pdf-main flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {!pdfFillsContent ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="mx-auto w-full shrink-0">
                <ContentDetailIconTitleHeader
                  icon={letterDetailIcon}
                  title={letterTitleEditor}
                />
              </div>
              <ContentMarkdownViewLayout
                mode={mode}
                editorActivated={editorActivated}
                onToggleMode={toggleViewMode}
                editor={
                  <DocumentMarkdownEditor
                    value={context}
                    onChange={handleContextChange}
                    onBlur={handleContextBlurSave}
                    disabled={isPending}
                    ariaLabel="Letter notes"
                    focusRequest={editorFocusRequest}
                    onShiftTabFocusTitle={requestTitleFocus}
                    mentionCatalog={mentionCatalog}
                  />
                }
                preview={
                  <ContentMarkdownPreviewColumn includeTopInset={false}>
                    {context.trim() ? (
                      <DocumentMarkdownPreview
                        body={context}
                        mentionCatalog={mentionCatalog}
                      />
                    ) : (
                      <p className="text-sm text-foreground/40">
                        This letter is empty.
                      </p>
                    )}
                  </ContentMarkdownPreviewColumn>
                }
              />

              {contextError ? (
                <p
                  className="shrink-0 px-4 pb-3 text-xs text-red-400"
                  role="alert"
                >
                  {contextError}
                </p>
              ) : null}
            </div>
          ) : null}

          {pdfFillsContent ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <LetterPdfSection
                letter={letter}
                attachments={attachments}
                selectedAttachmentId={selectedAttachmentId}
                pdfOpen
                pdfMaximized
                onSelectAttachment={selectAttachment}
                onTogglePdf={togglePdfOpen}
                onToggleMaximize={togglePdfMaximized}
                onSaved={() => {
                  lettersResource.reload();
                  attachmentsResource.reload();
                }}
              />
            </div>
          ) : pdfPanelOpen ? (
            <ResizableBottomPanel
              storageKey="letter-pdf-panel-height"
              containerRef={contentColumnRef}
              panelRef={pdfPanelRef}
              defaultHeight={360}
              minHeight={180}
              maxHeightRatio={0.78}
              className="border-t border-white/10"
            >
              <LetterPdfSection
                letter={letter}
                attachments={attachments}
                selectedAttachmentId={selectedAttachmentId}
                pdfOpen
                pdfMaximized={false}
                onSelectAttachment={selectAttachment}
                onTogglePdf={togglePdfOpen}
                onToggleMaximize={togglePdfMaximized}
                onSaved={() => {
                  lettersResource.reload();
                  attachmentsResource.reload();
                }}
              />
            </ResizableBottomPanel>
          ) : (
            <div className="letter-pdf-section-collapsed shrink-0 border-t border-white/10 pb-0">
              <LetterPdfSection
                letter={letter}
                attachments={attachments}
                selectedAttachmentId={selectedAttachmentId}
                pdfOpen={false}
                pdfMaximized={false}
                onSelectAttachment={selectAttachment}
                onTogglePdf={togglePdfOpen}
                onToggleMaximize={togglePdfMaximized}
                onSaved={() => {
                  lettersResource.reload();
                  attachmentsResource.reload();
                }}
              />
            </div>
          )}
        </div>

        <ResizableSidePanel
          storageKey={LETTER_PROPERTIES_PANEL_WIDTH_KEY}
          defaultWidth={300}
          minWidth={240}
          maxWidth={480}
          panelRef={propertiesPanelRef}
          className="pt-4"
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <LetterDetailPropertiesPanel
              letter={letter}
              assignableProjects={assignableProjects}
              assignableOrganizations={assignableOrganizations}
              assignableContacts={assignableContacts}
            />

            <FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>
          </div>
        </ResizableSidePanel>
      </div>
    </>
  );
}
