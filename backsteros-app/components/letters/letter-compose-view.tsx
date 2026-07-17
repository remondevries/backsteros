"use client";

import type {
  Contact as ApiContact,
  Organization as ApiOrganization,
  Project as ApiProject,
} from "@backsteros/contracts";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  CONTENT_DETAIL_TITLE_CLASS,
  ContentDetailIconTitleHeader,
} from "@/components/content/content-detail-title-header";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
} from "@/components/content/content-markdown-view-layout";
import { useContentTitleEditorNavigation } from "@/components/content/use-content-title-editor-navigation";
import { DocumentMarkdownPreview } from "@/components/documents/document-markdown-preview";
import { LetterComposePropertiesPanel } from "@/components/letters/letter-compose-properties-panel";
import { LetterDetailIcon } from "@/components/letters/letter-detail-icon";
import { LetterLayoutBreadcrumb } from "@/components/letters/letter-layout-breadcrumb";
import { FloatingPillToggleDock } from "@/components/ui/floating-pill-toggle-dock";
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
  normalizeOrganization,
  normalizeProject,
} from "@/lib/entity-normalize";
import {
  getLettersHref,
  getProjectLetterHref,
} from "@/lib/entity-route-hrefs";
import { LETTER_PROPERTIES_PANEL_WIDTH_KEY } from "@/lib/letter-properties-panel";
import {
  createLetterAction,
  uploadLetterPdfAction,
} from "@/lib/mutations/letters";
import { mapOrganizationToAssignable } from "@/lib/organizations/assignable-organization";
import {
  getScopedProjectLetterHref,
  getScopedProjectLettersHref,
  type ProjectRouteScope,
} from "@/lib/project-route-scope";
import { mapProjectToAssignable } from "@/lib/projects/assignable-project";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";
import { isTaskStatus, type TaskStatus } from "@/lib/task-status";
import { flushSync } from "react-dom";

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

type LetterViewMode = "edit" | "preview";

export type LetterComposeViewProps = {
  /** Prefill project when search params are not used (e.g. empty project letters). */
  initialProjectId?: string;
  /** After create, prefer project letter URLs when set. */
  projectNavigate?: {
    projectKey: string;
    scope?: ProjectRouteScope;
  };
  /** Register the letters breadcrumb leaf (skip when a parent already registers one). */
  registerBreadcrumb?: boolean;
  /** Read status / project / org / contact defaults from the URL query string. */
  useSearchParamsDefaults?: boolean;
};

function LetterComposeViewInner({
  initialProjectId = "",
  projectNavigate,
  registerBreadcrumb = true,
  useSearchParamsDefaults = false,
}: LetterComposeViewProps) {
  const { catalog: mentionCatalog } = useMentionCatalog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const projectsResource = useApiResource<{ projects: ApiProject[] }>((client) =>
    client.requestJson("/api/v1/projects"),
  );
  const orgsResource = useApiResource<{ organizations: ApiOrganization[] }>(
    (client) => client.requestJson("/api/v1/organizations"),
  );
  const contactsResource = useApiResource<{ contacts: ApiContact[] }>((client) =>
    client.requestJson("/api/v1/contacts"),
  );

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

  const initialStatus: TaskStatus = (() => {
    if (!useSearchParamsDefaults) return "ready_to_start";
    const statusParam = searchParams.get("status");
    return statusParam && isTaskStatus(statusParam)
      ? statusParam
      : "ready_to_start";
  })();

  const [title, setTitle] = useState("New letter");
  const [context, setContext] = useState("");
  const [mode, setMode] = useState<LetterViewMode>("preview");
  const modeRef = useRef<LetterViewMode>(mode);
  modeRef.current = mode;
  const [editorActivated, setEditorActivated] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [dueDate, setDueDate] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [projectId, setProjectId] = useState(() => {
    if (useSearchParamsDefaults) {
      return searchParams.get("projectId")?.trim() || initialProjectId;
    }
    return initialProjectId;
  });
  const [organizationId, setOrganizationId] = useState(() =>
    useSearchParamsDefaults
      ? searchParams.get("organizationId")?.trim() || ""
      : "",
  );
  const [contactId, setContactId] = useState(() =>
    useSearchParamsDefaults ? searchParams.get("contactId")?.trim() || "" : "",
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  // Warm the editor chunk so Enter → edit does not race a cold dynamic import.
  useEffect(() => {
    void import("@/components/documents/document-markdown-editor");
  }, []);

  const activateEditMode = useCallback(
    ({ focusEditor = true }: { focusEditor?: boolean } = {}) => {
      setEditorActivated(true);
      modeRef.current = "edit";
      setMode("edit");
      if (focusEditor) {
        setEditorFocusRequest((value) => value + 1);
      }
    },
    [],
  );

  const switchToPreview = useCallback(() => {
    modeRef.current = "preview";
    setMode("preview");
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, []);

  const requestEditorFocus = useCallback(() => {
    setEditorFocusRequest((value) => value + 1);
  }, []);

  const focusTitle = useCallback(() => {
    titleInputRef.current?.focus();
    titleInputRef.current?.select();
  }, []);

  const { requestTitleFocus, handleLeaveTitleForEditor } =
    useContentTitleEditorNavigation({
      mode,
      activateEditMode,
      requestEditorFocus,
      focusTitle,
    });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || isBlockingModalOpen()) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "e") {
        event.preventDefault();
        if (modeRef.current === "edit") {
          switchToPreview();
        } else {
          activateEditMode();
        }
        return;
      }

      if (key === "p") {
        event.preventDefault();
        switchToPreview();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [activateEditMode, switchToPreview]);

  function navigateToCreatedLetter(result: {
    letterId: string;
    letterNumber: number | null;
  }) {
    if (projectNavigate) {
      if (result.letterNumber != null) {
        router.push(
          getScopedProjectLetterHref(
            projectNavigate.projectKey,
            result.letterNumber,
            projectNavigate.scope,
          ),
        );
        return;
      }
      router.push(
        `${getScopedProjectLettersHref(projectNavigate.projectKey, projectNavigate.scope)}/${encodeURIComponent(result.letterId)}`,
      );
      return;
    }

    const selectedProject = assignableProjects.find(
      (project) => project.id === projectId,
    );
    if (selectedProject && result.letterNumber != null) {
      router.push(getProjectLetterHref(selectedProject.key, result.letterNumber));
      return;
    }

    if (result.letterNumber != null) {
      router.push(getLettersHref(result.letterNumber));
      return;
    }

    router.push(`/letters/${encodeURIComponent(result.letterId)}`);
  }

  function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Letter title is required.");
      return;
    }

    if (selectedFile) {
      flushSync(() => {
        setUploadingPdf(true);
        setUploadProgress(null);
      });
    }

    startTransition(async () => {
      setError(null);
      const result = await createLetterAction({
        title: trimmedTitle,
        context,
        status,
        dueDate: dueDate || null,
        receivedDate: receivedDate || null,
        projectId: projectId || null,
        organizationId: organizationId || null,
        contactId: contactId || null,
      });

      if (!result.ok) {
        setUploadingPdf(false);
        setUploadProgress(null);
        setError(result.error);
        return;
      }

      if (selectedFile) {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        const upload = await uploadLetterPdfAction({
          letterId: result.letterId,
          file: selectedFile,
          onProgress: setUploadProgress,
        });
        setUploadingPdf(false);
        setUploadProgress(null);
        if (!upload.ok) {
          setError(upload.error);
          return;
        }
      }

      navigateToCreatedLetter(result);
    });
  }

  const viewModeToggle = (
    <SegmentedPillToggle
      value={mode}
      options={[
        { value: "edit", label: "Edit" },
        { value: "preview", label: "Preview" },
      ]}
      onChange={(nextMode) => {
        if (nextMode === "edit") {
          activateEditMode();
          return;
        }
        switchToPreview();
      }}
      ariaLabel="Letter view mode"
      className="pointer-events-auto"
    />
  );

  return (
    <div
      className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden lg:flex-row"
      data-content-detail
      data-content-view-mode={mode}
      data-detail-split=""
    >
      {registerBreadcrumb ? (
        <LetterLayoutBreadcrumb letterTitle={title.trim() || "New letter"} />
      ) : null}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="mx-auto w-full shrink-0">
          <ContentDetailIconTitleHeader
            icon={
              <LetterDetailIcon
                icon={null}
                title={title.trim() || "New letter"}
              />
            }
            title={
              <h1 className={`${CONTENT_DETAIL_TITLE_CLASS} w-full min-w-0`}>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      titleInputRef.current?.blur();
                      return;
                    }
                    if (
                      event.key === "Enter" ||
                      (event.key === "Tab" && !event.shiftKey)
                    ) {
                      event.preventDefault();
                      handleLeaveTitleForEditor();
                    }
                  }}
                  disabled={isPending}
                  aria-label="Letter name"
                  className="w-full border-none bg-transparent p-0 font-[inherit] text-[length:inherit] leading-[inherit] outline-none placeholder:text-foreground/40 disabled:opacity-60"
                  placeholder="Letter title"
                />
              </h1>
            }
          />
        </div>

        <ContentMarkdownViewLayout
          mode={mode}
          editorActivated={editorActivated}
          onToggleMode={() => {
            if (mode === "edit") {
              switchToPreview();
              return;
            }
            activateEditMode();
          }}
          editor={
            <DocumentMarkdownEditor
              value={context}
              onChange={setContext}
              disabled={isPending}
              ariaLabel="Letter notes"
              mentionCatalog={mentionCatalog}
              focusRequest={editorFocusRequest}
              onShiftTabFocusTitle={requestTitleFocus}
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
                  Add notes about this letter…
                </p>
              )}
            </ContentMarkdownPreviewColumn>
          }
        />
      </div>

      <ResizableSidePanel
        storageKey={LETTER_PROPERTIES_PANEL_WIDTH_KEY}
        defaultWidth={300}
        minWidth={240}
        maxWidth={480}
        className="pt-4"
      >
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <LetterComposePropertiesPanel
            status={status}
            dueDate={dueDate}
            receivedDate={receivedDate}
            projectId={projectId}
            organizationId={organizationId}
            contactId={contactId}
            selectedFile={selectedFile}
            uploading={uploadingPdf}
            uploadProgress={uploadProgress}
            assignableProjects={assignableProjects}
            assignableOrganizations={assignableOrganizations}
            assignableContacts={assignableContacts}
            isPending={isPending}
            error={error}
            onStatusChange={setStatus}
            onDueDateChange={setDueDate}
            onReceivedDateChange={setReceivedDate}
            onProjectChange={setProjectId}
            onOrganizationChange={(next) => {
              setOrganizationId(next);
              setContactId((current) => {
                if (!next || !current) return "";
                const allowed = assignableContacts.some(
                  (contact) =>
                    contact.id === current && contact.organizationId === next,
                );
                return allowed ? current : "";
              });
            }}
            onContactChange={setContactId}
            onFileSelect={setSelectedFile}
            onSave={handleSubmit}
          />
          <FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>
        </div>
      </ResizableSidePanel>
    </div>
  );
}

/** Shared create-letter UI for `/letters/new` and empty letters indexes. */
export function LetterComposeView(props: LetterComposeViewProps = {}) {
  return (
    <MentionCatalogProvider>
      <Suspense
        fallback={
          <div className="loading-list">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} />
            ))}
          </div>
        }
      >
        <LetterComposeViewInner {...props} />
      </Suspense>
    </MentionCatalogProvider>
  );
}
