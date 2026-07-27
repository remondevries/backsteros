"use client";

import type { TaskActivity, TaskComment } from "@backsteros/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { ChevronRightIcon } from "@primer/octicons-react";

import { isAgentHoldCommentBody } from "../agent-hold-comment.js";
import { shouldHandleGlobalShortcut } from "../shortcut-guards.js";
import {
  agentWorkTotals,
  formatActivityDurationMs,
  formatActivityTokenCount,
  groupConsecutiveAgentWorked,
  type GroupedActivity,
} from "../task-activity-format.js";
import {
  formatTaskDueMetaLabel,
} from "../task-due-date.js";
import {
  getTaskPriorityLabel,
} from "../task-priority.js";
import {
  getTaskStatusLabel,
  isTaskStatus,
  migrateLegacyTaskStatus,
  type TaskStatus,
} from "../task-status.js";
import { AgentActivityIcon } from "./agent-activity-icon.js";
import { DefaultProjectIcon } from "./default-project-icon.js";
import { DocumentMarkdownPreview } from "./document-markdown-preview.js";
import { TaskStatusWorkingPulse } from "./task-status-working-pulse.js";
import { EntityActionsMenu } from "./entity-actions/entity-actions-menu.js";
import { EntityAvatarIcon } from "./entity-avatar-icon.js";
import { TasksNavIcon } from "./sidebar-nav-icons.js";
import { TaskDueDateIcon } from "./task-due-date-icon.js";
import { TaskPriorityIcon } from "./task-priority-icon.js";
import { TaskStatusIcon } from "./task-status-icon.js";

const COMMENT_FOCUS_ATTR = "data-task-comment-focus";

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof Error && err.name === "AbortError") return true;
  return false;
}

/** WebKit often surfaces cancelled fetches as opaque "Load failed" TypeErrors. */
function isTransientNetworkError(err: unknown): boolean {
  if (isAbortError(err)) return true;
  if (!(err instanceof Error)) return false;
  if (err.name === "NetworkError" || err.name === "TypeError") {
    const message = err.message.trim();
    return (
      message === "Load failed" ||
      message === "Failed to fetch" ||
      message === "NetworkError when attempting to fetch resource." ||
      message === "cancelled" ||
      message === "The operation was aborted."
    );
  }
  const message = err.message.trim();
  return (
    message === "Load failed" ||
    message === "Failed to fetch" ||
    message === "NetworkError when attempting to fetch resource."
  );
}

function feedLoadErrorMessage(err: unknown): string {
  if (isTransientNetworkError(err)) return "Could not load activity.";
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "Could not load activity.";
}

function isVisibleFocusTarget(el: HTMLElement): boolean {
  return el.getClientRects().length > 0;
}

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function statusLabel(value: unknown): string {
  if (typeof value !== "string") return "Unknown";
  if (isTaskStatus(value)) return getTaskStatusLabel(value as TaskStatus);
  return getTaskStatusLabel(migrateLegacyTaskStatus(value));
}

function asTaskStatus(value: unknown): TaskStatus | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return isTaskStatus(value) ? value : migrateLegacyTaskStatus(value);
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value);
  }
  return null;
}

function asOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function priorityLabel(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return getTaskPriorityLabel(value);
  }
  return "No priority";
}

function dueDateLabel(value: unknown): string {
  if (value == null) return "No due date";
  if (typeof value !== "string" && typeof value !== "number") {
    return "No due date";
  }
  return formatTaskDueMetaLabel(value) ?? "No due date";
}

function namedValue(
  id: unknown,
  name: unknown,
  fallback: string,
): string {
  const explicit = asOptionalString(name);
  if (explicit) return explicit;
  if (id == null) return fallback;
  return fallback;
}

function activityMessage(activity: TaskActivity): ReactNode {
  const name = <strong>{activity.actorName}</strong>;
  if (activity.type === "created") {
    return <>{name} created this task</>;
  }
  if (activity.type === "status_changed") {
    return (
      <>
        {name} changed status from <strong>{statusLabel(activity.data.from)}</strong>{" "}
        to <strong>{statusLabel(activity.data.to)}</strong>
      </>
    );
  }
  if (activity.type === "assignee_changed") {
    const toName = namedValue(activity.data.to, activity.data.toName, "someone");
    if (activity.data.to == null) {
      return <>{name} unassigned this task</>;
    }
    if (activity.data.from == null) {
      return (
        <>
          {name} assigned this task to <strong>{toName}</strong>
        </>
      );
    }
    return (
      <>
        {name} reassigned this task to <strong>{toName}</strong>
      </>
    );
  }
  if (activity.type === "priority_changed") {
    return (
      <>
        {name} changed priority from{" "}
        <strong>{priorityLabel(activity.data.from)}</strong> to{" "}
        <strong>{priorityLabel(activity.data.to)}</strong>
      </>
    );
  }
  if (activity.type === "due_date_changed") {
    return (
      <>
        {name} changed due date from{" "}
        <strong>{dueDateLabel(activity.data.from)}</strong> to{" "}
        <strong>{dueDateLabel(activity.data.to)}</strong>
      </>
    );
  }
  if (activity.type === "project_changed") {
    const fromName = namedValue(
      activity.data.from,
      activity.data.fromName,
      "No project",
    );
    const toName = namedValue(
      activity.data.to,
      activity.data.toName,
      "No project",
    );
    return (
      <>
        {name} moved this task from <strong>{fromName}</strong> to{" "}
        <strong>{toName}</strong>
      </>
    );
  }
  if (activity.type === "agent_worked") {
    const { durationMs, totalTokens } = agentWorkTotals(activity);
    return (
      <>
        {name} worked for <strong>{formatActivityDurationMs(durationMs)}</strong>
        {totalTokens != null && totalTokens > 0 ? (
          <>
            {" "}
            · <strong>{formatActivityTokenCount(totalTokens)}</strong> tokens
          </>
        ) : null}
      </>
    );
  }
  return <>{name} updated this task</>;
}

function ActivityLeadingIcon({
  activity,
  assigneeAvatarById,
}: {
  activity: TaskActivity;
  assigneeAvatarById?: ReadonlyMap<string, string | null>;
}) {
  if (activity.type === "status_changed") {
    const status = asTaskStatus(activity.data.to);
    if (status) {
      return (
        <span className="task-activity-event__marker" aria-hidden="true">
          <TaskStatusIcon status={status} size={12} />
        </span>
      );
    }
  }
  if (activity.type === "priority_changed") {
    const priority =
      typeof activity.data.to === "number" ? activity.data.to : 0;
    return (
      <span className="task-activity-event__marker" aria-hidden="true">
        <TaskPriorityIcon priority={priority} size={12} />
      </span>
    );
  }
  if (activity.type === "due_date_changed") {
    return (
      <span className="task-activity-event__marker" aria-hidden="true">
        <TaskDueDateIcon active={activity.data.to != null} size={12} />
      </span>
    );
  }
  if (activity.type === "assignee_changed") {
    const assigneeId = asOptionalString(activity.data.to);
    const avatarSrc = assigneeId
      ? (assigneeAvatarById?.get(assigneeId) ?? null)
      : null;
    return (
      <span
        className="task-activity-event__marker task-activity-event__marker--avatar"
        aria-hidden="true"
      >
        <EntityAvatarIcon src={avatarSrc} size={12} kind="contact" />
      </span>
    );
  }
  if (activity.type === "agent_worked") {
    return (
      <span className="task-activity-event__marker" aria-hidden="true">
        <AgentActivityIcon size={12} className="task-activity-event__glyph" />
      </span>
    );
  }
  if (activity.type === "created") {
    return (
      <span className="task-activity-event__marker" aria-hidden="true">
        <TasksNavIcon className="task-activity-event__glyph" />
      </span>
    );
  }
  if (activity.type === "project_changed") {
    return (
      <span className="task-activity-event__marker" aria-hidden="true">
        <DefaultProjectIcon size={12} />
      </span>
    );
  }
  return (
    <span className="task-activity-event__marker" aria-hidden="true">
      <span className="task-activity-event__glyph-fallback" />
    </span>
  );
}

const COALESCEABLE_ACTIVITY_TYPES = new Set<TaskActivity["type"]>([
  "status_changed",
  "assignee_changed",
  "priority_changed",
  "due_date_changed",
  "project_changed",
]);

/** Match API coalesce window — collapse rapid property edits in the feed. */
const ACTIVITY_COALESCE_WINDOW_MS = 30_000;

function coalescePropertyActivities(
  activities: TaskActivity[],
): GroupedActivity[] {
  const out: GroupedActivity[] = [];
  for (const activity of activities) {
    const prev = out[out.length - 1];
    const prevAt = prev ? new Date(prev.at).getTime() : NaN;
    const nextAt = new Date(activity.createdAt).getTime();
    const withinWindow =
      Number.isFinite(prevAt) &&
      Number.isFinite(nextAt) &&
      nextAt - prevAt <= ACTIVITY_COALESCE_WINDOW_MS;

    if (
      prev &&
      withinWindow &&
      COALESCEABLE_ACTIVITY_TYPES.has(activity.type) &&
      prev.activity.type === activity.type &&
      prev.activity.actorUserId === activity.actorUserId
    ) {
      const from =
        "from" in prev.activity.data
          ? prev.activity.data.from
          : activity.data.from;
      const fromName =
        "fromName" in prev.activity.data
          ? prev.activity.data.fromName
          : activity.data.fromName;
      const mergedData: Record<string, unknown> = {
        ...activity.data,
        from,
        ...(fromName !== undefined ? { fromName } : {}),
      };
      // Reverted to the original value — drop the group.
      if (mergedData.from === mergedData.to) {
        out.pop();
        continue;
      }
      prev.activity = {
        ...activity,
        data: mergedData,
      };
      prev.at = activity.createdAt;
      continue;
    }

    // Identical repeats (legacy status spam) still collapse.
    if (
      prev &&
      activity.type === "status_changed" &&
      prev.activity.type === "status_changed" &&
      prev.activity.actorUserId === activity.actorUserId &&
      prev.activity.data.from === activity.data.from &&
      prev.activity.data.to === activity.data.to
    ) {
      prev.count += 1;
      prev.at = activity.createdAt;
      continue;
    }

    out.push({ activity, count: 1, at: activity.createdAt });
  }
  return out;
}

type ActivityTimelineItem = {
  id: string;
  at: string;
  activity: TaskActivity;
  count: number;
  children?: TaskActivity[];
};

/** Most recent activity rows shown before "show more" expands the rest. */
const VISIBLE_ACTIVITY_LIMIT = 5;

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

function resolveCommentAvatarSrc(
  comment: Pick<TaskComment, "authorUserId" | "authorEmail">,
  avatarByEmail: ReadonlyMap<string, string | null> | undefined,
  currentUser: { email: string | null; imageUrl: string | null },
): string | null {
  if (comment.authorUserId == null) return null;
  const email = normalizeEmail(comment.authorEmail);
  if (!email) return null;
  const fromContact = avatarByEmail?.get(email);
  if (fromContact) return fromContact;
  if (currentUser.email && email === currentUser.email) {
    return currentUser.imageUrl;
  }
  return null;
}

function isAgentComment(
  comment: Pick<TaskComment, "authorUserId" | "authorName" | "body">,
): boolean {
  if (comment.authorUserId == null) return true;
  if (comment.authorName.trim() === "Agent") return true;
  // Production API may still attribute observer comments to the signed-in user
  // until `activityActor: "agent"` is deployed — recognize hold bodies for
  // display only (avatar / "Agent" label). Do not use this for continue-thread.
  return isAgentHoldCommentBody(comment.body);
}

/** True when replies on this thread should resume the agent (not plain reply). */
function isAgentAuthoredForContinue(
  comment: Pick<TaskComment, "authorUserId" | "authorName">,
): boolean {
  if (comment.authorUserId == null) return true;
  return comment.authorName.trim() === "Agent";
}

function CommentDiscussionIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M1.75 1h8.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 10.25 10H7.061l-2.574 2.573A1.458 1.458 0 0 1 2 11.543V10h-.25A1.75 1.75 0 0 1 0 8.25v-5.5C0 1.784.784 1 1.75 1ZM1.5 2.75v5.5c0 .138.112.25.25.25h1a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h3.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13 2a.25.25 0 0 0-.25-.25h-.5a.75.75 0 0 1 0-1.5h.5c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 14.25 12H14v1.543a1.458 1.458 0 0 1-2.487 1.03L9.22 12.28a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215l2.22 2.22v-2.19a.75.75 0 0 1 .75-.75h1a.25.25 0 0 0 .25-.25Z" />
    </svg>
  );
}

function CommentExpandIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.523 2.71a.75.75 0 0 1 .954 0l4.25 3.5a.75.75 0 0 1-.954 1.157L8 4.26 4.227 7.367a.75.75 0 0 1-.954-1.158l4.25-3.5Zm5.306 7.102a.75.75 0 0 1-.102 1.055l-4.25 3.5a.75.75 0 0 1-.954 0l-4.25-3.5a.75.75 0 0 1 .954-1.158L8 12.817l3.773-3.108a.75.75 0 0 1 1.056.103Z"
      />
    </svg>
  );
}

function CommentCollapseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M3.171 2.812a.75.75 0 0 1 1.056-.103L8 5.817l3.773-3.108a.75.75 0 0 1 .954 1.158l-4.25 3.5a.75.75 0 0 1-.954 0l-4.25-3.5a.75.75 0 0 1-.102-1.055ZM12.829 14.265a.75.75 0 0 1-1.056.102L8 11.26l-3.773 3.107a.75.75 0 1 1-.954-1.158l4.25-3.5a.75.75 0 0 1 .954 0l4.25 3.5a.75.75 0 0 1 .102 1.056Z"
      />
    </svg>
  );
}

function CommentAuthorMeta({
  authorName,
  createdAt,
  avatarSrc,
  resolved = false,
  isAgent = false,
}: {
  authorName: string;
  createdAt: string;
  avatarSrc: string | null;
  resolved?: boolean;
  isAgent?: boolean;
}) {
  return (
    <div className="task-activity-comment__meta">
      <span className="task-activity-comment__avatar" aria-hidden="true">
        {isAgent ? (
          <AgentActivityIcon
            size={16}
            className="task-activity-comment__agent-icon"
          />
        ) : (
          <EntityAvatarIcon src={avatarSrc} size={16} kind="contact" />
        )}
      </span>
      <span
        className={`task-activity-comment__author${isAgent ? " is-agent" : ""}`}
      >
        {isAgent ? "Agent" : authorName}
      </span>
      {resolved ? (
        <span className="task-activity-comment__resolved">Resolved</span>
      ) : null}
      <time className="task-activity-comment__time" dateTime={createdAt}>
        {formatRelativeTime(createdAt)}
      </time>
    </div>
  );
}

function CommentEditForm({
  draft,
  saving,
  inputRef,
  onDraftChange,
  onCancel,
  onSave,
  onResize,
}: {
  draft: string;
  saving: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onResize: (el: HTMLTextAreaElement | null) => void;
}) {
  return (
    <form
      className="task-activity-comment-edit"
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
    >
      <textarea
        ref={inputRef}
        className="task-activity-comment-edit__input"
        value={draft}
        onChange={(event) => {
          onDraftChange(event.target.value);
          onResize(event.target);
        }}
        onBlur={(event) => {
          onResize(event.target);
          const next = event.relatedTarget;
          if (
            next instanceof Node &&
            event.currentTarget.form?.contains(next)
          ) {
            return;
          }
          onSave();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
            return;
          }
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            onSave();
          }
        }}
        rows={1}
        autoFocus
        aria-label="Edit comment"
      />
      <div className="task-activity-comment-edit__footer">
        <button
          type="submit"
          className="task-activity-reply__submit"
          disabled={saving || !draft.trim()}
          aria-label="Save comment"
        >
          {saving ? "…" : "↑"}
        </button>
      </div>
    </form>
  );
}

export type TaskActivityRequestJson = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export type TaskActivityCurrentUser = {
  email: string | null;
  imageUrl: string | null;
};

export type TaskActivityPanelProps = {
  taskId: string;
  /** Bump reload when the parent task changes (e.g. status patch). */
  taskUpdatedAt?: string | number | null;
  /** Bump reload when a new activity was recorded out-of-band (e.g. agent turn). */
  feedRevision?: number;
  working?: boolean;
  /** Contact id → avatar URL for assignee activity rows. */
  assigneeAvatarById?: ReadonlyMap<string, string | null>;
  /** Lowercased contact email → avatar URL for comment authors. */
  avatarByEmail?: ReadonlyMap<string, string | null>;
  requestJson: TaskActivityRequestJson;
  currentUser: TaskActivityCurrentUser;
  /** Optional header controls (e.g. Start working / agent testing). */
  headerActions?: ReactNode;
  /**
   * Console-only: after the user posts a reply on an unresolved agent comment
   * thread, resume the agent with that reply (plus parent context) as the next
   * prompt. Wired to the reply Post control.
   */
  onContinueHoldComment?: (
    commentId: string,
    replyBody: string,
    parentBody: string,
  ) => void | Promise<void>;
};

export function TaskActivityPanel({
  taskId,
  taskUpdatedAt,
  feedRevision = 0,
  working = false,
  assigneeAvatarById,
  avatarByEmail,
  requestJson,
  currentUser,
  headerActions,
  onContinueHoldComment,
}: TaskActivityPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const currentUserAvatar = useMemo(
    () => ({
      email: normalizeEmail(currentUser.email),
      imageUrl: currentUser.imageUrl?.trim() || null,
    }),
    [currentUser.email, currentUser.imageUrl],
  );
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [activities, setActivities] = useState<TaskActivity[]>([]);
  const [draft, setDraft] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [loadingFeed, setLoadingFeed] = useState(true);
  const hasLoadedFeedRef = useRef(false);
  /** Bumps on each load / task switch so stale responses never paint. */
  const feedLoadIdRef = useRef(0);
  const [posting, setPosting] = useState(false);
  const [postingReplyTo, setPostingReplyTo] = useState<string | null>(null);
  const [holdActionCommentId, setHoldActionCommentId] = useState<string | null>(
    null,
  );
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [pendingDeleteComment, setPendingDeleteComment] =
    useState<TaskComment | null>(null);
  const [deletingComment, setDeletingComment] = useState(false);
  const [expandedResolvedIds, setExpandedResolvedIds] = useState<
    Record<string, true>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [activitiesExpanded, setActivitiesExpanded] = useState(false);
  const [expandedAgentGroups, setExpandedAgentGroups] = useState<
    Record<string, true>
  >({});

  const resizeComposer = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    // Clear inline height so CSS min-height (and focus animation) can apply.
    el.style.height = "auto";
    const minHeight = Number.parseFloat(getComputedStyle(el).minHeight) || 0;
    if (el.scrollHeight > minHeight + 1) {
      el.style.height = `${el.scrollHeight}px`;
    } else {
      el.style.height = "";
    }
  }, []);

  useEffect(() => {
    resizeComposer(composerInputRef.current);
  }, [draft, resizeComposer]);

  useEffect(() => {
    if (editingCommentId) {
      resizeComposer(editInputRef.current);
    }
  }, [editDraft, editingCommentId, resizeComposer]);

  useEffect(() => {
    const inputs = document.querySelectorAll<HTMLTextAreaElement>(
      ".task-activity-reply__input",
    );
    inputs.forEach((input) => resizeComposer(input));
  }, [replyDrafts, resizeComposer]);

  const requestJsonRef = useRef(requestJson);
  requestJsonRef.current = requestJson;

  useEffect(() => {
    // Invalidate in-flight loads before paint so a late reject cannot flash
    // "Load failed" into the next task's comments section.
    feedLoadIdRef.current += 1;
    hasLoadedFeedRef.current = false;
    setLoadingFeed(true);
    setError(null);
    setComments([]);
    setActivities([]);
    setActivitiesExpanded(false);
    setExpandedAgentGroups({});
    setReplyDrafts({});
    setDraft("");
    setEditingCommentId(null);
    setEditDraft("");
    setExpandedResolvedIds({});
  }, [taskId]);

  useEffect(() => {
    const controller = new AbortController();
    const loadId = ++feedLoadIdRef.current;
    const isInitialLoad = !hasLoadedFeedRef.current;
    if (isInitialLoad) {
      setLoadingFeed(true);
    }
    setError(null);

    const isStale = () =>
      loadId !== feedLoadIdRef.current || controller.signal.aborted;

    const fetchFeed = () =>
      Promise.all([
        requestJsonRef.current<{ comments: TaskComment[] }>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
          { signal: controller.signal },
        ),
        requestJsonRef.current<{ activities: TaskActivity[] }>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/activities`,
          { signal: controller.signal },
        ),
      ]);

    void (async () => {
      try {
        let commentsResult: { comments: TaskComment[] };
        let activitiesResult: { activities: TaskActivity[] };
        try {
          [commentsResult, activitiesResult] = await fetchFeed();
        } catch (firstErr) {
          // Task switches abort the prior request; WebKit often reports that as
          // "Load failed". Wait out one transient miss instead of painting red.
          if (isStale() || isAbortError(firstErr)) return;
          if (!isTransientNetworkError(firstErr)) throw firstErr;
          await new Promise<void>((resolve, reject) => {
            if (controller.signal.aborted) {
              reject(new DOMException("Aborted", "AbortError"));
              return;
            }
            const timer = setTimeout(resolve, 120);
            controller.signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
              },
              { once: true },
            );
          });
          if (isStale()) return;
          [commentsResult, activitiesResult] = await fetchFeed();
        }
        if (isStale()) return;
        setComments(commentsResult.comments ?? []);
        setActivities(activitiesResult.activities ?? []);
        hasLoadedFeedRef.current = true;
        setError(null);
        setLoadingFeed(false);
      } catch (err) {
        // Superseded / aborted loads must not paint — WebKit may label those
        // "Load failed" instead of AbortError; isStale covers that case.
        if (isStale() || isAbortError(err)) return;
        setError(feedLoadErrorMessage(err));
        if (isInitialLoad) {
          setComments([]);
          setActivities([]);
        }
        setLoadingFeed(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [taskId, taskUpdatedAt, feedRevision]);

  const activityTimeline = useMemo((): ActivityTimelineItem[] => {
    // Coalesce + agent grouping need chronological order; display is newest-first.
    const chronological = [...activities].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    const items = groupConsecutiveAgentWorked(
      coalescePropertyActivities(chronological),
    ).map((entry) => ({
      id: entry.activity.id,
      at: entry.at,
      activity: entry.activity,
      count: entry.count,
      children: entry.children,
    }));
    items.sort((a, b) => b.at.localeCompare(a.at));
    return items;
  }, [activities]);

  const { visibleActivities, hiddenActivityCount } = useMemo(() => {
    const hidden = Math.max(0, activityTimeline.length - VISIBLE_ACTIVITY_LIMIT);
    if (activitiesExpanded || hidden === 0) {
      return {
        visibleActivities: activityTimeline,
        hiddenActivityCount: hidden,
      };
    }
    return {
      visibleActivities: activityTimeline.slice(0, VISIBLE_ACTIVITY_LIMIT),
      hiddenActivityCount: hidden,
    };
  }, [activitiesExpanded, activityTimeline]);

  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
  }, [comments]);

  const rootComments = useMemo(
    () =>
      sortedComments
        .filter((comment) => comment.parentCommentId == null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [sortedComments],
  );

  const repliesByParentId = useMemo(() => {
    const map = new Map<string, TaskComment[]>();
    for (const comment of sortedComments) {
      if (!comment.parentCommentId) continue;
      const list = map.get(comment.parentCommentId) ?? [];
      list.push(comment);
      map.set(comment.parentCommentId, list);
    }
    return map;
  }, [sortedComments]);

  const postComment = useCallback(
    async (
      bodyRaw: string,
      parentCommentId?: string | null,
      options?: { clearDraft?: boolean },
    ): Promise<boolean> => {
      const body = bodyRaw.trim();
      if (!body) return false;
      if (parentCommentId) {
        if (postingReplyTo) return false;
        setPostingReplyTo(parentCommentId);
      } else {
        if (posting) return false;
        setPosting(true);
      }
      setError(null);
      try {
        const created = await requestJson<TaskComment>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              body,
              parentCommentId: parentCommentId ?? null,
            }),
          },
        );
        setComments((current) => [...current, created]);
        if (options?.clearDraft !== false) {
          if (parentCommentId) {
            setReplyDrafts((current) => ({
              ...current,
              [parentCommentId]: "",
            }));
          } else {
            setDraft("");
          }
        }
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not post comment.",
        );
        return false;
      } finally {
        if (parentCommentId) {
          setPostingReplyTo(null);
        } else {
          setPosting(false);
        }
      }
    },
    [posting, postingReplyTo, requestJson, taskId],
  );

  /** Post a reply on an agent thread, then resume the agent with that text. */
  const runAgentReplyContinue = useCallback(
    async (commentId: string) => {
      if (!onContinueHoldComment || holdActionCommentId) return;
      const parent = comments.find((entry) => entry.id === commentId);
      if (!parent) return;
      const replyBody = (replyDrafts[commentId] ?? "").trim();
      if (!replyBody) return;
      setHoldActionCommentId(commentId);
      setError(null);
      try {
        const posted = await postComment(replyBody, commentId);
        if (!posted) return;
        await onContinueHoldComment(commentId, replyBody, parent.body);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Could not continue the agent from this reply.",
        );
      } finally {
        setHoldActionCommentId(null);
      }
    },
    [
      comments,
      holdActionCommentId,
      onContinueHoldComment,
      postComment,
      replyDrafts,
    ],
  );

  /** Unresolved root comments authored by the agent — replies become prompts. */
  const isAgentContinueThread = useCallback(
    (commentId: string): boolean => {
      const parent = comments.find((entry) => entry.id === commentId);
      if (!parent || parent.resolvedAt != null) return false;
      // Require real agent authorship — body-prefix alone must not hijack a
      // user thread that happens to quote a hold message.
      return isAgentAuthoredForContinue(parent);
    },
    [comments],
  );

  const onComposerKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
    parentCommentId?: string | null,
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (parentCommentId) {
        if (
          onContinueHoldComment &&
          isAgentContinueThread(parentCommentId)
        ) {
          void runAgentReplyContinue(parentCommentId);
        } else {
          void postComment(
            replyDrafts[parentCommentId] ?? "",
            parentCommentId,
          );
        }
      } else {
        void postComment(draft);
      }
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void postComment(draft);
  };

  const onReplySubmit = (event: FormEvent, parentCommentId: string) => {
    event.preventDefault();
    if (onContinueHoldComment && isAgentContinueThread(parentCommentId)) {
      void runAgentReplyContinue(parentCommentId);
      return;
    }
    void postComment(replyDrafts[parentCommentId] ?? "", parentCommentId);
  };

  const patchComment = useCallback(
    async (
      commentId: string,
      patch: { body?: string; resolvedAt?: string | null },
    ) => {
      setSavingCommentId(commentId);
      setError(null);
      try {
        const updated = await requestJson<TaskComment>(
          `/api/v1/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(patch),
          },
        );
        setComments((current) =>
          current.map((comment) =>
            comment.id === commentId ? updated : comment,
          ),
        );
        return updated;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not update comment.",
        );
        return null;
      } finally {
        setSavingCommentId(null);
      }
    },
    [requestJson, taskId],
  );

  const startEditComment = (comment: TaskComment) => {
    setEditingCommentId(comment.id);
    setEditDraft(comment.body);
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditDraft("");
  };

  const saveEditComment = async (commentId: string) => {
    if (editingCommentId !== commentId) return;
    const body = editDraft.trim();
    const existing = comments.find((comment) => comment.id === commentId);
    if (!body || (existing && existing.body.trim() === body)) {
      setEditingCommentId(null);
      setEditDraft("");
      return;
    }
    const updated = await patchComment(commentId, { body });
    if (updated) {
      setEditingCommentId(null);
      setEditDraft("");
    }
  };

  const copyCommentBody = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const toggleResolveThread = (comment: TaskComment) => {
    const nextResolved = !comment.resolvedAt;
    void patchComment(comment.id, {
      resolvedAt: nextResolved ? new Date().toISOString() : null,
    });
    if (nextResolved) {
      setExpandedResolvedIds((current) => {
        if (!current[comment.id]) return current;
        const next = { ...current };
        delete next[comment.id];
        return next;
      });
    }
  };

  const expandResolvedThread = (commentId: string) => {
    setExpandedResolvedIds((current) => ({ ...current, [commentId]: true }));
  };

  const collapseResolvedThread = (commentId: string) => {
    setExpandedResolvedIds((current) => {
      if (!current[commentId]) return current;
      const next = { ...current };
      delete next[commentId];
      return next;
    });
  };

  const closeDeleteModal = useCallback(() => {
    if (deletingComment) return;
    setPendingDeleteComment(null);
  }, [deletingComment]);

  const confirmDeleteComment = useCallback(async () => {
    const comment = pendingDeleteComment;
    if (!comment || deletingComment) return;
    setDeletingComment(true);
    setError(null);
    try {
      await requestJson<void>(
        `/api/v1/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(comment.id)}`,
        { method: "DELETE" },
      );
      setComments((current) =>
        current.filter(
          (entry) =>
            entry.id !== comment.id && entry.parentCommentId !== comment.id,
        ),
      );
      if (editingCommentId === comment.id) {
        setEditingCommentId(null);
        setEditDraft("");
      }
      setPendingDeleteComment(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not delete comment.",
      );
    } finally {
      setDeletingComment(false);
    }
  }, [
    deletingComment,
    editingCommentId,
    pendingDeleteComment,
    requestJson,
    taskId,
  ]);

  useEffect(() => {
    if (!pendingDeleteComment) return;
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDeleteModal();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [closeDeleteModal, pendingDeleteComment]);

  useEffect(() => {
    function collectCommentFocusTargets(): HTMLTextAreaElement[] {
      const root = panelRef.current;
      if (!root) return [];
      return Array.from(
        root.querySelectorAll<HTMLTextAreaElement>(
          `textarea[${COMMENT_FOCUS_ATTR}]`,
        ),
      ).filter(isVisibleFocusTarget);
    }

    function focusCommentTarget(el: HTMLTextAreaElement) {
      el.focus();
      el.scrollIntoView({ block: "nearest" });
      resizeComposer(el);
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const eventTarget = event.target;
      if (eventTarget instanceof HTMLElement) {
        if (eventTarget.closest(".xterm")) return;
        if (eventTarget.closest(".cm-editor")) return;
        if (eventTarget.closest("[data-compose-modal]")) return;
        if (eventTarget.closest("[data-searchable-dropdown-panel]")) return;
      }

      const isShiftC =
        event.shiftKey &&
        ((event.key.length === 1 && event.key.toLowerCase() === "c") ||
          event.code === "KeyC");

      if (isShiftC) {
        // Don't steal Shift+C while typing (agent message box, inputs, etc.).
        if (!shouldHandleGlobalShortcut(event)) return;
        const composer = panelRef.current?.querySelector<HTMLTextAreaElement>(
          `textarea[${COMMENT_FOCUS_ATTR}="composer"]`,
        );
        if (!composer || !isVisibleFocusTarget(composer)) return;
        event.preventDefault();
        event.stopPropagation();
        focusCommentTarget(composer);
        return;
      }

      if (event.key === "Escape") {
        const active = document.activeElement;
        if (!(active instanceof HTMLTextAreaElement)) return;
        if (!active.hasAttribute(COMMENT_FOCUS_ATTR)) return;
        if (!panelRef.current?.contains(active)) return;
        event.preventDefault();
        event.stopPropagation();
        active.blur();
        return;
      }

      if (event.key !== "Tab") return;

      const active = document.activeElement;
      if (!(active instanceof HTMLTextAreaElement)) return;
      if (!active.hasAttribute(COMMENT_FOCUS_ATTR)) return;
      if (!panelRef.current?.contains(active)) return;

      const targets = collectCommentFocusTargets();
      if (targets.length === 0) return;
      const index = targets.indexOf(active);
      if (index < 0) return;

      const nextIndex = event.shiftKey
        ? (index - 1 + targets.length) % targets.length
        : (index + 1) % targets.length;
      const next = targets[nextIndex];
      if (!next || next === active) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      focusCommentTarget(next);
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [resizeComposer]);

  return (
    <section
      ref={panelRef}
      className="task-activity"
      aria-label="Activity"
    >
      <header className="task-activity__header">
        <h3 className="task-activity__title">Activity</h3>
        {headerActions ? (
          <div className="task-activity__header-actions">{headerActions}</div>
        ) : null}
      </header>

      <div className="task-activity__feed">
        {loadingFeed ? (
          <p className="task-activity__empty">Loading activity…</p>
        ) : null}

        {!loadingFeed && activityTimeline.length === 0 && !working ? (
          <p className="task-activity__empty">No activity yet.</p>
        ) : null}

        <ul className="task-activity-timeline">
          {working ? (
            <li
              className="task-activity-event task-activity-event--agent_working"
              role="status"
            >
              <span className="task-activity-event__leading">
                <span className="task-activity-event__rail" aria-hidden="true">
                  <span className="task-activity-event__marker">
                    <span className="task-activity-event__loader">
                      <TaskStatusWorkingPulse
                        size={12}
                        compact
                        aria-label="Agent working"
                      />
                    </span>
                  </span>
                </span>
              </span>
              <div className="task-activity-event__text">
                <strong>Agent</strong> is working…
              </div>
            </li>
          ) : null}

          {visibleActivities.map((item) => {
            const children = item.children;
            const hasChildren = children != null && children.length > 1;
            const isGroupExpanded = hasChildren && expandedAgentGroups[item.id];
            const childActivities = hasChildren
              ? [...children].sort((a, b) =>
                  b.createdAt.localeCompare(a.createdAt),
                )
              : [];

            return (
              <li
                key={`activity-${item.id}`}
                className={[
                  "task-activity-event",
                  `task-activity-event--${item.activity.type}`,
                  hasChildren ? "task-activity-event--group" : "",
                  isGroupExpanded ? "is-expanded" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="task-activity-event__leading">
                  <span
                    className="task-activity-event__rail"
                    aria-hidden="true"
                  >
                    <ActivityLeadingIcon
                      activity={item.activity}
                      assigneeAvatarById={assigneeAvatarById}
                    />
                  </span>
                  {hasChildren ? (
                    <button
                      type="button"
                      className="task-activity-event__expand"
                      aria-expanded={Boolean(isGroupExpanded)}
                      aria-label={
                        isGroupExpanded
                          ? "Hide individual turns"
                          : `Show ${children.length} individual turns`
                      }
                      onClick={() =>
                        setExpandedAgentGroups((current) => {
                          if (current[item.id]) {
                            const next = { ...current };
                            delete next[item.id];
                            return next;
                          }
                          return { ...current, [item.id]: true };
                        })
                      }
                    >
                      <ChevronRightIcon size={12} />
                    </button>
                  ) : null}
                </span>
                <div className="task-activity-event__text">
                  {activityMessage(item.activity)}
                  {hasChildren ? (
                    <>
                      {" "}
                      · <strong>{children.length}</strong> turns
                    </>
                  ) : null}
                  {item.count > 1 ? (
                    <span className="task-activity-event__count">
                      x{item.count}
                    </span>
                  ) : null}
                </div>
                <time className="task-activity-event__time" dateTime={item.at}>
                  {formatRelativeTime(item.at)}
                </time>

                {isGroupExpanded ? (
                  <ul className="task-activity-event__children">
                    {childActivities.map((child) => (
                      <li
                        key={`activity-child-${child.id}`}
                        className="task-activity-event__child"
                      >
                        <div className="task-activity-event__child-text">
                          {activityMessage(child)}
                        </div>
                        <time
                          className="task-activity-event__time"
                          dateTime={child.createdAt}
                        >
                          {formatRelativeTime(child.createdAt)}
                        </time>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}

          {!loadingFeed && hiddenActivityCount > 0 ? (
            <li className="task-activity-more">
              <button
                type="button"
                className="task-activity-more__btn"
                onClick={() => setActivitiesExpanded((open) => !open)}
              >
                {activitiesExpanded
                  ? "Hide older events"
                  : `Show ${hiddenActivityCount} older ${
                      hiddenActivityCount === 1 ? "event" : "events"
                    }`}
              </button>
            </li>
          ) : null}
        </ul>
      </div>

      <div className="task-activity-comments">
        <section
          className="entity-properties-section task-activity-comment-card task-activity-comment-card--composer"
          aria-label="New comment"
        >
          <form className="task-activity-composer" onSubmit={onSubmit}>
            <textarea
              ref={composerInputRef}
              className="task-activity-composer__input"
              data-task-comment-focus="composer"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                resizeComposer(event.target);
              }}
              onFocus={(event) => resizeComposer(event.target)}
              onBlur={(event) => resizeComposer(event.target)}
              onKeyDown={(event) => onComposerKeyDown(event)}
              placeholder="Leave a comment…"
              rows={2}
              aria-label="Leave a comment"
            />
            <button
              type="submit"
              className="task-activity-reply__submit"
              disabled={posting || !draft.trim()}
              aria-label="Post comment"
            >
              {posting ? "…" : "↑"}
            </button>
          </form>
        </section>

        {rootComments.map((comment) => {
          const replies = repliesByParentId.get(comment.id) ?? [];
          const replyDraft = replyDrafts[comment.id] ?? "";
          const replyPending = postingReplyTo === comment.id;
          const isEditing = editingCommentId === comment.id;
          const isSaving = savingCommentId === comment.id;
          const isResolved = comment.resolvedAt != null;
          const isResolvedCollapsed =
            isResolved && !expandedResolvedIds[comment.id] && !isEditing;
          const threadCount = 1 + replies.length;
          const isEditingThread =
            editingCommentId != null &&
            (editingCommentId === comment.id ||
              replies.some((reply) => reply.id === editingCommentId));
          const isAgentThread =
            !isResolved && isAgentAuthoredForContinue(comment);
          const agentReplyContinues =
            isAgentThread && onContinueHoldComment != null;
          const holdBusy = holdActionCommentId === comment.id;

          const buildCommentMenu = (
            target: TaskComment,
            options: { includeResolve: boolean },
          ) => (
            <EntityActionsMenu
              ariaLabel="Comment actions"
              triggerAriaLabel="Comment actions"
              triggerClassName="task-activity-comment-card__menu-trigger"
              disabled={savingCommentId === target.id}
              items={[
                {
                  id: "edit",
                  label: "Edit",
                  onSelect: () => startEditComment(target),
                  disabled: editingCommentId === target.id,
                },
                ...(options.includeResolve
                  ? [
                      {
                        id: "resolve",
                        label: target.resolvedAt
                          ? "Unresolve thread"
                          : "Resolve thread",
                        onSelect: () => toggleResolveThread(target),
                      },
                    ]
                  : []),
                {
                  id: "copy",
                  label: "Copy content",
                  onSelect: () => {
                    void copyCommentBody(target.body);
                  },
                },
                {
                  id: "delete",
                  label: "Delete",
                  danger: true,
                  onSelect: () => setPendingDeleteComment(target),
                },
              ]}
            />
          );

          const commentActionsMenu = buildCommentMenu(comment, {
            includeResolve: true,
          });

          const renderCommentBody = (target: TaskComment) =>
            editingCommentId === target.id ? (
              <CommentEditForm
                draft={editDraft}
                saving={savingCommentId === target.id}
                inputRef={editInputRef}
                onDraftChange={setEditDraft}
                onCancel={cancelEditComment}
                onSave={() => {
                  void saveEditComment(target.id);
                }}
                onResize={resizeComposer}
              />
            ) : (
              <div className="task-activity-comment__body">
                <DocumentMarkdownPreview body={target.body} />
              </div>
            );

          if (isResolvedCollapsed) {
            return (
              <section
                key={comment.id}
                className="entity-properties-section task-activity-comment-card task-activity-comment-card--resolved-summary is-resolved"
                aria-label={`Resolved thread by ${comment.authorName}`}
              >
                <button
                  type="button"
                  className="task-activity-comment-resolved-summary"
                  onClick={() => expandResolvedThread(comment.id)}
                >
                  <span className="task-activity-comment-resolved-summary__main">
                    <span
                      className="task-activity-comment-resolved-summary__icon"
                      aria-hidden="true"
                    >
                      <CommentDiscussionIcon />
                    </span>
                    <span className="task-activity-comment-resolved-summary__text">
                      {threadCount} resolved{" "}
                      {threadCount === 1 ? "comment" : "comments"} from{" "}
                      <strong>{comment.authorName}</strong>
                    </span>
                    {comment.resolvedAt ? (
                      <time
                        className="task-activity-comment-resolved-summary__time"
                        dateTime={comment.resolvedAt}
                      >
                        {formatRelativeTime(comment.resolvedAt)}
                      </time>
                    ) : null}
                  </span>
                  <span
                    className="task-activity-comment-card__toggle"
                    aria-hidden="true"
                  >
                    <CommentExpandIcon />
                  </span>
                </button>
              </section>
            );
          }

          return (
            <section
              key={comment.id}
              className={`entity-properties-section task-activity-comment-card${
                isResolved ? " is-resolved is-resolved-expanded" : ""
              }`}
              aria-label={`Comment by ${comment.authorName}`}
            >
              {isResolved ? (
                <div className="task-activity-comment-card__toolbar">
                  <div className="task-activity-comment-card__actions">
                    {commentActionsMenu}
                  </div>
                  <button
                    type="button"
                    className="task-activity-comment-card__toggle task-activity-comment-card__toggle--button"
                    aria-label="Hide thread"
                    onClick={() => collapseResolvedThread(comment.id)}
                  >
                    <CommentCollapseIcon />
                  </button>
                </div>
              ) : (
                <div className="task-activity-comment-card__actions">
                  {commentActionsMenu}
                </div>
              )}

              <div className="entity-properties-section__body task-activity-comment-stack">
                <div className="task-activity-comment">
                  <CommentAuthorMeta
                    authorName={comment.authorName}
                    createdAt={comment.createdAt}
                    avatarSrc={resolveCommentAvatarSrc(
                      comment,
                      avatarByEmail,
                      currentUserAvatar,
                    )}
                    resolved={isResolved}
                    isAgent={isAgentComment(comment)}
                  />
                  {renderCommentBody(comment)}
                </div>

                {replies.map((reply) => (
                  <div
                    key={reply.id}
                    className="task-activity-comment task-activity-comment--reply"
                  >
                    <div className="task-activity-comment__header">
                      <CommentAuthorMeta
                        authorName={reply.authorName}
                        createdAt={reply.createdAt}
                        avatarSrc={resolveCommentAvatarSrc(
                          reply,
                          avatarByEmail,
                          currentUserAvatar,
                        )}
                        isAgent={isAgentComment(reply)}
                      />
                      <div className="task-activity-comment__actions">
                        {buildCommentMenu(reply, { includeResolve: false })}
                      </div>
                    </div>
                    {renderCommentBody(reply)}
                  </div>
                ))}
              </div>

              {!isEditingThread ? (
                <form
                  className="task-activity-reply"
                  onSubmit={(event) => onReplySubmit(event, comment.id)}
                >
                  <textarea
                    className="task-activity-reply__input"
                    data-task-comment-focus={`reply:${comment.id}`}
                    value={replyDraft}
                    onChange={(event) => {
                      setReplyDrafts((current) => ({
                        ...current,
                        [comment.id]: event.target.value,
                      }));
                      resizeComposer(event.target);
                    }}
                    onFocus={(event) => resizeComposer(event.target)}
                    onBlur={(event) => resizeComposer(event.target)}
                    onKeyDown={(event) =>
                      onComposerKeyDown(event, comment.id)
                    }
                    placeholder={
                      agentReplyContinues
                        ? "Answer the agent…"
                        : "Leave a reply…"
                    }
                    rows={1}
                    aria-label={`Reply to ${comment.authorName}`}
                  />
                  <button
                    type="submit"
                    className="task-activity-reply__submit"
                    disabled={
                      replyPending || holdBusy || !replyDraft.trim()
                    }
                    aria-label={
                      agentReplyContinues
                        ? "Post reply and continue agent"
                        : "Post reply"
                    }
                    title={
                      agentReplyContinues
                        ? "Post reply and continue the agent"
                        : undefined
                    }
                  >
                    {replyPending || holdBusy ? "…" : "↑"}
                  </button>
                </form>
              ) : null}
            </section>
          );
        })}
      </div>

      {error && !loadingFeed ? (
        <p className="task-activity__error" role="alert">
          {error}
        </p>
      ) : null}

      {pendingDeleteComment
        ? createPortal(
            <div
              className="entity-delete-modal-root"
              data-blocking-modal=""
              data-entity-delete-modal=""
            >
              <button
                type="button"
                aria-label="Cancel delete"
                className="entity-delete-modal-backdrop"
                onClick={closeDeleteModal}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="task-comment-delete-title"
                className="entity-delete-modal"
              >
                <h2
                  id="task-comment-delete-title"
                  className="entity-delete-modal-title"
                >
                  Delete comment?
                </h2>
                <p className="entity-delete-modal-body">
                  {(repliesByParentId.get(pendingDeleteComment.id)?.length ??
                    0) > 0
                    ? "This will also delete all replies in this thread. This action cannot be undone."
                    : "Are you sure you want to delete this comment? This action cannot be undone."}
                </p>
                <div className="entity-delete-modal-actions">
                  <button
                    type="button"
                    disabled={deletingComment}
                    onClick={closeDeleteModal}
                    className="entity-delete-modal-cancel"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deletingComment}
                    onClick={() => {
                      void confirmDeleteComment();
                    }}
                    className="entity-delete-modal-confirm"
                  >
                    {deletingComment ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
