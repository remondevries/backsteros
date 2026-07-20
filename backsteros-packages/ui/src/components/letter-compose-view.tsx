"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { LetterDetailIcon } from "./letter-detail-icon.js";
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
import { useContentTitleEditorNavigation } from "../use-content-title-editor-navigation.js";

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
  /**
   * Creates the letter when leaving the title for the body (documents empty-create parity).
   * Host should navigate to the real detail view afterward.
   */
  onSubmit?: (payload: LetterComposeSubmitPayload) => void | Promise<void>;
  /** @deprecated Unused — empty compose has no Cancel (documents empty-create parity). */
  onCancel?: () => void;
  /** Host-controlled PDF pick (optional). When omitted, the dock picks a local file. */
  onPickPdf?: () => void | Promise<void>;
  selectedPdfFile?: File | null;
  pdfUploading?: boolean;
  /**
   * Increment to re-focus the title (e.g. after delete → empty-create when a
   * closing modal steals focus).
   */
  titleFocusRequest?: number;
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
 * Letter empty compose — title autofocus, Enter/Tab creates + focuses body
 * (documents empty-create parity). Properties + PDF dock stay available before create.
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
  onPickPdf,
  selectedPdfFile: selectedPdfFileProp,
  pdfUploading = false,
  titleFocusRequest: titleFocusRequestProp = 0,
}: LetterComposeViewProps) {
  const submittedRef = useRef(false);
  const [title, setTitle] = useState(initialTitle || "New letter");
  const titleRef = useRef(title);
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

  const statusRef = useRef(status);
  const organizationIdRef = useRef(organizationId);
  const contactIdRef = useRef(contactId);
  const projectKeyRef = useRef(projectKey);
  const dueDateRef = useRef(dueDate);
  const receivedDateRef = useRef(receivedDate);
  statusRef.current = status;
  organizationIdRef.current = organizationId;
  contactIdRef.current = contactId;
  projectKeyRef.current = projectKey;
  dueDateRef.current = dueDate;
  receivedDateRef.current = receivedDate;

  const pdfControlled = selectedPdfFileProp !== undefined;
  const selectedPdfFile = pdfControlled
    ? (selectedPdfFileProp ?? null)
    : uncontrolledPdfFile;
  const selectedPdfFileRef = useRef(selectedPdfFile);
  selectedPdfFileRef.current = selectedPdfFile;

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
    requestEditorFocus,
    activateEditMode,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue: "",
    save: () => ({ ok: true }),
  });
  const bodyRef = useRef(value);
  bodyRef.current = value;

  const autoEditTitle = !initialTitle;
  const [titleFocusRequest, setTitleFocusRequest] = useState(
    titleFocusRequestProp > 0 ? titleFocusRequestProp : 1,
  );

  useEffect(() => {
    if (titleFocusRequestProp > 0) {
      setTitleFocusRequest(titleFocusRequestProp);
    }
  }, [titleFocusRequestProp]);

  useEffect(() => {
    if (!autoEditTitle) return;
    const timers = [0, 50, 150, 300].map((ms) =>
      window.setTimeout(() => {
        setTitleFocusRequest((count) => count + 1);
      }, ms),
    );
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [autoEditTitle]);

  const { handleLeaveTitleForEditor } = useContentTitleEditorNavigation({
    mode,
    activateEditMode,
    requestEditorFocus,
  });

  const submitCreate = useCallback(() => {
    if (pdfUploading || submittedRef.current || !onSubmit) return;
    submittedRef.current = true;
    void Promise.resolve(
      onSubmit({
        title: titleRef.current.trim() || "Untitled",
        body: bodyRef.current,
        status: statusRef.current,
        organizationId: organizationIdRef.current,
        contactId: contactIdRef.current,
        projectKey: projectKeyRef.current,
        dueDate: dueDateRef.current,
        receivedDate: receivedDateRef.current,
        pdfFile: selectedPdfFileRef.current,
      }),
    ).catch(() => {
      submittedRef.current = false;
    });
  }, [onSubmit, pdfUploading]);

  const leaveTitleForBody = useCallback(() => {
    handleLeaveTitleForEditor();
    submitCreate();
  }, [handleLeaveTitleForEditor, submitCreate]);

  const enterBody = useCallback(() => {
    activateEditMode();
    submitCreate();
  }, [activateEditMode, submitCreate]);

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
                <ContentDetailIconTitleHeader
                  icon={
                    <LetterDetailIcon title={title.trim() || "New letter"} />
                  }
                  title={
                    <OverviewNameEditor
                      value={title}
                      entityLabel="Letter"
                      resetKey="compose"
                      autoEdit={autoEditTitle}
                      renameFocusRequest={titleFocusRequest}
                      onDraftChange={(draft) => {
                        titleRef.current = draft;
                      }}
                      onLeaveTitle={() => {
                        leaveTitleForBody();
                      }}
                      onSave={(next) => {
                        titleRef.current = next;
                        setTitle(next);
                        return { ok: true };
                      }}
                    />
                  }
                />
                <ContentMarkdownViewLayout
                  mode={mode}
                  editorActivated={editorActivated}
                  onToggleMode={() => {
                    if (mode === "edit") {
                      toggleViewMode();
                      return;
                    }
                    enterBody();
                  }}
                  editor={
                    <DocumentMarkdownEditor
                      value={value}
                      onChange={handleChange}
                      disabled={pdfUploading}
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
              </div>
            </div>
            <LetterPdfDock
              hasDocument={Boolean(selectedPdfFile)}
              hasLegacyPdf={Boolean(selectedPdfFile)}
              legacyTitle={selectedPdfFile?.name ?? "Document.pdf"}
              emptyMessage="Drop a PDF here or upload an attachment."
              onUploadFile={(file) => {
                if (!pdfControlled) {
                  setUncontrolledPdfFile(file);
                }
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
              onChange={(nextMode) => {
                if (nextMode === "edit") {
                  enterBody();
                  return;
                }
                setViewMode(nextMode);
              }}
              ariaLabel="Content view mode"
            />
          </FloatingPillToggleDock>
        }
      />
    </div>
  );
}
