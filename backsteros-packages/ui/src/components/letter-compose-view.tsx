"use client";

import { useMemo, useState } from "react";

import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "./content-markdown-view-layout.js";
import { ContentDetailIconTitleHeader } from "./content-detail-title-header.js";
import { DetailWithPropertiesLayout } from "./detail-with-properties-layout.js";
import { DocumentMarkdownEditor } from "./document-markdown-editor.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import {
  buildContactDropdownOptions,
  type AssigneeDropdownContact,
} from "./dropdown-options.js";
import { FloatingPillToggleDock } from "./floating-pill-toggle-dock.js";
import { LetterIcon } from "./letter-icon.js";
import { LetterPdfDock } from "./letter-pdf-dock.js";
import {
  LetterPropertiesDisplay,
  type LetterPropertiesDisplayLetter,
} from "./letter-properties-display.js";
import { OverviewNameEditor } from "./overview-name-editor.js";
import { SegmentedPillToggle } from "./list-board-view-shell.js";
import type { SearchableDropdownOption } from "./searchable-dropdown.js";
import { LETTER_PROPERTIES_PANEL_WIDTH_KEY } from "../properties-panel.js";
import type { TaskStatus } from "../task-status.js";

export type LetterComposeContact = AssigneeDropdownContact & {
  organizationId?: string | null;
};

export type LetterComposeSubmitPayload = {
  title: string;
  body: string;
  status: TaskStatus;
  organizationId: string | null;
  contactId: string | null;
  projectKey: string | null;
  dueDate: Date | null;
  receivedDate: Date | null;
  /** PDF selected in the compose dock; host uploads after create. */
  pdfFile: File | null;
};

export type LetterComposeViewProps = {
  initialTitle?: string;
  initialStatus?: TaskStatus;
  initialOrganizationId?: string | null;
  initialContactId?: string | null;
  organizationOptions?: SearchableDropdownOption<string>[];
  /** Prefer `contacts` so options filter by selected organization (Next parity). */
  contacts?: LetterComposeContact[];
  contactOptions?: SearchableDropdownOption<string>[];
  projectOptions?: SearchableDropdownOption<string>[];
  onCreateOrganizationFromQuery?: (
    query: string,
  ) =>
    | Promise<{ id: string } | void>
    | { id: string }
    | void;
  /** Called with the currently selected organization id (required to create). */
  onCreateContactFromQuery?: (
    query: string,
    organizationId: string,
  ) =>
    | Promise<{ id: string } | void>
    | { id: string }
    | void;
  onSubmit?: (payload: LetterComposeSubmitPayload) => void;
  onCancel?: () => void;
  /** Host-controlled PDF pick (optional). When omitted, the dock picks a local file. */
  onPickPdf?: () => void | Promise<void>;
  selectedPdfFile?: File | null;
  pdfUploading?: boolean;
};

function pickLocalPdfFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf,.pdf";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Presentational letter compose — left notes + PDF dock; right properties.
 * Breadcrumb lives in content chrome (host registers Letters › New).
 */
export function LetterComposeView({
  initialTitle = "",
  initialStatus = "ready_to_start",
  initialOrganizationId = null,
  initialContactId = null,
  organizationOptions = [],
  contacts,
  contactOptions = [],
  projectOptions = [],
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
  onSubmit,
  onCancel,
  onPickPdf,
  selectedPdfFile: selectedPdfFileProp,
  pdfUploading = false,
}: LetterComposeViewProps) {
  const [title, setTitle] = useState(initialTitle || "Untitled letter");
  const [status, setStatus] = useState<TaskStatus>(initialStatus);
  const [organizationId, setOrganizationId] = useState<string | null>(
    initialOrganizationId,
  );
  const [contactId, setContactId] = useState<string | null>(initialContactId);
  const [projectKey, setProjectKey] = useState<string | null>(null);
  const [dueDate, setDueDate] = useState<Date | null>(null);
  const [receivedDate, setReceivedDate] = useState<Date | null>(new Date());
  const [uncontrolledPdfFile, setUncontrolledPdfFile] = useState<File | null>(
    null,
  );

  const pdfControlled = selectedPdfFileProp !== undefined;
  const selectedPdfFile = pdfControlled
    ? (selectedPdfFileProp ?? null)
    : uncontrolledPdfFile;

  const resolvedContactOptions = useMemo(() => {
    if (!contacts) return contactOptions;
    const scoped = organizationId
      ? contacts.filter((contact) => contact.organizationId === organizationId)
      : [];
    return buildContactDropdownOptions(scoped);
  }, [contactOptions, contacts, organizationId]);

  const {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    handleChange,
    handleBlurSave,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: "",
    save: () => ({ ok: true }),
  });

  const letter: LetterPropertiesDisplayLetter = {
    id: "compose",
    status,
    organizationId,
    organizationName: null,
    contactId,
    contactName: null,
    receivedDate: receivedDate?.getTime() ?? null,
    dueDate: dueDate?.getTime() ?? null,
    projectKey,
    projectName: null,
  };

  async function handlePickPdf() {
    if (onPickPdf) {
      await onPickPdf();
      return;
    }
    const file = await pickLocalPdfFile();
    if (!file) return;
    if (
      file.type &&
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      return;
    }
    if (!pdfControlled) {
      setUncontrolledPdfFile(file);
    }
  }

  const composeActions = (
    <div className="letter-compose-actions">
      {onCancel ? (
        <button
          type="button"
          className="letter-compose-actions__button"
          onClick={onCancel}
          disabled={pdfUploading}
        >
          Cancel
        </button>
      ) : null}
      <button
        type="button"
        className="letter-compose-actions__button letter-compose-actions__button--primary"
        disabled={pdfUploading}
        onClick={() =>
          onSubmit?.({
            title,
            body: value,
            status,
            organizationId,
            contactId,
            projectKey,
            dueDate,
            receivedDate,
            pdfFile: selectedPdfFile,
          })
        }
      >
        {pdfUploading ? "Uploading…" : "Create"}
      </button>
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
            <div className="document-pdf-main__notes">
              <div className="inbox-detail-body inbox-detail-body--document">
                <div className="letter-compose-title-row">
                  <ContentDetailIconTitleHeader
                    icon={<LetterIcon size={28} />}
                    title={
                      <OverviewNameEditor
                        value={title}
                        entityLabel="Letter"
                        resetKey="compose"
                        autoEdit={!initialTitle}
                        onSave={(next) => {
                          setTitle(next);
                          return { ok: true };
                        }}
                      />
                    }
                  />
                  {composeActions}
                </div>
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
                        <p className="overview-empty">Add notes…</p>
                      )}
                    </ContentMarkdownPreviewColumn>
                  }
                />
              </div>
            </div>
            <LetterPdfDock
              hasDocument={Boolean(selectedPdfFile)}
              hasLegacyPdf={Boolean(selectedPdfFile)}
              legacyTitle={selectedPdfFile?.name ?? "Document.pdf"}
              emptyMessage="Drop a PDF here or upload an attachment."
              onUploadClick={() => {
                void handlePickPdf();
              }}
              uploading={pdfUploading}
            />
          </div>
        }
        properties={
          <LetterPropertiesDisplay
            letter={letter}
            variant="compose"
            onStatusChange={setStatus}
            onDueDateChange={setDueDate}
            onReceivedDateChange={setReceivedDate}
            onOrganizationChange={(next) => {
              setOrganizationId(next);
              setContactId(null);
            }}
            onContactChange={setContactId}
            onProjectChange={setProjectKey}
            organizationOptions={organizationOptions}
            contactOptions={resolvedContactOptions}
            projectOptions={projectOptions}
            onCreateOrganizationFromQuery={
              onCreateOrganizationFromQuery
                ? (query) => {
                    void Promise.resolve(
                      onCreateOrganizationFromQuery(query),
                    ).then((created) => {
                      if (created?.id) {
                        setOrganizationId(created.id);
                        setContactId(null);
                      }
                    });
                  }
                : undefined
            }
            onCreateContactFromQuery={
              onCreateContactFromQuery && organizationId
                ? (query) => {
                    void Promise.resolve(
                      onCreateContactFromQuery(query, organizationId),
                    ).then((created) => {
                      if (created?.id) setContactId(created.id);
                    });
                  }
                : undefined
            }
          />
        }
        dock={
          <FloatingPillToggleDock>
            <SegmentedPillToggle
              value={mode}
              options={[
                { value: "preview", label: "Preview" },
                { value: "edit", label: "Edit" },
              ]}
              onChange={setViewMode}
              ariaLabel="Content view mode"
            />
          </FloatingPillToggleDock>
        }
      />
    </div>
  );
}
