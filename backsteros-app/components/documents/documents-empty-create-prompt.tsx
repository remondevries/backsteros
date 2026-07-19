"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { ContentDetailIconTitleHeader } from "@/components/content/content-detail-title-header";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
} from "@/components/content/content-markdown-view-layout";
import { useContentTitleEditorNavigation } from "@/components/content/use-content-title-editor-navigation";
import { DocumentMarkdownPreview } from "@/components/documents/document-markdown-preview";
import { DocumentOcticon } from "@/components/documents/document-octicon";
import { OverviewNameEditor } from "@/components/overview/overview-name-editor";
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
 * Empty documents pane. Enter/Tab focuses the body, then creates and navigates
 * to the real document detail (exit this compose shell).
 */
function DocumentsEmptyCreatePromptInner(
  props: DocumentsEmptyCreatePromptProps,
) {
  const router = useRouter();
  const { catalog: mentionCatalog } = useMentionCatalog();
  const submittedRef = useRef(false);
  const [title, setTitle] = useState("New document");
  const titleRef = useRef(title);
  const [markdown, setMarkdown] = useState("");
  const markdownRef = useRef(markdown);
  markdownRef.current = markdown;
  const [mode, setMode] = useState<DocumentViewMode>("preview");
  const modeRef = useRef<DocumentViewMode>(mode);
  modeRef.current = mode;
  const [editorActivated, setEditorActivated] = useState(false);
  const [editorFocusRequest, setEditorFocusRequest] = useState(0);
  const [titleFocusRequest, setTitleFocusRequest] = useState(1);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void import("@/components/documents/document-markdown-editor");
  }, []);

  useEffect(() => {
    const timers = [0, 50, 150, 300].map((ms) =>
      window.setTimeout(() => {
        setTitleFocusRequest((count) => count + 1);
      }, ms),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, []);

  const activateEditMode = useCallback(
    ({ focusEditor = true }: { focusEditor?: boolean } = {}) => {
      modeRef.current = "edit";
      setEditorActivated(true);
      setMode("edit");
      if (focusEditor) {
        setEditorFocusRequest((count) => count + 1);
        requestAnimationFrame(() => {
          setEditorFocusRequest((count) => count + 1);
        });
      }
    },
    [],
  );

  const requestEditorFocus = useCallback(() => {
    setEditorFocusRequest((count) => count + 1);
    requestAnimationFrame(() => {
      setEditorFocusRequest((count) => count + 1);
    });
  }, []);

  const { handleLeaveTitleForEditor } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const switchToPreview = useCallback(() => {
    modeRef.current = "preview";
    setMode("preview");
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const focusedCm = document.querySelector(
      ".cm-editor.cm-focused .cm-content",
    );
    if (focusedCm instanceof HTMLElement) {
      focusedCm.blur();
    }
  }, []);

  const createDocument = useCallback(() => {
    if (isPending || submittedRef.current) return;
    submittedRef.current = true;

    const nextTitle = titleRef.current.trim() || "Untitled";
    const nextMarkdown = markdownRef.current;

    startTransition(async () => {
      const result =
        props.variant === "knowledge"
          ? await createKnowledgeDocumentAction({
              title: nextTitle,
              content: nextMarkdown,
            })
          : await createDocumentAction({
              projectId: props.projectId,
              title: nextTitle,
              content: nextMarkdown,
            });

      if (!result.ok) {
        submittedRef.current = false;
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

      router.replace(href);
    });
  }, [isPending, props, router]);

  const leaveTitleForBody = useCallback(() => {
    handleLeaveTitleForEditor();
    createDocument();
  }, [createDocument, handleLeaveTitleForEditor]);

  const enterBody = useCallback(() => {
    activateEditMode();
    createDocument();
  }, [activateEditMode, createDocument]);

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
          enterBody();
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
  }, [enterBody, switchToPreview]);

  const documentIcon = (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-white/10 bg-white/5 text-foreground"
      aria-hidden="true"
    >
      <DocumentOcticon icon={null} size={16} className="text-foreground/85" />
    </span>
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
          title={
            <OverviewNameEditor
              value={title}
              entityLabel="Document"
              resetKey="empty-create"
              autoEdit
              renameFocusRequest={titleFocusRequest}
              onDraftChange={(draft) => {
                titleRef.current = draft;
              }}
              onLeaveTitle={() => {
                leaveTitleForBody();
              }}
              onSave={async (next) => {
                titleRef.current = next;
                setTitle(next);
                return { ok: true };
              }}
            />
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
          enterBody();
        }}
        editor={
          <DocumentMarkdownEditor
            value={markdown}
            onChange={setMarkdown}
            disabled={isPending}
            focusRequest={editorFocusRequest}
            ariaLabel="Document content"
            mentionCatalog={mentionCatalog}
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
        <SegmentedPillToggle
          value={mode}
          options={[
            { value: "edit", label: "Edit" },
            { value: "preview", label: "Preview" },
          ]}
          onChange={(nextMode) => {
            if (nextMode === "edit") {
              enterBody();
              return;
            }
            switchToPreview();
          }}
          ariaLabel="Document view mode"
          className="pointer-events-auto"
        />
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
