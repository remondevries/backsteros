"use client";

import { useMemo, useState, type ReactNode } from "react";

import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import { ContentDetailIconTitleHeader } from "./content-detail-title-header.js";
import { DetailWithPropertiesLayout } from "./detail-with-properties-layout.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { LetterDetailIcon } from "./letter-detail-icon.js";
import {
  LetterPropertiesDisplay,
  type LetterPropertiesDisplayLetter,
} from "./letter-properties-display.js";
import {
  LetterPdfDock,
  type LetterPdfDockProps,
} from "./letter-pdf-dock.js";
import type {
  LetterPdfDeleteResult,
  LetterPdfRenameResult,
  LetterPdfTabAttachment,
} from "./letter-pdf-tab.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { LETTER_PROPERTIES_PANEL_WIDTH_KEY } from "../properties-panel.js";
import type { TaskStatus } from "../task-status.js";
import { useContentTitleEditorNavigation } from "../use-content-title-editor-navigation.js";

export type LetterDetailViewLetter = LetterPropertiesDisplayLetter & {
  title: string;
  body?: string | null;
  displayId?: string | null;
};

export type LetterDetailViewProps = {
  letter: LetterDetailViewLetter;
  /** @deprecated Prefer chrome header breadcrumbs via useRegisterChromeHeader. */
  sectionLabel?: string;
  headerMeta?: ReactNode;
  onSaveBody?: (value: string) => void | Promise<void>;
  onSaveTitle?: (
    title: string,
  ) =>
    | Promise<{ ok: true } | { ok: false; error: string }>
    | { ok: true }
    | { ok: false; error: string };
  onFieldActivate?: (field: string) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onDueDateChange?: (dueDate: Date | null) => void;
  onReceivedDateChange?: (receivedDate: Date | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onContactChange?: (contactId: string | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  organizationOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  organizationNavigateHref?: string | null;
  contactNavigateHref?: string | null;
  projectNavigateHref?: string | null;
  onCreateOrganizationFromQuery?: (query: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
  showPdfDock?: boolean;
  hasPdfDocument?: boolean;
  pdfChildren?: ReactNode;
  onUploadPdf?: () => void;
  onTogglePdfMaximize?: () => void;
  pdfMaximized?: boolean;
  pdfOpen?: boolean;
  onTogglePdf?: () => void;
  pdfAttachments?: readonly LetterPdfTabAttachment[];
  selectedAttachmentId?: string | null;
  onSelectAttachment?: (attachmentId: string) => void;
  onRenameAttachment?: (
    attachmentId: string,
    originalFilename: string,
  ) => Promise<LetterPdfRenameResult> | LetterPdfRenameResult;
  onAttachmentRenamed?: () => void;
  onDeleteAttachment?: (
    attachmentId: string,
  ) => Promise<LetterPdfDeleteResult> | LetterPdfDeleteResult;
  hasLegacyPdf?: boolean;
  legacyPdfTitle?: string;
  pdfUploading?: boolean;
};

/**
 * Letter detail — matches web LetterDetailScreen structure:
 * left column = notes + PDF dock; right rail = From / Properties / Project.
 * Title shell matches documents empty-create (header above constrained body).
 */
export function LetterDetailView({
  letter,
  headerMeta,
  onSaveBody,
  onSaveTitle,
  onFieldActivate,
  onStatusChange,
  onDueDateChange,
  onReceivedDateChange,
  onOrganizationChange,
  onContactChange,
  onProjectChange,
  organizationOptions,
  contactOptions,
  projectOptions,
  organizationNavigateHref,
  contactNavigateHref,
  projectNavigateHref,
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
  showPdfDock = true,
  hasPdfDocument = false,
  pdfChildren,
  onUploadPdf,
  onTogglePdfMaximize,
  pdfMaximized = false,
  pdfOpen,
  onTogglePdf,
  pdfAttachments,
  selectedAttachmentId,
  onSelectAttachment,
  onRenameAttachment,
  onAttachmentRenamed,
  onDeleteAttachment,
  hasLegacyPdf = false,
  legacyPdfTitle,
  pdfUploading = false,
}: LetterDetailViewProps) {
  const [title, setTitle] = useState(letter.title);
  const [prevLetterId, setPrevLetterId] = useState(letter.id);
  if (letter.id !== prevLetterId) {
    setPrevLetterId(letter.id);
    setTitle(letter.title);
  }

  const {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    handleChange,
    handleBlurSave,
    requestEditorFocus,
    activateEditMode,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: letter.body ?? "",
    save: (next) => {
      if (!onSaveBody) {
        console.info("[letter-detail] save body", next.slice(0, 80));
        return { ok: true };
      }
      return Promise.resolve(onSaveBody(next)).then(() => ({ ok: true }));
    },
  });

  const {
    titleRenameFocusRequest,
    handleLeaveTitleForEditor,
  } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const viewModeToggle = useMemo(
    () => (
      <SegmentedPillToggle
        value={mode}
        options={[
          { value: "preview", label: "Preview" },
          { value: "edit", label: "Edit" },
        ]}
        onChange={setViewMode}
        ariaLabel="Content view mode"
      />
    ),
    [mode, setViewMode],
  );

  const dockProps: LetterPdfDockProps = {
    title: legacyPdfTitle ?? letter.displayId ?? title,
    legacyTitle: legacyPdfTitle ?? "Document.pdf",
    hasDocument: hasPdfDocument || Boolean(pdfChildren),
    onUploadClick: onUploadPdf,
    onToggleMaximize: onTogglePdfMaximize,
    maximized: pdfMaximized,
    pdfOpen,
    onTogglePdf,
    attachments: pdfAttachments,
    selectedAttachmentId,
    onSelectAttachment,
    onRenameAttachment,
    onAttachmentRenamed,
    onDeleteAttachment,
    hasLegacyPdf,
    uploading: pdfUploading,
    children: pdfChildren,
  };

  const notes = (
    <div className="document-pdf-main__notes">
      <div className="inbox-detail-body inbox-detail-body--document">
        <ContentDetailIconTitleHeader
          icon={<LetterDetailIcon title={title} />}
          title={
            <>
              <OverviewNameEditor
                value={title}
                entityLabel="Letter"
                resetKey={letter.id}
                renameFocusRequest={titleRenameFocusRequest}
                onLeaveTitle={() => handleLeaveTitleForEditor()}
                onSave={async (next) => {
                  if (!onSaveTitle) {
                    setTitle(next);
                    return { ok: true };
                  }
                  const result = await onSaveTitle(next);
                  if (result.ok) setTitle(next);
                  return result;
                }}
              />
              {headerMeta ? (
                <div className="inbox-detail-meta content-detail-title-meta">
                  {headerMeta}
                </div>
              ) : null}
            </>
          }
        />
        <ContentMarkdownViewLayout
          mode={mode}
          editorActivated={editorActivated}
          onToggleMode={toggleViewMode}
          editor={
            <DocumentMarkdownEditor
              value={value}
              onChange={handleChange}
              onBlur={handleBlurSave}
              focusRequest={editorFocusRequest}
              ariaLabel="Letter notes"
            />
          }
          preview={
            <ContentMarkdownPreviewColumn includeTopInset={false}>
              {value.trim() ? (
                <DocumentMarkdownPreview body={value} />
              ) : (
                <p className="content-markdown-empty-hint">
                  This letter is empty.
                </p>
              )}
            </ContentMarkdownPreviewColumn>
          }
        />
        {error ? (
          <p className="overview-empty" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div
      className="letter-detail-split"
      data-content-detail
      data-detail-split=""
      data-content-view-mode={mode}
    >
      <DetailWithPropertiesLayout
        storageKey={LETTER_PROPERTIES_PANEL_WIDTH_KEY}
        main={
          <div className="document-pdf-main">
            {!pdfMaximized ? notes : null}
            {showPdfDock ? <LetterPdfDock {...dockProps} /> : null}
          </div>
        }
        properties={
          <LetterPropertiesDisplay
            letter={letter}
            onFieldActivate={onFieldActivate}
            onStatusChange={onStatusChange}
            onDueDateChange={onDueDateChange}
            onReceivedDateChange={onReceivedDateChange}
            onOrganizationChange={onOrganizationChange}
            onContactChange={onContactChange}
            onProjectChange={onProjectChange}
            organizationOptions={organizationOptions}
            contactOptions={contactOptions}
            projectOptions={projectOptions}
            organizationNavigateHref={organizationNavigateHref}
            contactNavigateHref={contactNavigateHref}
            projectNavigateHref={projectNavigateHref}
            onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
            onCreateContactFromQuery={onCreateContactFromQuery}
          />
        }
        dock={<FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>}
      />
    </div>
  );
}
