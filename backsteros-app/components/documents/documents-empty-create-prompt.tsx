"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

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
import { DocumentOcticon } from "@/components/documents/document-octicon";
import { FloatingPillToggleDock } from "@/components/ui/floating-pill-toggle-dock";
import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import {
  MentionCatalogProvider,
  useMentionCatalog,
} from "@/hooks/use-mention-catalog";
import { getProjectDocumentHref } from "@/lib/document-navigation-path";
import { getKnowledgeDocumentHref } from "@/lib/knowledge/navigation-path";
import {
  createDocumentAction,
  createKnowledgeDocumentAction,
} from "@/lib/mutations/documents";
import type { ProjectRouteScope } from "@/lib/project-route-scope";
import { isBlockingModalOpen } from "@/lib/shortcuts/is-blocking-modal-open";

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

type DocumentViewMode = "edit" | "preview";

type DocumentsEmptyCreatePromptProps =
  | { variant: "knowledge" }
  | {
      variant: "project";
      projectId: string;
      projectKey: string;
      scope?: ProjectRouteScope;
    };

/**
 * Empty documents pane matching letter create: icon + title + markdown
 * preview/edit shell (preview by default; CodeMirror activates on demand).
 */
function DocumentsEmptyCreatePromptInner(
  props: DocumentsEmptyCreatePromptProps,
) {
  const router = useRouter();
  const { catalog: mentionCatalog } = useMentionCatalog();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("New document");
  const [markdown, setMarkdown] = useState("");
  const [mode, setMode] = useState<DocumentViewMode>("preview");
  const modeRef = useRef<DocumentViewMode>(mode);
  modeRef.current = mode;
  const [editorActivated, setEditorActivated] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
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

  function createDocument() {
    if (isPending) return;

    const nextTitle = title.trim() || "Untitled";

    startTransition(async () => {
      const result =
        props.variant === "knowledge"
          ? await createKnowledgeDocumentAction({
              title: nextTitle,
              content: markdown,
            })
          : await createDocumentAction({
              projectId: props.projectId,
              title: nextTitle,
              content: markdown,
            });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      const href =
        props.variant === "knowledge"
          ? getKnowledgeDocumentHref(result.relativePath || result.documentId)
          : getProjectDocumentHref(
              props.projectKey,
              result.relativePath || result.documentId,
              props.scope,
            );

      router.push(href);
    });
  }

  const documentIcon = (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-white/10 bg-white/5 text-foreground"
      aria-hidden="true"
    >
      <DocumentOcticon icon={null} size={16} className="text-foreground/85" />
    </span>
  );

  const titleInput = (
    <h1 className={`${CONTENT_DETAIL_TITLE_CLASS} w-full min-w-0`}>
      <input
        ref={titleInputRef}
        type="text"
        value={title}
        disabled={isPending}
        placeholder="Document title"
        aria-label="Document title"
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
        className="w-full border-none bg-transparent p-0 font-[inherit] text-[length:inherit] leading-[inherit] text-foreground outline-none placeholder:text-foreground/35 disabled:opacity-60"
      />
    </h1>
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
          activateEditMode();
          return;
        }
        switchToPreview();
      }}
      ariaLabel="Document view mode"
      className="pointer-events-auto"
    />
  );

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      data-content-detail
      data-content-view-mode={mode}
    >
      <div className="mx-auto w-full shrink-0">
        <ContentDetailIconTitleHeader
          icon={documentIcon}
          title={titleInput}
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
            value={markdown}
            onChange={setMarkdown}
            disabled={isPending}
            ariaLabel="Document content"
            mentionCatalog={mentionCatalog}
            focusRequest={editorFocusRequest}
            onShiftTabFocusTitle={requestTitleFocus}
          />
        }
        preview={
          <ContentMarkdownPreviewColumn includeTopInset={false}>
            {markdown.trim() ? (
              <DocumentMarkdownPreview
                body={markdown}
                mentionCatalog={mentionCatalog}
              />
            ) : (
              <p className="text-sm text-foreground/40">
                This document is empty.
              </p>
            )}
          </ContentMarkdownPreviewColumn>
        }
      />

      <FloatingPillToggleDock>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-white/10 bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-foreground hover:bg-white/[0.1] disabled:opacity-40"
            disabled={isPending}
            onClick={createDocument}
          >
            {isPending ? "Creating…" : "Create document"}
          </button>
          {viewModeToggle}
        </div>
      </FloatingPillToggleDock>
    </div>
  );
}

export function DocumentsEmptyCreatePrompt(
  props: DocumentsEmptyCreatePromptProps,
) {
  return (
    <MentionCatalogProvider>
      <DocumentsEmptyCreatePromptInner {...props} />
    </MentionCatalogProvider>
  );
}
