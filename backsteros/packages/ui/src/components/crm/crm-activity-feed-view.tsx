"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ProjectOcticon } from "../projects/project-octicon.js";
import {
  CalendarNavIcon,
  EmailNavIcon,
  LettersNavIcon,
  TasksNavIcon,
} from "../shell/sidebar-nav-icons.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type CrmActivityTaskRelation = "assigned" | "related";

export type CrmActivityFeedItem = {
  id: string;
  kind: "note" | "meeting" | "task" | "letter" | "deployment";
  occurredAt: string;
  body?: string | null;
  bodyPreview?: string | null;
  meetingId?: string | null;
  meetingTitle?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  /**
   * For `kind: "task"` on a contact timeline: whether the contact was the
   * assignee or only related / structurally linked.
   */
  taskRelation?: CrmActivityTaskRelation | null;
  letterId?: string | null;
  letterTitle?: string | null;
  /** Deployment timeline fields (`kind: "deployment"`). */
  deploymentStatus?: "success" | "failed" | "running" | null;
  deploymentSite?: string | null;
  deploymentCommit?: string | null;
  deploymentSummary?: string | null;
  deploymentMeta?: string | null;
};

export type CrmActivityCreateKind =
  | "task"
  | "note"
  | "email"
  | "meeting"
  | "letter";

export type CrmActivityFeedViewProps = {
  items: CrmActivityFeedItem[];
  loading?: boolean;
  error?: string | null;
  nextCursor?: string | null;
  onLoadMore?: () => void | Promise<void>;
  onSubmitNote?: (body: string) => void | Promise<void>;
  onCreateTask?: () => void;
  onCreateEmail?: () => void;
  onCreateMeeting?: () => void;
  onCreateLetter?: () => void;
  onOpenMeeting?: (meetingId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenLetter?: (letterId: string) => void;
};

const PANEL_GAP = 8;
const VIEWPORT_PADDING = 8;
const PANEL_MIN_WIDTH = 168;

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const deltaSec = Math.round((Date.now() - then) / 1000);
  if (deltaSec < 45) return "just now";
  if (deltaSec < 3600) return `${Math.max(1, Math.round(deltaSec / 60))}m ago`;
  if (deltaSec < 86_400) return `${Math.round(deltaSec / 3600)}h ago`;
  if (deltaSec < 86_400 * 2) return "Yesterday";
  if (deltaSec < 86_400 * 7) return `${Math.round(deltaSec / 86_400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(iso).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  });
}

function ActivityTypeIcon({
  kind,
  deploymentStatus,
}: {
  kind: CrmActivityFeedItem["kind"];
  deploymentStatus?: CrmActivityFeedItem["deploymentStatus"];
}) {
  if (kind === "meeting") {
    return <CalendarNavIcon className="crm-activity-event__glyph" />;
  }
  if (kind === "task") {
    return <TasksNavIcon className="crm-activity-event__glyph" />;
  }
  if (kind === "letter") {
    return <LettersNavIcon className="crm-activity-event__glyph" />;
  }
  if (kind === "deployment") {
    const label =
      deploymentStatus === "failed"
        ? "×"
        : deploymentStatus === "running"
          ? "↑"
          : "✓";
    return (
      <span className="crm-activity-event__glyph crm-activity-event__glyph--deployment">
        {label}
      </span>
    );
  }
  return <ProjectOcticon icon="note" size={14} className="crm-activity-event__glyph" />;
}

function ActivityDetail({
  item,
  onOpenMeeting,
  onOpenTask,
  onOpenLetter,
}: {
  item: CrmActivityFeedItem;
  onOpenMeeting?: (meetingId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenLetter?: (letterId: string) => void;
}): ReactNode {
  if (item.kind === "meeting") {
    const title = item.meetingTitle?.trim() || "Untitled meeting";
    if (item.meetingId && onOpenMeeting) {
      return (
        <>
          Meeting{" "}
          <button
            type="button"
            className="crm-activity-event__link"
            onClick={() => onOpenMeeting(item.meetingId!)}
          >
            <strong>{title}</strong>
          </button>
        </>
      );
    }
    return (
      <>
        Meeting <strong>{title}</strong>
      </>
    );
  }

  if (item.kind === "task") {
    const title = item.taskTitle?.trim() || "Untitled task";
    const relationLabel =
      item.taskRelation === "assigned"
        ? "Completed assigned task"
        : item.taskRelation === "related"
          ? "Completed related task"
          : "Completed task";
    if (item.taskId && onOpenTask) {
      return (
        <>
          {relationLabel}{" "}
          <button
            type="button"
            className="crm-activity-event__link"
            onClick={() => onOpenTask(item.taskId!)}
          >
            <strong>{title}</strong>
          </button>
        </>
      );
    }
    return (
      <>
        {relationLabel} <strong>{title}</strong>
      </>
    );
  }

  if (item.kind === "letter") {
    const title = item.letterTitle?.trim() || "Untitled letter";
    if (item.letterId && onOpenLetter) {
      return (
        <>
          Letter{" "}
          <button
            type="button"
            className="crm-activity-event__link"
            onClick={() => onOpenLetter(item.letterId!)}
          >
            <strong>{title}</strong>
          </button>{" "}
          received
        </>
      );
    }
    return (
      <>
        Letter <strong>{title}</strong> received
      </>
    );
  }

  if (item.kind === "deployment") {
    const site = item.deploymentSite?.trim() || "Deploy";
    const summary = item.deploymentSummary?.trim();
    const commit = item.deploymentCommit?.trim();
    const meta = item.deploymentMeta?.trim();
    return (
      <span className="crm-activity-event__deployment">
        <strong>{site}</strong>
        {commit ? (
          <>
            {" "}
            <span className="crm-activity-event__deployment-commit">
              {commit}
            </span>
          </>
        ) : null}
        {summary ? (
          <>
            {" — "}
            <span className="crm-activity-event__note">{summary}</span>
          </>
        ) : null}
        {meta ? (
          <span className="crm-activity-event__deployment-meta"> · {meta}</span>
        ) : null}
      </span>
    );
  }

  const body = item.body?.trim() || item.bodyPreview?.trim() || "";
  if (!body) return <>Note added</>;
  return <span className="crm-activity-event__note">{body}</span>;
}

type CreateMenuItem = {
  id: CrmActivityCreateKind;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
};

/**
 * Contact/org activity timeline — notes, meetings, completed tasks, letters.
 * Layout mirrors task activity (rail + type icon) with relative time above detail.
 */
export function CrmActivityFeedView({
  items,
  loading = false,
  error = null,
  nextCursor = null,
  onLoadMore,
  onSubmitNote,
  onCreateTask,
  onCreateEmail,
  onCreateMeeting,
  onCreateLetter,
  onOpenMeeting,
  onOpenTask,
  onOpenLetter,
}: CrmActivityFeedViewProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const createItems = useMemo((): CreateMenuItem[] => {
    const next: CreateMenuItem[] = [];
    if (onCreateTask) {
      next.push({
        id: "task",
        label: "Task",
        icon: <TasksNavIcon />,
        onSelect: onCreateTask,
      });
    }
    if (onSubmitNote) {
      next.push({
        id: "note",
        label: "Note",
        icon: <ProjectOcticon icon="note" size={16} />,
        onSelect: () => setComposing(true),
      });
    }
    if (onCreateEmail) {
      next.push({
        id: "email",
        label: "E-mail",
        icon: <EmailNavIcon size={16} />,
        onSelect: onCreateEmail,
      });
    }
    if (onCreateMeeting) {
      next.push({
        id: "meeting",
        label: "Meeting",
        icon: <CalendarNavIcon />,
        onSelect: onCreateMeeting,
      });
    }
    if (onCreateLetter) {
      next.push({
        id: "letter",
        label: "Letter",
        icon: <LettersNavIcon />,
        onSelect: onCreateLetter,
      });
    }
    return next;
  }, [
    onCreateEmail,
    onCreateLetter,
    onCreateMeeting,
    onCreateTask,
    onSubmitNote,
  ]);

  const canCreate = createItems.length > 0;

  useEffect(() => {
    if (!composing) return;
    inputRef.current?.focus();
  }, [composing]);

  const updatePanelPosition = useCallback(() => {
    const trigger = plusRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 48;
    const spaceBelow =
      window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_PADDING;
    const openUpward =
      spaceBelow < panelHeight && rect.top > panelHeight + PANEL_GAP;
    const top = openUpward
      ? Math.max(VIEWPORT_PADDING, rect.top - panelHeight - PANEL_GAP)
      : rect.bottom + PANEL_GAP;
    const preferredLeft = rect.left;
    const maxLeft = window.innerWidth - PANEL_MIN_WIDTH - VIEWPORT_PADDING;
    const left = Math.max(
      VIEWPORT_PADDING,
      Math.min(preferredLeft, maxLeft),
    );

    setPanelStyle({
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      right: "auto",
      width: "max-content",
      minWidth: `${PANEL_MIN_WIDTH}px`,
      maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
      visibility: "visible",
      zIndex: 1000,
    });
  }, []);

  useLayoutEffect(() => {
    if (!menuOpen) return;
    updatePanelPosition();
    const frame = window.requestAnimationFrame(() => {
      updatePanelPosition();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuOpen, updatePanelPosition]);

  useEffect(() => {
    if (!menuOpen) return;

    function handleReposition() {
      updatePanelPosition();
    }

    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [menuOpen, updatePanelPosition]);

  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!(event.target instanceof Node)) return;
      if (plusRef.current?.contains(event.target)) return;
      if (panelRef.current?.contains(event.target)) return;
      setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  function closeComposer() {
    setComposing(false);
    setDraft("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !onSubmitNote) return;
    setSubmitting(true);
    try {
      await onSubmitNote(body);
      closeComposer();
    } finally {
      setSubmitting(false);
    }
  }

  const menuPanel =
    menuOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            id={menuId}
            className="entity-header-action-menu crm-activity-create-menu"
            style={panelStyle}
            role="menu"
            aria-label="Add to activity"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="app-side-panel-profile-menu-section">
              {createItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    item.onSelect();
                  }}
                  className="app-side-panel-item app-side-panel-profile-menu-item"
                >
                  <span
                    className="entity-header-action-menu-item-icon"
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className="app-side-panel-item-label">{item.label}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="task-activity crm-activity">
      <div className="task-activity__feed">
        {error ? (
          <p className="task-activity__error" role="alert">
            {error}
          </p>
        ) : null}
        {loading && items.length === 0 && !canCreate ? (
          <p className="task-activity__empty">Loading activity…</p>
        ) : !loading && items.length === 0 && !canCreate ? (
          <p className="task-activity__empty">No activity yet.</p>
        ) : (
          <ul className="task-activity-timeline crm-activity-timeline">
            {canCreate ? (
              <li
                className={[
                  "task-activity-event",
                  "crm-activity-event",
                  "crm-activity-event--add",
                  composing ? "is-composing" : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className="task-activity-event__leading">
                  <span className="task-activity-event__rail">
                    {composing ? (
                      <span
                        className="task-activity-event__marker crm-activity-event__marker crm-activity-event__marker--add"
                        aria-hidden="true"
                      >
                        <SidePanelPlusIcon />
                      </span>
                    ) : (
                      <button
                        ref={plusRef}
                        type="button"
                        className="task-activity-event__marker crm-activity-event__marker crm-activity-event__marker--add"
                        aria-label="Add to activity"
                        title="Add to activity"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-controls={menuOpen ? menuId : undefined}
                        onClick={() => setMenuOpen((open) => !open)}
                      >
                        <SidePanelPlusIcon />
                      </button>
                    )}
                  </span>
                </span>
                <div className="crm-activity-event__body">
                  {composing ? (
                    <form
                      className="task-activity-composer crm-activity__composer"
                      onSubmit={(e) => void handleSubmit(e)}
                    >
                      <textarea
                        ref={inputRef}
                        className="task-activity-composer__input"
                        value={draft}
                        placeholder="Add a note…"
                        rows={3}
                        maxLength={8192}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            closeComposer();
                          }
                        }}
                      />
                      <button
                        type="submit"
                        className="task-activity-reply__submit"
                        disabled={submitting || !draft.trim()}
                      >
                        Post
                      </button>
                    </form>
                  ) : loading && items.length === 0 ? (
                    <p className="task-activity__empty">Loading activity…</p>
                  ) : items.length === 0 ? (
                    <p className="task-activity__empty">No activity yet.</p>
                  ) : null}
                </div>
              </li>
            ) : null}
            {items.map((item) => {
              const eventKindClass =
                item.kind === "task" && item.taskRelation
                  ? `crm-activity-event--task-${item.taskRelation}`
                  : item.kind === "deployment" && item.deploymentStatus
                    ? `crm-activity-event--deployment-${item.deploymentStatus}`
                    : `crm-activity-event--${item.kind}`;
              const markerKindClass =
                item.kind === "task" && item.taskRelation
                  ? `crm-activity-event__marker--task-${item.taskRelation}`
                  : item.kind === "deployment" && item.deploymentStatus
                    ? `crm-activity-event__marker--deployment-${item.deploymentStatus}`
                    : `crm-activity-event__marker--${item.kind}`;
              return (
              <li
                key={item.id}
                className={[
                  "task-activity-event",
                  "crm-activity-event",
                  eventKindClass,
                ].join(" ")}
              >
                <span className="task-activity-event__leading">
                  <span
                    className="task-activity-event__rail"
                    aria-hidden="true"
                  >
                    <span
                      className={[
                        "task-activity-event__marker",
                        "crm-activity-event__marker",
                        markerKindClass,
                      ].join(" ")}
                    >
                      <ActivityTypeIcon
                        kind={item.kind}
                        deploymentStatus={item.deploymentStatus}
                      />
                    </span>
                  </span>
                </span>
                <div className="crm-activity-event__body">
                  <time
                    className="crm-activity-event__when"
                    dateTime={item.occurredAt}
                    title={new Date(item.occurredAt).toLocaleString()}
                  >
                    {formatRelativeTime(item.occurredAt)}
                  </time>
                  <div className="crm-activity-event__detail">
                    <ActivityDetail
                      item={item}
                      onOpenMeeting={onOpenMeeting}
                      onOpenTask={onOpenTask}
                      onOpenLetter={onOpenLetter}
                    />
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
        {nextCursor && onLoadMore ? (
          <div className="task-activity-more">
            <button
              type="button"
              className="task-activity-more__btn"
              onClick={() => void onLoadMore()}
            >
              Load more
            </button>
          </div>
        ) : null}
      </div>
      {menuPanel}
    </div>
  );
}
