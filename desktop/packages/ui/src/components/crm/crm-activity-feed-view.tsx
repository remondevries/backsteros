"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { ProjectOcticon } from "../projects/project-octicon.js";
import {
  CalendarNavIcon,
  LettersNavIcon,
  TasksNavIcon,
} from "../shell/sidebar-nav-icons.js";
import { SidePanelPlusIcon } from "../shell/side-panel-plus-icon.js";

export type CrmActivityFeedItem = {
  id: string;
  kind: "note" | "meeting" | "task" | "letter";
  occurredAt: string;
  body?: string | null;
  bodyPreview?: string | null;
  meetingId?: string | null;
  meetingTitle?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  letterId?: string | null;
  letterTitle?: string | null;
};

export type CrmActivityFeedViewProps = {
  items: CrmActivityFeedItem[];
  loading?: boolean;
  error?: string | null;
  nextCursor?: string | null;
  onLoadMore?: () => void | Promise<void>;
  onSubmitNote?: (body: string) => void | Promise<void>;
  onOpenMeeting?: (meetingId: string) => void;
  onOpenTask?: (taskId: string) => void;
  onOpenLetter?: (letterId: string) => void;
};

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

function ActivityTypeIcon({ kind }: { kind: CrmActivityFeedItem["kind"] }) {
  if (kind === "meeting") {
    return <CalendarNavIcon className="crm-activity-event__glyph" />;
  }
  if (kind === "task") {
    return <TasksNavIcon className="crm-activity-event__glyph" />;
  }
  if (kind === "letter") {
    return <LettersNavIcon className="crm-activity-event__glyph" />;
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
    if (item.taskId && onOpenTask) {
      return (
        <>
          Completed task{" "}
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
        Completed task <strong>{title}</strong>
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

  const body = item.body?.trim() || item.bodyPreview?.trim() || "";
  if (!body) return <>Note added</>;
  return <span className="crm-activity-event__note">{body}</span>;
}

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
  onOpenMeeting,
  onOpenTask,
  onOpenLetter,
}: CrmActivityFeedViewProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!composing) return;
    inputRef.current?.focus();
  }, [composing]);

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

  return (
    <div className="task-activity crm-activity">
      <div className="task-activity__feed">
        {error ? (
          <p className="task-activity__error" role="alert">
            {error}
          </p>
        ) : null}
        {loading && items.length === 0 && !onSubmitNote ? (
          <p className="task-activity__empty">Loading activity…</p>
        ) : !loading && items.length === 0 && !onSubmitNote ? (
          <p className="task-activity__empty">No activity yet.</p>
        ) : (
          <ul className="task-activity-timeline crm-activity-timeline">
            {onSubmitNote ? (
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
                        type="button"
                        className="task-activity-event__marker crm-activity-event__marker crm-activity-event__marker--add"
                        aria-label="Add note"
                        title="Add note"
                        onClick={() => setComposing(true)}
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
            {items.map((item) => (
              <li
                key={item.id}
                className={[
                  "task-activity-event",
                  "crm-activity-event",
                  `crm-activity-event--${item.kind}`,
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
                        `crm-activity-event__marker--${item.kind}`,
                      ].join(" ")}
                    >
                      <ActivityTypeIcon kind={item.kind} />
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
            ))}
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
    </div>
  );
}
