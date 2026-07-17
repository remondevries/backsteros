"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";

import { updateProjectDescriptionAction } from "@/lib/mutations/projects";
import { updateLocalProjectDescription } from "@/lib/sync/local-project-mutations";
import { runEntityPersist } from "@/lib/sync/run-entity-persist";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
} from "@/components/content/content-markdown-view-layout";
import { useMarkdownDetailEditor } from "@/components/content/use-markdown-detail-editor";
import { DocumentMarkdownPreview } from "@/components/documents/document-markdown-preview";
import { SegmentedPillToggle } from "@/components/ui/segmented-pill-toggle";
import {
  MentionCatalogProvider,
  useMentionCatalog,
} from "@/hooks/use-mention-catalog";

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

type ProjectOverviewDescriptionEditorProps = {
  projectId: string;
  value: string;
};

function ProjectOverviewDescriptionEditorInner({
  projectId,
  value,
}: ProjectOverviewDescriptionEditorProps) {
  const { catalog: mentionCatalog } = useMentionCatalog();
  const [expanded, setExpanded] = useState(true);

  const saveDescription = useCallback(
    (nextDescription: string) => {
      const trimmed = nextDescription.trim();
      const currentDescription = value.trim();

      if (trimmed === currentDescription) {
        return null;
      }

      return runEntityPersist(
        () =>
          updateLocalProjectDescription({
            projectId,
            description: trimmed,
          }),
        () =>
          updateProjectDescriptionAction({
            projectId,
            description: trimmed,
          }),
      );
    },
    [projectId, value],
  );

  const {
    value: description,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    isPending,
    handleChange,
    handleBlur,
    switchToEdit,
    switchToPreview,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: value,
    save: saveDescription,
    blurOnPreview: true,
  });

  return (
    <section
      className={`flex w-full flex-col pt-6 ${
        expanded ? "min-h-0 flex-1" : "shrink-0"
      }`}
    >
      <div className="mx-auto w-full max-w-[800px] shrink-0 px-4">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 bg-transparent py-0.5 pr-1.5 text-sm leading-[18px] text-foreground/50"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          <span>Description</span>
          <span
            aria-hidden="true"
            className={`text-foreground/50 transition-transform duration-150 ${
              expanded ? "" : "-rotate-90"
            }`}
          >
            ▾
          </span>
        </button>
      </div>

      {expanded ? (
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          data-content-view-mode={mode}
        >
          <ContentMarkdownViewLayout
            mode={mode}
            editorActivated={editorActivated}
            onToggleMode={toggleViewMode}
            editor={
              <DocumentMarkdownEditor
                value={description}
                onChange={handleChange}
                onBlur={handleBlur}
                disabled={isPending}
                ariaLabel="Project description"
                focusRequest={editorFocusRequest}
                mentionCatalog={mentionCatalog}
              />
            }
            preview={
              <ContentMarkdownPreviewColumn includeTopInset={false}>
                {description.trim() ? (
                  <DocumentMarkdownPreview
                    body={description}
                    mentionCatalog={mentionCatalog}
                  />
                ) : (
                  <p className="text-sm text-foreground/40">
                    Add a project description…
                  </p>
                )}
              </ContentMarkdownPreviewColumn>
            }
            toggle={
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
                ariaLabel="Project description view mode"
              />
            }
          />
        </div>
      ) : null}

      {error ? (
        <p
          className="mx-auto w-full max-w-[800px] shrink-0 px-4 pb-3 text-xs text-red-400"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function ProjectOverviewDescriptionEditor(
  props: ProjectOverviewDescriptionEditorProps,
) {
  return (
    <MentionCatalogProvider>
      <ProjectOverviewDescriptionEditorInner {...props} />
    </MentionCatalogProvider>
  );
}
