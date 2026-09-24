"use client";

import { XIcon } from "@primer/octicons-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { MEETING_PROPERTIES_PANEL_WIDTH_KEY } from "../../content/properties-panel.js";
import {
  buildMeetingContentTabOrder,
  isVideoCallMeetingFormat,
  MEETING_DETAILS_TAB,
  type MeetingContentTab,
} from "../../meetings/meeting-content-tab-shortcuts.js";
import { useMeetingContentTabShortcuts } from "../../meetings/use-meeting-content-tab-shortcuts.js";
import { ContentMarkdownDescriptionLayout } from "../content/content-markdown-description-layout.js";
import { useMarkdownDetailEditor } from "../content/content-markdown-view-layout.js";
import { ContentDetailTitleHeader } from "../content/content-detail-title-header.js";
import { DetailWithPropertiesLayout } from "../content/detail-with-properties-layout.js";
import { FloatingPillToggleDock } from "../shared/floating-pill-toggle-dock.js";
import { OverviewNameEditor } from "../content/overview-name-editor.js";
import { PillNav } from "../shared/pill-nav.js";
import { SegmentedPillToggle } from "../list-nav/list-board-view-shell.js";
import type { PropertyDropdownTriggerVariant } from "../dropdowns/property-dropdown.js";
import { deferFocusAfterTitleLeave } from "../../content/use-content-title-editor-navigation.js";
import { CollapseLayoutIcon } from "../icons/collapse-layout-icon.js";
import { ExpandLayoutIcon } from "../icons/expand-layout-icon.js";
import {
  MeetingPropertiesStacked,
} from "./meeting-properties-stacked.js";
import { MeetingPortalEmailActions } from "./meeting-portal-email-actions.js";
import {
  MeetingPropertiesInlineChips,
  type MeetingPropertiesInlineChipsProps,
} from "./meeting-properties-inline-chips.js";
import { MeetingFormatToggle } from "./meeting-format-toggle.js";
import type { MeetingFormat } from "../../meetings/meeting-format.js";
import type { TaskStatus } from "../../tasks/task-status.js";

export type { MeetingContentTab };

const MEETING_CONTENT_TAB_LABELS: Record<MeetingContentTab, string> = {
  summary: "Summary",
  notes: "Notes",
  transcription: "Transcription",
  details: "Details",
};

type MeetingMarkdownTab = Exclude<MeetingContentTab, typeof MEETING_DETAILS_TAB>;

type MeetingContentTabEditorProps = {
  tab: MeetingMarkdownTab;
  value: string;
  ariaLabel: string;
  onSave: (value: string) => void | Promise<void>;
  /** When set, preview/edit toggle is rendered by the host (properties dock). */
  dockToggle?: boolean;
  onToggleDock?: (toggle: ReactNode) => void;
  /**
   * When true, switch the markdown body into edit mode and focus it once
   * (e.g. after Enter on the meeting title).
   */
  enterEdit?: boolean;
  onEnterEditHandled?: () => void;
};

function MeetingContentTabEditor({
  tab,
  value: initialValue,
  ariaLabel,
  onSave,
  dockToggle = false,
  onToggleDock,
  enterEdit = false,
  onEnterEditHandled,
}: MeetingContentTabEditorProps) {
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
    initialValue,
    save: (next) => {
      void onSave(next);
      return { ok: true as const };
    },
  });

  useEffect(() => {
    if (!enterEdit) return;
    activateEditMode({ focusEditor: false });
    deferFocusAfterTitleLeave(requestEditorFocus);
    onEnterEditHandled?.();
  }, [
    activateEditMode,
    enterEdit,
    onEnterEditHandled,
    requestEditorFocus,
  ]);

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
      <ContentMarkdownDescriptionLayout
        mode={mode}
        editorActivated={editorActivated}
        onToggleMode={handleToggleViewMode}
        value={value}
        onChange={handleChange}
        onBlur={handleBlurSave}
        focusRequest={editorFocusRequest}
        ariaLabel={ariaLabel}
        emptyMessage={`No ${emptyLabel} yet.`}
        emptyClassName="content-markdown-empty-hint"
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
  /** Empty-create title hint. */
  titlePlaceholder?: string;
  /** Open directly in title editing mode. */
  titleAutoEdit?: boolean;
  /** Discard an unsaved meeting whose title is still empty. */
  onEmptyTitleDiscard?: () => void;
  summary: string;
  notes: string;
  transcription: string;
  format?: MeetingFormat | string | null;
  meeting: MeetingPropertiesInlineChipsProps["meeting"];
  onTitleChange: (title: string) => void | Promise<void>;
  onFormatChange?: (format: MeetingFormat) => void;
  /** Extra action(s) rendered to the left of the close button (e.g. ⋯ menu). */
  headerMoreAction?: ReactNode;
  onSummaryChange: (summary: string) => void;
  onNotesChange: (notes: string) => void;
  onTranscriptionChange: (transcription: string) => void;
  onStatusChange?: (status: TaskStatus) => void;
  onStartChange?: (value: Date | null) => void;
  onEndChange?: (value: Date | null) => void;
  onProjectChange?: (projectKey: string | null) => void;
  onOrganizationChange?: (organizationId: string | null) => void;
  onLocationOrganizationChange?: (organizationId: string | null) => void;
  onAttendeeContactIdsChange?: (contactIds: string[]) => void;
  onTrackedDurationSecondsChange?: (seconds: number | null) => void;
  timerSession?: MeetingPropertiesInlineChipsProps["timerSession"];
  onFieldActivate?: (field: string) => void;
  organizationOptions?: MeetingPropertiesInlineChipsProps["organizationOptions"];
  contactOptions?: MeetingPropertiesInlineChipsProps["contactOptions"];
  projectOptions?: MeetingPropertiesInlineChipsProps["projectOptions"];
  onCreateOrganizationFromQuery?: (query: string) => void;
  onCreateContactFromQuery?: (query: string) => void;
  onSendMeetingInvite?: (contactId: string) => void | Promise<void>;
  onSendMeetingReminder?: (contactId: string) => void | Promise<void>;
  resolveContactHref?: (contactId: string) => string | null;
  onNavigateHref?: (href: string) => void;
  layout?: "page" | "panel";
  propertyTriggerVariant?: PropertyDropdownTriggerVariant;
  /**
   * When true, `1` / `2` / `3` switch Summary / Notes / Transcription.
   * Defaults to on for the narrow panel so calendar mode digits yield.
   */
  contentTabShortcutsEnabled?: boolean;
  /**
   * Controlled content tab. When set with `onContentTabChange`, survives
   * remounts (e.g. calendar panel ↔ fullscreen page overlays).
   */
  contentTab?: MeetingContentTab;
  onContentTabChange?: (tab: MeetingContentTab) => void;
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
  titlePlaceholder,
  titleAutoEdit,
  onEmptyTitleDiscard,
  summary,
  notes,
  transcription,
  format,
  meeting,
  onTitleChange,
  onFormatChange,
  onSummaryChange,
  onNotesChange,
  onTranscriptionChange,
  onStatusChange,
  onStartChange,
  onEndChange,
  onProjectChange,
  onOrganizationChange,
  onLocationOrganizationChange,
  onAttendeeContactIdsChange,
  onTrackedDurationSecondsChange,
  timerSession = null,
  onFieldActivate,
  organizationOptions,
  contactOptions,
  projectOptions,
  onCreateOrganizationFromQuery,
  onCreateContactFromQuery,
  onSendMeetingInvite,
  onSendMeetingReminder,
  resolveContactHref,
  onNavigateHref,
  layout = "panel",
  propertyTriggerVariant,
  contentTabShortcutsEnabled,
  contentTab,
  onContentTabChange,
  onClose,
  onExpand,
  onCollapse,
  headerMoreAction: _headerMoreAction,
}: MeetingDetailViewProps) {
  const [uncontrolledTab, setUncontrolledTab] =
    useState<MeetingContentTab>("summary");
  const activeTab = contentTab ?? uncontrolledTab;
  const setActiveTab = onContentTabChange ?? setUncontrolledTab;
  const [dockToggle, setDockToggle] = useState<ReactNode>(null);
  const [pendingSummaryEdit, setPendingSummaryEdit] = useState(false);
  const tabShortcutsEnabled =
    contentTabShortcutsEnabled ?? layout === "panel";
  const meetingFormat = format ?? meeting?.format ?? "video_call";
  const isVideoCall = isVideoCallMeetingFormat(meetingFormat);
  const visibleTabOrder = useMemo(
    () => buildMeetingContentTabOrder({ isVideoCall }),
    [isVideoCall],
  );
  const contentTabs = useMemo(
    (): { id: MeetingContentTab; label: string }[] =>
      visibleTabOrder.map((id) => ({
        id,
        label: MEETING_CONTENT_TAB_LABELS[id],
      })),
    [visibleTabOrder],
  );

  useMeetingContentTabShortcuts({
    enabled: tabShortcutsEnabled,
    activeTab,
    onTabChange: setActiveTab,
    visibleTabs: visibleTabOrder,
  });

  useEffect(() => {
    if (!visibleTabOrder.includes(activeTab)) {
      setActiveTab("summary");
    }
  }, [activeTab, visibleTabOrder]);

  const handleLeaveTitleForSummary = useCallback(() => {
    setActiveTab("summary");
    setPendingSummaryEdit(true);
  }, []);

  const handleSummaryEnterEditHandled = useCallback(() => {
    setPendingSummaryEdit(false);
  }, []);

  const isMarkdownTab = activeTab !== MEETING_DETAILS_TAB;

  const tabValue =
    activeTab === "summary"
      ? summary
      : activeTab === "notes"
        ? notes
        : activeTab === "transcription"
          ? transcription
          : "";

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
        : activeTab === "transcription"
          ? "Meeting transcription"
          : "Meeting details";

  const triggerVariant =
    propertyTriggerVariant ?? (layout === "panel" ? "inlineChip" : "default");

  const propertiesProps = {
    meeting: meeting
      ? {
          ...meeting,
          // Keep in sync with the header format toggle (same source of truth).
          format: format ?? meeting.format,
        }
      : null,
    onStatusChange,
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

  const titleEditor = (
    <OverviewNameEditor
      value={title}
      entityLabel="Meeting"
      placeholder={titlePlaceholder}
      autoEdit={titleAutoEdit ?? title === "New meeting"}
      allowEmpty={onEmptyTitleDiscard != null}
      onEmptyDiscard={onEmptyTitleDiscard}
      onLeaveTitle={(reason) => {
        if (reason === "enter" || reason === "tab") {
          handleLeaveTitleForSummary();
        }
      }}
      onSave={async (next) => {
        try {
          await onTitleChange(next);
          return { ok: true as const };
        } catch (error) {
          return {
            ok: false as const,
            error:
              error instanceof Error
                ? error.message
                : "Unable to save meeting.",
          };
        }
      }}
    />
  );

  const contentTabNav = (
    <div className="meeting-detail-view__tabs">
      <PillNav
        className="meeting-detail-view__tabs-nav"
        ariaLabel="Meeting content"
        items={contentTabs.map((tab) => ({
          value: tab.id,
          label: tab.label,
        }))}
        value={activeTab}
        onChange={setActiveTab}
      />
    </div>
  );

  const formatToggle = (
    <MeetingFormatToggle
      value={format}
      onChange={onFormatChange}
      disabled={meeting == null}
      locationOrganizationId={meeting?.locationOrganizationId}
      locationOrganizationAddress={meeting?.locationOrganizationAddress}
      onLocationOrganizationChange={onLocationOrganizationChange}
      organizationOptions={organizationOptions}
      onCreateOrganizationFromQuery={onCreateOrganizationFromQuery}
    />
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

  useEffect(() => {
    if (!isMarkdownTab) {
      setDockToggle(null);
    }
  }, [isMarkdownTab]);

  const contentEditor = (
    <div
      className="meeting-detail-view__editor-shell"
      role="region"
      aria-label={tabAriaLabel}
    >
      {activeTab === MEETING_DETAILS_TAB ? (
        <MeetingPortalEmailActions
          attendeeContactIds={meeting?.attendeeContactIds ?? []}
          attendeePortalEmails={meeting?.attendeePortalEmails}
          attendeeOptions={contactOptions ?? []}
          onSendInvite={onSendMeetingInvite}
          onSendReminder={onSendMeetingReminder}
          resolveContactHref={resolveContactHref}
          onNavigateHref={onNavigateHref}
        />
      ) : (
        <MeetingContentTabEditor
          key={activeTab}
          tab={activeTab}
          value={tabValue}
          ariaLabel={tabAriaLabel}
          onSave={onTabSave}
          dockToggle
          onToggleDock={setDockToggle}
          enterEdit={activeTab === "summary" && pendingSummaryEdit}
          onEnterEditHandled={handleSummaryEnterEditHandled}
        />
      )}
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
                  {titleEditor}
                  {formatToggle}
                </ContentDetailTitleHeader>
                <div className="meeting-detail-view__content meeting-detail-view__content--page">
                  {contentTabNav}
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
        {formatToggle}
        <div className="meeting-detail-view__title-row">
          <div className="meeting-detail-view__title">{titleEditor}</div>
          {closeAction ? (
            <div className="meeting-detail-view__header-actions">
              {closeAction}
            </div>
          ) : null}
        </div>
      </header>
      <MeetingPropertiesInlineChips
        {...propertiesProps}
        triggerVariant={triggerVariant}
      />
      <div className="meeting-detail-view__content meeting-detail-view__content--page">
        {contentTabNav}
        {contentEditor}
      </div>
      {bottomChrome}
    </div>
  );
}
