"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { SyncIcon } from "@primer/octicons-react";

import { COMPOSE_NO_PROJECT_VALUE } from "../../compose/compose-task.js";
import {
  DROPDOWN_NONE_VALUE,
  DROPDOWN_NO_PROJECT_VALUE,
  resolveDropdownNone,
  resolveDropdownProjectKey,
  type AssigneeDropdownContact,
} from "../dropdowns/dropdown-options.js";
import { PropertyDropdown } from "../dropdowns/property-dropdown.js";
import { SearchableDropdown } from "../dropdowns/searchable-dropdown.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { ComposeAssigneeDropdown } from "../compose/compose-assignee-dropdown.js";
import { ComposeDueDateDropdown } from "../compose/compose-due-date-dropdown.js";
import { MeetingScheduleDropdown } from "../meetings/meeting-schedule-dropdown.js";
import { OrganizationIcon } from "../organizations/organization-icon.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import {
  getTaskPriorityLabel,
  isTaskPriorityNone,
  TASK_PRIORITY_ORDER,
  type TaskPriority,
} from "../../tasks/task-priority.js";
import {
  getTaskStatusLabel,
  TASK_STATUS_ORDER,
  type TaskStatus,
} from "../../tasks/task-status.js";
import { TaskPriorityIcon } from "../tasks/task-priority-icon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import {
  TaskCommentEditor,
  type TaskCommentEditorHandle,
} from "../tasks/task-comment-editor.js";
import { DEFAULT_MEETING_DURATION_MINUTES } from "../../meetings/parse-natural-language-meeting-schedule.js";
import { MeetingAttendeeLabels } from "../meetings/meeting-attendee-labels.js";
import { isSearchableDropdownPanelOpen } from "../../list-nav/should-handle-list-keyboard-navigation.js";
import { shouldHandleGlobalShortcut } from "../../shortcuts/shortcut-guards.js";
import type { EmailAgentActionCardId } from "./email-agent-action-cards.js";

export type EmailComposerTaskSubmit = {
  title: string;
  description: string;
  projectId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assigneeId: string | null;
};

export type EmailComposerMeetingSubmit = {
  title: string;
  notes: string;
  status: TaskStatus;
  startAt: Date;
  endAt: Date;
  projectKey: string | null;
  organizationId: string | null;
  attendeeContactIds: string[];
};

export type EmailThreadCommentComposerProps = {
  mode?: EmailAgentActionCardId | null;
  onSubmit: (body: string) => void | Promise<void>;
  onSubmitTask?: (input: EmailComposerTaskSubmit) => void | Promise<void>;
  onSubmitMeeting?: (input: EmailComposerMeetingSubmit) => void | Promise<void>;
  disabled?: boolean;
  sending?: boolean;
  placeholder?: string;
  contextLabel?: string | null;
  contacts?: AssigneeDropdownContact[];
  /** Project options keyed by project id (task create). */
  projectIdOptions?: SearchableDropdownOption<string>[];
  /** Project options keyed by project key (meeting create). */
  projectKeyOptions?: SearchableDropdownOption<string>[];
  organizationOptions?: SearchableDropdownOption<string>[];
  contactOptions?: SearchableDropdownOption<string>[];
  defaultProjectId?: string | null;
  defaultProjectKey?: string | null;
  defaultAssigneeId?: string | null;
  defaultOrganizationId?: string | null;
  defaultAttendeeContactIds?: string[];
};

function CommentPromptSendIcon() {
  return (
    <svg
      className="email-agent-prompt__send-icon"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Focus title (task/agenda) or body without scrolling the email thread. */
function focusEmailComposerField(
  mode: EmailAgentActionCardId | null | undefined,
  titleInput: HTMLInputElement | null,
  bodyEditor: TaskCommentEditorHandle | null,
): void {
  if (mode === "task" || mode === "calendar") {
    titleInput?.focus({ preventScroll: true });
    return;
  }
  bodyEditor?.focus();
}

function defaultMeetingSchedule(now = new Date()): {
  startAt: Date;
  endAt: Date;
} {
  const stepMs = 15 * 60_000;
  const startAt = new Date(
    Math.ceil((now.getTime() + 60 * 60_000) / stepMs) * stepMs,
  );
  return {
    startAt,
    endAt: new Date(
      startAt.getTime() + DEFAULT_MEETING_DURATION_MINUTES * 60_000,
    ),
  };
}

function buildStatusOptions(
  projectBound: boolean,
): SearchableDropdownOption<TaskStatus>[] {
  const all = TASK_STATUS_ORDER.map((value) => ({
    value,
    label: getTaskStatusLabel(value),
    searchTerms: value.replaceAll("_", " "),
    icon: <TaskStatusIcon status={value} title={getTaskStatusLabel(value)} size={14} />,
  }));
  if (!projectBound) {
    return all.filter((option) => option.value === "triage");
  }
  return all;
}

function buildPriorityOptions(): SearchableDropdownOption<string>[] {
  return TASK_PRIORITY_ORDER.map((value) => ({
    value: String(value),
    label: getTaskPriorityLabel(value),
    icon: (
      <TaskPriorityIcon
        priority={value}
        title={getTaskPriorityLabel(value)}
        size={14}
      />
    ),
  }));
}

/**
 * Sticky bottom composer for email thread comments / agent discussion.
 * Modes: default/reply → agent prompt; note → thread note; task/agenda → local create.
 */
export function EmailThreadCommentComposer({
  mode = null,
  onSubmit,
  onSubmitTask,
  onSubmitMeeting,
  disabled = false,
  sending = false,
  placeholder,
  contextLabel = null,
  contacts = [],
  projectIdOptions = [],
  projectKeyOptions = [],
  organizationOptions = [],
  contactOptions = [],
  defaultProjectId = null,
  defaultProjectKey = null,
  defaultAssigneeId = null,
  defaultOrganizationId = null,
  defaultAttendeeContactIds = [],
}: EmailThreadCommentComposerProps) {
  const isTask = mode === "task";
  const isAgenda = mode === "calendar";
  const isStructured = isTask || isAgenda;

  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [taskProjectId, setTaskProjectId] = useState<string | null>(
    defaultProjectId,
  );
  const [status, setStatus] = useState<TaskStatus>("triage");
  const [priority, setPriority] = useState<TaskPriority>(0);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(
    defaultAssigneeId,
  );
  const [meetingProjectKey, setMeetingProjectKey] = useState<string | null>(
    defaultProjectKey,
  );
  const [meetingOrganizationId, setMeetingOrganizationId] = useState<
    string | null
  >(defaultOrganizationId);
  const [attendeeContactIds, setAttendeeContactIds] = useState<string[]>(
    defaultAttendeeContactIds,
  );
  const [startAt, setStartAt] = useState<Date | null>(() =>
    defaultMeetingSchedule().startAt,
  );
  const [endAt, setEndAt] = useState<Date | null>(() =>
    defaultMeetingSchedule().endAt,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const bodyEditorRef = useRef<TaskCommentEditorHandle | null>(null);
  const skipInitialFocusRef = useRef(true);

  useEffect(() => {
    setDraft("");
    setTitle("");
    setLocalError(null);
    setTaskProjectId(defaultProjectId);
    setStatus("triage");
    setPriority(0);
    setDueDate(null);
    setAssigneeId(defaultAssigneeId);
    setMeetingProjectKey(defaultProjectKey);
    setMeetingOrganizationId(defaultOrganizationId);
    setAttendeeContactIds(defaultAttendeeContactIds);
    const schedule = defaultMeetingSchedule();
    setStartAt(schedule.startAt);
    setEndAt(schedule.endAt);
    // Intentionally reset when mode or seed identity changes — not on every
    // parent re-render of default arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed via joined ids
  }, [
    mode,
    defaultProjectId,
    defaultProjectKey,
    defaultAssigneeId,
    defaultOrganizationId,
    defaultAttendeeContactIds.join(","),
  ]);

  useEffect(() => {
    if (skipInitialFocusRef.current) {
      skipInitialFocusRef.current = false;
      return;
    }
    if (disabled || sending) return;

    let timeoutId = 0;
    const focusComposer = () => {
      focusEmailComposerField(
        mode,
        titleInputRef.current,
        bodyEditorRef.current,
      );
    };

    // Title input mounts after structured mode flips; wait a frame.
    const frame = window.requestAnimationFrame(() => {
      focusComposer();
      // CodeMirror may not be ready on the first frame after mode change.
      timeoutId = window.setTimeout(focusComposer, 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeoutId);
    };
  }, [disabled, mode, sending]);

  useEffect(() => {
    if (disabled || sending) return;

    function isComposerTextFieldFocused(): boolean {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      if (titleInputRef.current && active === titleInputRef.current) {
        return true;
      }
      const host = formRef.current;
      if (!host?.contains(active)) return false;
      return Boolean(
        active.closest(".cm-editor") ||
          active.closest("[role='textbox']") ||
          active.classList.contains("email-agent-prompt__title"),
      );
    }

    function focusPrimaryField() {
      focusEmailComposerField(
        mode,
        titleInputRef.current,
        bodyEditorRef.current,
      );
    }

    function blurComposerTextFields() {
      titleInputRef.current?.blur();
      bodyEditorRef.current?.blur();
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        formRef.current?.contains(active) &&
        (active.closest(".cm-editor") ||
          active === titleInputRef.current ||
          active.classList.contains("email-agent-prompt__title"))
      ) {
        active.blur();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) {
        return;
      }

      if (event.key === "Escape") {
        if (isSearchableDropdownPanelOpen()) return;
        if (!isComposerTextFieldFocused()) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        blurComposerTextFields();
        return;
      }

      if (event.key === "Tab" && !event.shiftKey) {
        // Inside title/body: leave Tab alone (title → body / properties).
        if (isComposerTextFieldFocused()) return;
        if (!shouldHandleGlobalShortcut(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        focusPrimaryField();
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [disabled, mode, sending]);

  useEffect(() => {
    if (!taskProjectId && status !== "triage") {
      setStatus("triage");
    }
  }, [status, taskProjectId]);

  const busy = sending;
  const inputDisabled = disabled || busy;
  const context = contextLabel?.trim() || null;

  const resolvedPlaceholder =
    placeholder ??
    (isTask
      ? "Add a description…"
      : isAgenda
        ? "Add notes…"
        : mode === "note"
          ? "Add a note on this email…"
          : "Ask the agent about this email… (task, reply, agenda…)");

  const statusOptions = useMemo(
    () => buildStatusOptions(isTask ? Boolean(taskProjectId) : true),
    [isTask, taskProjectId],
  );
  const priorityOptions = useMemo(() => buildPriorityOptions(), []);

  const attendeeOptions = useMemo(
    () => contactOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    [contactOptions],
  );

  const submitReady = (() => {
    if (inputDisabled) return false;
    if (isTask) return Boolean(title.trim());
    if (isAgenda) return Boolean(title.trim() && startAt && endAt);
    return Boolean(draft.trim());
  })();

  function resetFields() {
    setDraft("");
    setTitle("");
    setLocalError(null);
  }

  async function submit() {
    if (!submitReady) return;
    setLocalError(null);

    if (isTask) {
      if (!onSubmitTask) return;
      const nextTitle = title.trim();
      await onSubmitTask({
        title: nextTitle,
        description: draft.trim(),
        projectId: taskProjectId,
        status,
        priority,
        dueDate,
        assigneeId,
      });
      resetFields();
      return;
    }

    if (isAgenda) {
      if (!onSubmitMeeting || !startAt || !endAt) return;
      if (endAt.getTime() <= startAt.getTime()) {
        setLocalError("End time must be after start.");
        return;
      }
      await onSubmitMeeting({
        title: title.trim(),
        notes: draft.trim(),
        status,
        startAt,
        endAt,
        projectKey: meetingProjectKey,
        organizationId: meetingOrganizationId,
        attendeeContactIds,
      });
      resetFields();
      return;
    }

    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await onSubmit(text);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <form
      ref={formRef}
      className="email-thread-comment-composer"
      data-email-agent-composer=""
      onSubmit={handleSubmit}
    >
      <div
        className={[
          "email-agent-prompt",
          context ? "email-agent-prompt--has-context" : "",
          isStructured ? "email-agent-prompt--structured" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="email-agent-prompt__shell">
          <div
            className={[
              "email-agent-prompt__host",
              disabled && !busy ? "email-agent-prompt__host--inactive" : "",
              context ? "email-agent-prompt__host--context" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div className="email-agent-prompt__inner">
              {context ? (
                <div className="email-agent-prompt__context" aria-live="polite">
                  <span className="email-agent-prompt__context-chip">
                    {context}
                  </span>
                </div>
              ) : null}
              {isStructured ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  className="email-agent-prompt__title"
                  value={title}
                  disabled={inputDisabled}
                  placeholder={isTask ? "Task title" : "Meeting title"}
                  aria-label={isTask ? "Task title" : "Meeting title"}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.metaKey || event.ctrlKey)
                    ) {
                      event.preventDefault();
                      void submit();
                    }
                  }}
                />
              ) : null}
              <div className="email-agent-prompt__input-row">
                <TaskCommentEditor
                  className="email-agent-prompt__input"
                  variant="composer"
                  value={draft}
                  disabled={inputDisabled}
                  editorRef={bodyEditorRef}
                  placeholder={resolvedPlaceholder}
                  ariaLabel={
                    isTask
                      ? "Task description"
                      : isAgenda
                        ? "Meeting notes"
                        : context
                          ? `Ask AI to update ${context}`
                          : mode === "note"
                            ? "Thread note"
                            : "Thread comment"
                  }
                  submitOnEnter={!isStructured}
                  onChange={setDraft}
                  onSubmitShortcut={() => {
                    void submit();
                  }}
                />
              </div>
              {isStructured ? (
                <div
                  className="email-agent-prompt__properties"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  {isTask ? (
                    <>
                      <PropertyDropdown
                        value={status}
                        options={statusOptions}
                        onChange={setStatus}
                        disabled={inputDisabled || !taskProjectId}
                        searchPlaceholder="Change status…"
                        searchShortcutLabel="S"
                        ariaLabel="Status"
                        fallbackIcon={
                          <TaskStatusIcon
                            status={status}
                            title={getTaskStatusLabel(status)}
                            size={14}
                          />
                        }
                        fallbackLabel={getTaskStatusLabel(status)}
                        panelAlign="start"
                        triggerVariant="composePill"
                      />
                      <ComposeDueDateDropdown
                        value={dueDate}
                        onChange={setDueDate}
                        disabled={inputDisabled}
                        triggerVariant="composePill"
                      />
                      <PropertyDropdown
                        value={String(priority)}
                        options={priorityOptions}
                        onChange={(next) =>
                          setPriority(Number(next) as TaskPriority)
                        }
                        disabled={inputDisabled}
                        searchPlaceholder="Change priority…"
                        searchShortcutLabel="P"
                        ariaLabel="Priority"
                        fallbackIcon={
                          <TaskPriorityIcon
                            priority={priority}
                            title={getTaskPriorityLabel(priority)}
                            size={14}
                          />
                        }
                        fallbackLabel={getTaskPriorityLabel(priority)}
                        mutedSelected={isTaskPriorityNone(priority)}
                        panelAlign="start"
                        triggerVariant="composePill"
                        hideTriggerLabel
                      />
                      {projectIdOptions.length > 0 ? (
                        <PropertyDropdown
                          value={taskProjectId ?? COMPOSE_NO_PROJECT_VALUE}
                          options={projectIdOptions}
                          onChange={(next) => {
                            const resolved =
                              next === COMPOSE_NO_PROJECT_VALUE ||
                              next === DROPDOWN_NO_PROJECT_VALUE
                                ? null
                                : next;
                            setTaskProjectId(resolved);
                            if (!resolved) setStatus("triage");
                          }}
                          disabled={inputDisabled}
                          searchPlaceholder="Change project…"
                          searchShortcutLabel="⇧P"
                          ariaLabel="Project"
                          fallbackIcon={<DefaultProjectIcon size={14} />}
                          fallbackLabel="No project"
                          mutedFallback
                          panelAlign="start"
                          triggerVariant="composePill"
                        />
                      ) : null}
                      <ComposeAssigneeDropdown
                        contacts={contacts}
                        value={assigneeId}
                        onChange={setAssigneeId}
                        disabled={inputDisabled}
                        triggerVariant="composePill"
                      />
                    </>
                  ) : null}
                  {isAgenda ? (
                    <>
                      <PropertyDropdown
                        value={status}
                        options={statusOptions}
                        onChange={setStatus}
                        disabled={inputDisabled}
                        searchPlaceholder="Change status…"
                        searchShortcutLabel="S"
                        ariaLabel="Status"
                        fallbackIcon={
                          <TaskStatusIcon
                            status={status}
                            title={getTaskStatusLabel(status)}
                            size={14}
                          />
                        }
                        fallbackLabel={getTaskStatusLabel(status)}
                        panelAlign="start"
                        triggerVariant="composePill"
                      />
                      <MeetingScheduleDropdown
                        startAt={startAt}
                        endAt={endAt}
                        disabled={inputDisabled}
                        onStartChange={setStartAt}
                        onEndChange={setEndAt}
                        triggerVariant="composePill"
                      />
                      {projectKeyOptions.length > 0 ? (
                        <PropertyDropdown
                          value={
                            meetingProjectKey ?? DROPDOWN_NO_PROJECT_VALUE
                          }
                          options={projectKeyOptions}
                          onChange={(next) =>
                            setMeetingProjectKey(resolveDropdownProjectKey(next))
                          }
                          disabled={inputDisabled}
                          searchPlaceholder="Change project…"
                          searchShortcutLabel="⇧P"
                          ariaLabel="Project"
                          fallbackIcon={<DefaultProjectIcon size={14} />}
                          fallbackLabel="No project"
                          mutedFallback
                          panelAlign="start"
                          triggerVariant="composePill"
                        />
                      ) : null}
                      {organizationOptions.length > 0 ? (
                        <PropertyDropdown
                          value={
                            meetingOrganizationId ?? DROPDOWN_NONE_VALUE
                          }
                          options={organizationOptions}
                          onChange={(next) =>
                            setMeetingOrganizationId(resolveDropdownNone(next))
                          }
                          disabled={inputDisabled}
                          searchPlaceholder="Change organization…"
                          searchShortcutLabel="O"
                          ariaLabel="Organization"
                          fallbackIcon={<OrganizationIcon size={14} />}
                          fallbackLabel="No organization"
                          mutedFallback
                          panelAlign="start"
                          triggerVariant="composePill"
                        />
                      ) : null}
                      {attendeeOptions.length > 0 ? (
                        <SearchableDropdown
                          multiple
                          values={attendeeContactIds}
                          options={attendeeOptions}
                          onValuesChange={setAttendeeContactIds}
                          disabled={inputDisabled}
                          searchPlaceholder="Add attendees…"
                          searchShortcutLabel="A"
                          ariaLabel="Attendees"
                          emptySelectionLabel="No attendees"
                          className="property-dropdown"
                          panelWidth={280}
                          panelAlign="start"
                          renderTrigger={({
                            open,
                            disabled: isDisabled,
                            triggerId,
                            onToggle,
                          }) => (
                            <button
                              type="button"
                              id={triggerId}
                              className={[
                                "property-dropdown-trigger",
                                "property-dropdown-trigger--compose-pill",
                                open ? "is-open" : null,
                                attendeeContactIds.length === 0
                                  ? "is-muted"
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                              disabled={isDisabled}
                              aria-haspopup="listbox"
                              aria-expanded={open}
                              aria-label="Attendees"
                              onClick={(event) => {
                                event.stopPropagation();
                                onToggle();
                              }}
                            >
                              <span
                                className="property-dropdown-trigger__icon"
                                aria-hidden="true"
                              >
                                <ContactPersonIcon size={14} />
                              </span>
                              <span className="property-dropdown-trigger__label">
                                <MeetingAttendeeLabels
                                  attendeeContactIds={attendeeContactIds}
                                  attendeeOptions={attendeeOptions}
                                  density="compact"
                                />
                              </span>
                            </button>
                          )}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <div className="email-agent-prompt__properties-spacer" />
                  <button
                    type="submit"
                    className={[
                      "email-agent-prompt__send",
                      busy ? "email-agent-prompt__send--busy" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={busy ? true : !submitReady}
                    aria-disabled={busy ? true : !submitReady}
                    aria-busy={busy}
                    aria-label={
                      busy
                        ? "Sending"
                        : isTask
                          ? "Create task"
                          : "Create meeting"
                    }
                    title={
                      busy
                        ? "Sending…"
                        : isTask
                          ? "Create task"
                          : "Create meeting"
                    }
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                  >
                    {busy ? (
                      <SyncIcon
                        className="email-agent-prompt__send-icon email-agent-prompt__send-icon--spin"
                        size={14}
                        aria-hidden="true"
                      />
                    ) : (
                      <CommentPromptSendIcon />
                    )}
                  </button>
                </div>
              ) : (
                <div className="email-agent-prompt__toolbar">
                  <button
                    type="submit"
                    className={[
                      "email-agent-prompt__send",
                      busy ? "email-agent-prompt__send--busy" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    disabled={busy ? true : !submitReady}
                    aria-disabled={busy ? true : !submitReady}
                    aria-busy={busy}
                    aria-label={busy ? "Sending" : "Send"}
                    title={busy ? "Sending…" : "Send"}
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                  >
                    {busy ? (
                      <SyncIcon
                        className="email-agent-prompt__send-icon email-agent-prompt__send-icon--spin"
                        size={14}
                        aria-hidden="true"
                      />
                    ) : (
                      <CommentPromptSendIcon />
                    )}
                  </button>
                </div>
              )}
              {localError ? (
                <p className="email-agent-prompt__error" role="alert">
                  {localError}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
