"use client";

import { XIcon } from "@primer/octicons-react";
import { useLayoutEffect, useState, type ReactNode } from "react";

import { MEETING_PROPERTIES_PANEL_WIDTH_KEY } from "../../content/properties-panel.js";
import {
  ContentMarkdownPreviewColumn,
  ContentMarkdownViewLayout,
  useMarkdownDetailEditor,
} from "../content/content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "../content/content-detail-title-header.js";
import { DetailWithPropertiesLayout } from "../content/detail-with-properties-layout.js";
import { DocumentMarkdownEditor } from "../documents/document-markdown-editor.js";
import { DocumentMarkdownPreview } from "../documents/document-markdown-preview.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import type { PropertyDropdownTriggerVariant } from "../dropdowns/property-dropdown.js";
import { CollapseLayoutIcon } from "../icons/collapse-layout-icon.js";
import { ExpandLayoutIcon } from "../icons/expand-layout-icon.js";
import {
  MeetingPropertiesStacked,
} from "./meeting-properties-stacked.js";
import {
  MeetingPropertiesInlineChips,
  type MeetingPropertiesInlineChipsProps,
} from "./meeting-properties-inline-chips.js";
import type { TaskStatus } from "../../tasks/task-status.js";

export type MeetingContentTab = "summary" | "notes" | "transcription";

const MEETING_CONTENT_TABS: { id: MeetingContentTab; label: string }[] = [
  { id: "summary", label: "Summary" },
  { id: "notes", label: "Notes" },
  { id: "transcription", label: "Transcription" },
];

type MeetingContentTabEditorProps = {
  tab: MeetingContentTab;
  value: string;
  ariaLabel: string;
  onSave: (value: string) => void | Promise<void>;
  /** When set, preview/edit toggle is rendered by the host (properties dock). */
  dockToggle?: boolean;
  onToggleDock?: (toggle: ReactNode) => void;
};

function MeetingContentTabEditor({
  tab,
  value: initialValue,
  ariaLabel,
  onSave,
  dockToggle = false,
  onToggleDock,
}: MeetingContentTabEditorProps) {
  const {
    value,
    mode,
    editorActivated,
    editorFocusRequest,
    error,
    handleChange,
    handleBlurSave,
    setViewMode,
    toggleViewMode,
  } = useMarkdownDetailEditor({
    initialValue,
    save: (next) => {
      void onSave(next);
      return { ok: true as const };
    },
  });

  const handleToggleViewMode = () => {
    toggleViewMode();
  };

  const viewModeToggle = (
    <SegmentedPillToggle
      value={mode}
      options={[
        { value: "preview", label: "Preview" },
        { value: "edit", label: "Edit" },
      ]}
      onChange={(next) => {
        setViewMode(next);
      }}
      ariaLabel="Content view mode"
    />
  );

  useLayoutEffect(() => {
    if (!dockToggle || !onToggleDock) return;
    onToggleDock(viewModeToggle);
  }, [dockToggle, mode, onToggleDock]);

  const emptyLabel =
    tab === "summary"
      ? "summary"
      : tab === "notes"
        ? "notes"
        : "transcription";

  return (
    <>
      <ContentMarkdownViewLayout
        mode={mode}
        editorActivated={editorActivated}
        onToggleMode={handleToggleViewMode}
        editor={
          <DocumentMarkdownEditor
            value={value}
            onChange={handleChange}
            onBlur={handleBlurSave}
            focusRequest={editorFocusRequest}
            ariaLabel={ariaLabel}
            scrollWithContent
          />
        }
        preview={
          <ContentMarkdownPreviewColumn includeTopInset={false}>
            {value.trim() ? (
              <DocumentMarkdownPreview body={value} onChange={handleChange} />
            ) : (
              <p className="content-markdown-empty-hint">
                No {emptyLabel} yet.
              </p>
            )}
          </ContentMarkdownPreviewColumn>
        }
        toggle={
          dockToggle ? null : (
            <FloatingPillToggleDock>{viewModeToggle}</FloatingPillToggleDock>
          )
        }
      />
      {error ? (
        <p className="overview-empty" role="alert">{error}</p>
      ) : null}
    </>
  );
}

export type MeetingDetailViewProps = {
  displayId: string;
  title: string;
  summary: string;
  notes: string;
  transcription: string;
  meeting: MeetingPropertiesInlineChipsProps["meeting"];
  onTitleChange: (title: string) => void;
  onSummaryChange: (summary: string) => void;
  onNotesChange: (notes: string) => void;
  onTranscriptionChange: (transcription: string) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onStartChange?: (value: Date | null) => void;
  onEndChange?: (value: Date | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onAttendeeContactIdsChange?: (contactIds: string[]) => void;
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  onPriorityChange?: (priority: number) => void;
  timerSession?: MeetingPropertiesInlineChipsProps["timerSession"];
  onFieldActivate?: (field: string) => void;
  organizationOptions?: MeetingPropertiesInlineChipsProps["organizationOptions"];
  contactOptions?: MeetingPropertiesInlineChipsProps["contactOptions"];
  projectOptions?: MeetingPropertiesInlineChipsProps["projectOptions"];
  onCreateOrganizationFromQuery?: (query: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
  layout?: "page" | "panel";
  propertyTriggerVariant?: PropertyDropdownTriggerVariant;
  /** Panel overlay — close control beside the title. */
  onClose?: () => void;
  /** Expand narrow calendar panel to full-width page layout. */
  onExpand?: () => void;
  /** Collapse full-width page layout back to the narrow panel. */
  onCollapse?: () => void;
};

export function MeetingDetailView({
  displayId,
  title,
  summary,
  notes,
  transcription,
  meeting,
  onTitleChange,
  onSummaryChange,
  onNotesChange,
  onTranscriptionChange,
  onStatusChange,
  onStartChange,
  onEndChange,
  onProjectChange,
  onOrganizationChange,
  onAttendeeContactIdsChange,
  onTrackedDurationSecondsChange,
  onPriorityChange,
  timerSession = null,
  onFieldActivate,
  organizationOptions,
  contactOptions,
  projectOptions,
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
  layout = "panel",
  propertyTriggerVariant,
  onClose,
  onExpand,
  onCollapse,
}: MeetingDetailViewProps) {
  const [activeTab, setActiveTab] = useState<MeetingContentTab>("summary");
  const [dockToggle, setDockToggle] = useState<ReactNode>(null);

  const tabValue =
    activeTab === "summary"
      ? summary
      : activeTab === "notes"
        ? notes
        : transcription;

  const onTabSave =
    activeTab === "summary"
      ? onSummaryChange
      : activeTab === "notes"
        ? onNotesChange
        : onTranscriptionChange;

  const tabAriaLabel =
    activeTab === "summary"
      ? "Meeting summary"
      : activeTab === "notes"
        ? "Meeting notes"
        : "Meeting transcription";

  const triggerVariant =
    propertyTriggerVariant ?? (layout === "panel" ? "inlineChip" : "default");

  const propertiesProps = {
    meeting,
    onStatusChange,
    onPriorityChange,
    onStartChange,
    onEndChange,
    onTrackedDurationSecondsChange,
    onProjectChange,
    onOrganizationChange,
    onAttendeeContactIdsChange,
    onFieldActivate,
    organizationOptions,
    contactOptions,
    projectOptions,
    onCreateOrganizationFromQuery,
    onCreateContactFromQuery,
    timerSession,
  };

  const contentTabs = (
    <div
      className="meeting-detail-view__tabs"
      role="tablist"
      aria-label="Meeting content"
    >
      {MEETING_CONTENT_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`meeting-tab-${tab.id}`}
          className={`meeting-detail-view__tab${
            activeTab === tab.id ? " is-active" : ""
          }`}
          aria-selected={activeTab === tab.id}
          onClick={() => setActiveTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  const layoutAction =
    onExpand != null ? (
      <button
        type="button"
        className="meeting-detail-view__layout-action"
        onClick={onExpand}
        aria-label="Expand meeting"
        title="Expand"
      >
        <ExpandLayoutIcon size={14} />
      </button>
    ) : onCollapse != null ? (
      <button
        type="button"
        className="meeting-detail-view__layout-action"
        onClick={onCollapse}
        aria-label="Collapse meeting"
        title="Collapse"
      >
        <CollapseLayoutIcon size={14} />
      </button>
    ) : null;

  const contentEditor = (
    <div
      className="meeting-detail-view__editor-shell"
      role="tabpanel"
      aria-labelledby={`meeting-tab-${activeTab}`}
    >
      <MeetingContentTabEditor
        key={activeTab}
        tab={activeTab}
        value={tabValue}
        ariaLabel={tabAriaLabel}
        onSave={onTabSave}
        dockToggle
        onToggleDock={setDockToggle}
      />
    </div>
  );

  const bottomChrome =
    layoutAction || (layout === "panel" && dockToggle) ? (
      <div
        className={`meeting-detail-view__bottom-chrome${
          layout === "page"
            ? " meeting-detail-view__bottom-chrome--page-main"
            : ""
        }`}
      >
        <div className="meeting-detail-view__bottom-chrome-inner">
          <div className="meeting-detail-view__bottom-chrome-start">
            {layoutAction}
          </div>
          {layout === "panel" && dockToggle ? (
            <div className="meeting-detail-view__bottom-chrome-end">
              <FloatingPillToggleDock className="meeting-detail-view__bottom-chrome-toggle">
                {dockToggle}
              </FloatingPillToggleDock>
            </div>
          ) : null}
        </div>
      </div>
    ) : null;

  const closeAction = onClose ? (
    <button
      type="button"
      className="meeting-detail-view__header-action"
      onClick={onClose}
      aria-label="Close meeting panel"
    >
      <XIcon size={14} />
    </button>
  ) : null;

  if (layout === "page") {
    return (
      <div
        className="meeting-detail-split meeting-detail-page"
        data-content-detail
        data-detail-split=""
        data-meeting-detail-layout="page"
      >
        <DetailWithPropertiesLayout
          storageKey={MEETING_PROPERTIES_PANEL_WIDTH_KEY}
          main={
            <div className="inbox-detail-layout">
              <div className="inbox-detail-body inbox-detail-body--document meeting-detail-page__body">
                {closeAction ? (
                  <div className="meeting-detail-view__overlay-chrome">
                    <div className="meeting-detail-view__header-actions">
                      {closeAction}
                    </div>
                  </div>
                ) : null}
                <ContentDetailTitleHeader>
                  <p className="content-detail-display-id">{displayId}</p>
                  <OverviewNameEditor
                    value={title}
                    entityLabel="Meeting"
                    onSave={async (next) => {
                      onTitleChange(next);
                      return { ok: true as const };
                    }}
                  />
                </ContentDetailTitleHeader>
                <div className="meeting-detail-view__content meeting-detail-view__content--page">
                  {contentTabs}
                  {contentEditor}
                </div>
                {bottomChrome}
              </div>
            </div>
          }
          properties={<MeetingPropertiesStacked {...propertiesProps} />}
          dock={
            dockToggle ? (
              <FloatingPillToggleDock>{dockToggle}</FloatingPillToggleDock>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <div
      className="meeting-detail-view meeting-detail-view--panel"
      data-meeting-detail-layout="panel"
    >
      <header className="meeting-detail-view__header">
        <div className="meeting-detail-view__id-row">
          <span className="meeting-detail-view__id">{displayId}</span>
          {closeAction ? (
            <div className="meeting-detail-view__header-actions">
              {closeAction}
            </div>
          ) : null}
        </div>
        <input
          type="text"
          className="meeting-detail-view__title"
          value={title}
          placeholder="Meeting title"
          aria-label="Meeting title"
          onChange={(event) => onTitleChange(event.target.value)}
        />
      </header>
      <MeetingPropertiesInlineChips
        {...propertiesProps}
        triggerVariant={triggerVariant}
      />
      <div className="meeting-detail-view__content meeting-detail-view__content--page">
        {contentTabs}
        {contentEditor}
      </div>
      {bottomChrome}
    </div>
  );
}
