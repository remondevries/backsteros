"use client";

import { formatTrackedDuration } from "@backsteros/contracts";
import { PlusIcon, XIcon } from "@primer/octicons-react";
import { useMemo, useRef, useState } from "react";

import {
  sumTimetrackingSessionSeconds,
  type TimetrackingSession,
} from "../../calendar/calendar-timetracking-sessions.js";
import { formatTimetrackingHumanDuration } from "../../calendar/calendar-timetracking-breakdown.js";
import {
  formatDueDateInputValue,
  parseYmdLocal,
} from "../../tasks/task-due-date.js";
import { DROPDOWN_NONE_VALUE } from "../dropdowns/dropdown-options.js";
import { DeferredSearchableDropdown } from "../dropdowns/deferred-searchable-dropdown.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import {
  TaskBoardCard,
  type TaskBoardCardTask,
} from "../tasks/task-board-card.js";
import { DueDateCalendarPopover } from "../tasks/due-date-calendar-popover.js";
import { TimetrackingSessionDeleteConfirmModal } from "./timetracking-session-delete-confirm-modal.js";
import { TimetrackingSessionDurationField } from "./timetracking-session-duration-field.js";

export type TimetrackingSessionsPanelProps = {
  displayId?: string | null;
  title: string;
  kindLabel?: string;
  sessions: readonly TimetrackingSession[];
  loading?: boolean;
  errorMessage?: string | null;
  emptyMessage?: string;
  /** When set, replaces the plain header with a read-only board card. */
  boardTask?: TaskBoardCardTask | null;
  /** Assignee dropdown options — used for the board-card owner avatar. */
  assigneeOptions?: import("../dropdowns/searchable-dropdown.js").SearchableDropdownOption<string>[];
  /** Contact id → avatar image URL for session actors. */
  avatarSrcByContactId?:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>;
  /** Lowercased actor name / first name → avatar image URL. */
  avatarSrcByActorName?:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>;
  /** Lowercased actor email → avatar image URL. */
  avatarSrcByActorEmail?:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>;
  /** When set, the title/board card opens the task/meeting. */
  onTitleClick?: () => void;
  onSessionDateChange?: (session: TimetrackingSession, startedAt: string) => void;
  onSessionDurationChange?: (
    session: TimetrackingSession,
    durationSeconds: number,
  ) => void;
  onDeleteSession?: (session: TimetrackingSession) => void | Promise<void>;
  onAddSession?: () => void | Promise<void>;
  onSessionActorChange?: (
    session: TimetrackingSession,
    actorContactId: string,
  ) => void | Promise<void>;
  className?: string;
};

type SessionOverrides = {
  startedAt?: string;
  durationSeconds?: number;
  actorContactId?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
};

function resolveAvatarSrc(
  map:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>
    | undefined,
  key: string | null | undefined,
): string | null {
  if (!map || !key) return null;
  if (map instanceof Map) return map.get(key) ?? null;
  return Object.prototype.hasOwnProperty.call(map, key)
    ? ((map as Record<string, string | null | undefined>)[key] ?? null)
    : null;
}

function resolveSessionAvatarSrc(
  session: TimetrackingSession,
  byContactId:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>
    | undefined,
  byActorName:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>
    | undefined,
  byActorEmail:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>
    | undefined,
): string | null {
  const fromContact = resolveAvatarSrc(byContactId, session.actorContactId);
  if (fromContact) return fromContact;
  const fromEmail = resolveAvatarSrc(
    byActorEmail,
    session.actorEmail?.trim().toLowerCase() || null,
  );
  if (fromEmail) return fromEmail;
  const nameKey = session.actorName?.trim().toLowerCase() || null;
  return resolveAvatarSrc(byActorName, nameKey);
}

function formatSessionDateLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleDateString();
  }
}

/** Keep local clock time; move the calendar day to `ymd`. */
function applyLocalYmdPreservingTime(iso: string, ymd: string): string {
  const current = new Date(iso);
  const day = parseYmdLocal(ymd);
  if (!day || Number.isNaN(current.getTime())) return iso;
  const next = new Date(current);
  next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
  return next.toISOString();
}

/**
 * Right-panel body: discrete timer sessions for a selected time-entry row.
 * Layout follows the members-02 list-table pattern (header card + table).
 */
export function TimetrackingSessionsPanel({
  displayId = null,
  title,
  kindLabel = "Task",
  sessions,
  loading = false,
  errorMessage = null,
  emptyMessage = "No timer sessions recorded yet.",
  boardTask = null,
  assigneeOptions = [],
  avatarSrcByContactId,
  avatarSrcByActorName,
  avatarSrcByActorEmail,
  onTitleClick,
  onSessionDateChange,
  onSessionDurationChange,
  onDeleteSession,
  onAddSession,
  onSessionActorChange,
  className,
}: TimetrackingSessionsPanelProps) {
  const [overrides, setOverrides] = useState<
    Record<string, SessionOverrides>
  >({});
  const [openDateSessionId, setOpenDateSessionId] = useState<string | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<TimetrackingSession | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const dateAnchorRefs = useRef<Map<string, HTMLElement>>(new Map());
  const openDateAnchorRef = useRef<HTMLElement | null>(null);

  const contactOptions = useMemo(
    () =>
      assigneeOptions.filter((option) => option.value !== DROPDOWN_NONE_VALUE),
    [assigneeOptions],
  );

  const displaySessions = useMemo(
    () =>
      sessions.map((session) => {
        if (session.isRunning) return session;
        const patch = overrides[session.id];
        if (!patch) return session;
        return {
          ...session,
          startedAt: patch.startedAt ?? session.startedAt,
          durationSeconds: patch.durationSeconds ?? session.durationSeconds,
          actorContactId: patch.actorContactId ?? session.actorContactId,
          actorName: patch.actorName ?? session.actorName,
          actorEmail: patch.actorEmail ?? session.actorEmail,
        };
      }),
    [overrides, sessions],
  );

  const totalSeconds = sumTimetrackingSessionSeconds(displaySessions);
  const hasRunningSession = displaySessions.some((session) => session.isRunning);
  const sectionClass = ["timetracking-sessions-panel", className]
    .filter(Boolean)
    .join(" ");
  const openLabel =
    kindLabel.trim().toLowerCase() === "meeting"
      ? `Open meeting ${title}`
      : `Open task ${title}`;
  const metaLabel =
    displaySessions.length === 0
      ? "No sessions"
      : `${displaySessions.length} session${displaySessions.length === 1 ? "" : "s"} · ${formatTimetrackingHumanDuration(totalSeconds)}`;

  const openDateSession =
    openDateSessionId == null
      ? null
      : (displaySessions.find(
          (session) => session.id === openDateSessionId && !session.isRunning,
        ) ?? null);
  openDateAnchorRef.current = openDateSessionId
    ? (dateAnchorRefs.current.get(openDateSessionId) ?? null)
    : null;

  function patchSession(sessionId: string, patch: SessionOverrides) {
    setOverrides((current) => ({
      ...current,
      [sessionId]: { ...current[sessionId], ...patch },
    }));
  }

  async function confirmDeleteSession() {
    if (!pendingDelete || !onDeleteSession || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteSession(pendingDelete);
      setOverrides((current) => {
        const next = { ...current };
        delete next[pendingDelete.id];
        return next;
      });
      setPendingDelete(null);
    } catch {
      setDeleteError("Couldn’t delete this time entry.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleAddSession() {
    if (!onAddSession || adding) return;
    setAdding(true);
    try {
      await onAddSession();
    } finally {
      setAdding(false);
    }
  }

  return (
    <section className={sectionClass} aria-label="Timer sessions">
      <header className="timetracking-sessions-panel__header">
        {boardTask ? (
          <div className="timetracking-sessions-panel__board-card">
            <TaskBoardCard
              task={boardTask}
              readOnly
              assigneeOptions={assigneeOptions}
              onOpen={onTitleClick ? () => onTitleClick() : undefined}
            />
            <p className="timetracking-sessions-panel__meta timetracking-sessions-panel__meta--on-card">
              {metaLabel}
            </p>
          </div>
        ) : (
          <div className="timetracking-sessions-panel__header-card">
            <div className="timetracking-sessions-panel__identity">
              {displayId ? (
                <span className="timetracking-sessions-panel__id">
                  {displayId}
                </span>
              ) : (
                <span className="timetracking-sessions-panel__kind">
                  {kindLabel}
                </span>
              )}
              {onTitleClick ? (
                <button
                  type="button"
                  className="timetracking-sessions-panel__title timetracking-sessions-panel__title--link"
                  onClick={onTitleClick}
                  aria-label={openLabel}
                >
                  {title}
                </button>
              ) : (
                <h2 className="timetracking-sessions-panel__title">{title}</h2>
              )}
              <p className="timetracking-sessions-panel__meta">{metaLabel}</p>
            </div>
          </div>
        )}
      </header>

      {loading ? (
        <p className="timetracking-sessions-panel__status">Loading sessions…</p>
      ) : errorMessage ? (
        <p className="timetracking-sessions-panel__status is-error">
          {errorMessage}
        </p>
      ) : (
        <div className="timetracking-sessions-panel__table-wrap">
          <table className="timetracking-sessions-panel__table">
            <thead>
              <tr>
                <th scope="col">Person</th>
                <th scope="col">Date</th>
                <th scope="col">
                  <span className="timetracking-sessions-panel__th-time">
                    <span>Time</span>
                    {onAddSession ? (
                      <button
                        type="button"
                        className="timetracking-sessions-panel__add"
                        disabled={adding || hasRunningSession}
                        aria-label="Add time entry"
                        title={
                          hasRunningSession
                            ? "Stop the running timer before adding a time entry"
                            : "Add time entry"
                        }
                        onClick={() => {
                          void handleAddSession();
                        }}
                      >
                        <PlusIcon size={14} />
                      </button>
                    ) : null}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {displaySessions.length === 0 ? (
                <tr className="timetracking-sessions-panel__empty-row">
                  <td colSpan={3}>
                    <p className="timetracking-sessions-panel__status">
                      {emptyMessage}
                    </p>
                  </td>
                </tr>
              ) : (
                displaySessions.map((session) => {
                const person = session.actorName?.trim() || "Unknown";
                const avatarSrc = resolveSessionAvatarSrc(
                  session,
                  avatarSrcByContactId,
                  avatarSrcByActorName,
                  avatarSrcByActorEmail,
                );
                const canEdit = !session.isRunning;
                const canDelete = Boolean(onDeleteSession) && !session.isRunning;
                const canChangeActor =
                  Boolean(onSessionActorChange) &&
                  canEdit &&
                  contactOptions.length > 0;
                const selectedContactId =
                  session.actorContactId &&
                  contactOptions.some(
                    (option) => option.value === session.actorContactId,
                  )
                    ? session.actorContactId
                    : (contactOptions.find(
                        (option) =>
                          option.label.trim().toLowerCase() ===
                          person.toLowerCase(),
                      )?.value ?? "");
                return (
                  <tr
                    key={session.id}
                    className={session.isRunning ? "is-running" : undefined}
                  >
                    <td>
                      <div className="timetracking-sessions-panel__person">
                        <span className="timetracking-sessions-panel__avatar">
                          <EntityAvatarIcon
                            src={avatarSrc}
                            size={28}
                            kind="contact"
                            className="timetracking-sessions-panel__avatar-img"
                          />
                        </span>
                        {canChangeActor ? (
                          <DeferredSearchableDropdown
                            value={selectedContactId}
                            options={contactOptions}
                            onChange={(next) => {
                              const option = contactOptions.find(
                                (entry) => entry.value === next,
                              );
                              if (!option) return;
                              patchSession(session.id, {
                                actorContactId: option.value,
                                actorName: option.label,
                                actorEmail: null,
                              });
                              void onSessionActorChange?.(session, option.value);
                            }}
                            searchPlaceholder="Change person…"
                            ariaLabel={`Change person for this time entry`}
                            className="timetracking-sessions-panel__person-dropdown"
                            panelAlign="start"
                            renderTrigger={({
                              open,
                              disabled,
                              triggerId,
                              onToggle,
                            }) => (
                              <button
                                type="button"
                                id={triggerId}
                                className="timetracking-sessions-panel__person-name timetracking-sessions-panel__person-name--button"
                                disabled={disabled}
                                aria-haspopup="listbox"
                                aria-expanded={open}
                                onClick={onToggle}
                              >
                                {person}
                              </button>
                            )}
                          />
                        ) : (
                          <span className="timetracking-sessions-panel__person-name">
                            {person}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="timetracking-sessions-panel__date">
                      {canEdit ? (
                        <span
                          className="timetracking-sessions-panel__date-anchor"
                          ref={(node) => {
                            if (node) {
                              dateAnchorRefs.current.set(session.id, node);
                            } else {
                              dateAnchorRefs.current.delete(session.id);
                            }
                          }}
                        >
                          <button
                            type="button"
                            className="timetracking-sessions-panel__date-button"
                            aria-expanded={openDateSessionId === session.id}
                            aria-haspopup="dialog"
                            onClick={() =>
                              setOpenDateSessionId((current) =>
                                current === session.id ? null : session.id,
                              )
                            }
                          >
                            {formatSessionDateLabel(session.startedAt)}
                          </button>
                        </span>
                      ) : (
                        <span className="timetracking-sessions-panel__date-static">
                          {formatSessionDateLabel(session.startedAt)}
                        </span>
                      )}
                    </td>
                    <td className="timetracking-sessions-panel__duration timetracking-sessions-panel__duration-cell">
                      {canEdit ? (
                        <TimetrackingSessionDurationField
                          durationSeconds={session.durationSeconds}
                          onCommit={(nextSeconds) => {
                            if (session.isRunning) return;
                            patchSession(session.id, {
                              durationSeconds: nextSeconds,
                            });
                            onSessionDurationChange?.(session, nextSeconds);
                          }}
                          ariaLabel={`Duration for ${person}`}
                        />
                      ) : (
                        <span className="timetracking-sessions-panel__duration-static is-live">
                          {formatTrackedDuration(session.durationSeconds)}
                        </span>
                      )}
                      {canDelete ? (
                        <button
                          type="button"
                          className="timetracking-sessions-panel__remove"
                          aria-label={`Delete time entry for ${person}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setDeleteError(null);
                            setPendingDelete(session);
                          }}
                        >
                          <XIcon size={12} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
              )}
            </tbody>
          </table>
          {openDateSession && !openDateSession.isRunning ? (
            <DueDateCalendarPopover
              open
              anchorRef={openDateAnchorRef}
              value={formatDueDateInputValue(openDateSession.startedAt)}
              onClose={() => setOpenDateSessionId(null)}
              onSelect={(ymd) => {
                if (openDateSession.isRunning) return;
                const nextStartedAt = applyLocalYmdPreservingTime(
                  openDateSession.startedAt,
                  ymd,
                );
                patchSession(openDateSession.id, { startedAt: nextStartedAt });
                onSessionDateChange?.(openDateSession, nextStartedAt);
              }}
            />
          ) : null}
        </div>
      )}
      {pendingDelete ? (
        <TimetrackingSessionDeleteConfirmModal
          durationSeconds={pendingDelete.durationSeconds}
          deleting={deleting}
          error={deleteError}
          onCancel={() => {
            if (deleting) return;
            setPendingDelete(null);
            setDeleteError(null);
          }}
          onConfirm={() => {
            void confirmDeleteSession();
          }}
        />
      ) : null}
    </section>
  );
}
