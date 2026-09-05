import { MoreHorizontalIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { formatBacksterosActivityRelativeTime } from "./activityTime";
import { BacksterosEntityAvatarIcon } from "./EntityAvatarIcon";
import type { BacksterosTaskComment } from "./types";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "~/components/ui/menu";
import { toastManager } from "~/components/ui/toast";
import "./backsterosComments.css";

function CommentSubmitButton(props: {
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly label: string;
}) {
  return (
    <button
      type="submit"
      className="bos-task-comment-submit"
      disabled={props.disabled || props.busy}
      aria-label={props.label}
    >
      {props.busy ? "…" : "↑"}
    </button>
  );
}

function CommentComposer(props: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly busy?: boolean;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly variant: "composer" | "reply";
}) {
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      props.onSubmit();
    }
  };

  return (
    <form
      className={
        props.variant === "composer"
          ? "bos-task-comment-composer"
          : "bos-task-comment-reply"
      }
      onSubmit={handleSubmit}
    >
      <textarea
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={props.placeholder}
        aria-label={props.ariaLabel}
        rows={props.variant === "composer" ? 2 : 1}
        className={
          props.variant === "composer"
            ? "bos-task-comment-composer__input"
            : "bos-task-comment-reply__input"
        }
      />
      <CommentSubmitButton
        disabled={!props.value.trim()}
        busy={props.busy}
        label={props.variant === "composer" ? "Post comment" : "Post reply"}
      />
    </form>
  );
}

function CommentAuthorMeta(props: {
  readonly authorName: string;
  readonly createdAt: string;
  readonly avatarSrc: string | null;
  readonly resolved?: boolean;
}) {
  return (
    <div className="bos-task-comment__meta">
      <span className="bos-task-comment__avatar" aria-hidden="true">
        <BacksterosEntityAvatarIcon
          src={props.avatarSrc}
          size={16}
          kind="contact"
        />
      </span>
      <span className="bos-task-comment__author">{props.authorName}</span>
      {props.resolved ? (
        <span className="bos-task-comment__resolved">Resolved</span>
      ) : null}
      <time className="bos-task-comment__time" dateTime={props.createdAt}>
        {formatBacksterosActivityRelativeTime(props.createdAt)}
      </time>
    </div>
  );
}

function CommentActionsMenu(props: {
  readonly onEdit: () => void;
  readonly onResolve?: () => void;
  readonly resolveLabel?: string;
  readonly onDelete: () => void;
  readonly disabled?: boolean;
}) {
  return (
    <Menu>
      <MenuTrigger
        disabled={props.disabled}
        className="bos-task-comment-card__menu-trigger"
        aria-label="Comment actions"
      >
        <MoreHorizontalIcon className="size-3.5" />
      </MenuTrigger>
      <MenuPopup align="end" className="bos-task-property-menu">
        <MenuItem closeOnClick className="bos-task-property-menu__option" onClick={props.onEdit}>
          <span className="bos-task-property-menu__option-label">Edit</span>
        </MenuItem>
        {props.onResolve ? (
          <MenuItem
            closeOnClick
            className="bos-task-property-menu__option"
            onClick={props.onResolve}
          >
            <span className="bos-task-property-menu__option-label">
              {props.resolveLabel ?? "Resolve thread"}
            </span>
          </MenuItem>
        ) : null}
        <MenuSeparator className="bos-task-property-menu__separator" />
        <MenuItem
          closeOnClick
          className="bos-task-property-menu__option"
          onClick={props.onDelete}
        >
          <span className="bos-task-property-menu__option-label">Delete</span>
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}

function resolveCommentAvatarSrc(
  comment: BacksterosTaskComment,
  avatarSrcByContactId: Readonly<Record<string, string>>,
  avatarSrcByEmail: Readonly<Record<string, string>>,
): string | null {
  if (comment.authorContactId) {
    return avatarSrcByContactId[comment.authorContactId] ?? null;
  }
  const email = comment.authorEmail?.trim().toLowerCase();
  if (email) return avatarSrcByEmail[email] ?? null;
  return null;
}

/**
 * Comments feed matching BacksterOS desktop: top composer, threaded cards,
 * nested replies, and per-thread reply fields.
 */
export function BacksterosTaskCommentsSection(props: {
  readonly taskId: string;
  readonly comments: readonly BacksterosTaskComment[];
  readonly avatarSrcByContactId?: Readonly<Record<string, string>>;
  readonly contacts?: readonly {
    readonly id: string;
    readonly email: string | null;
    readonly avatarStorageKey?: string | null;
  }[];
  readonly onAdd: (body: string, parentCommentId?: string | null) => Promise<void>;
  readonly onEdit: (
    commentId: string,
    patch: { readonly body?: string; readonly resolvedAt?: string | null },
  ) => Promise<void>;
  readonly onDelete: (commentId: string) => Promise<void>;
}) {
  const avatarSrcByContactId = props.avatarSrcByContactId ?? {};
  const avatarSrcByEmail = useMemo(() => {
    const map: Record<string, string> = {};
    for (const contact of props.contacts ?? []) {
      const email = contact.email?.trim().toLowerCase();
      if (!email) continue;
      const src = avatarSrcByContactId[contact.id];
      if (src) map[email] = src;
    }
    return map;
  }, [avatarSrcByContactId, props.contacts]);

  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [postingReplyTo, setPostingReplyTo] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingCommentId, setSavingCommentId] = useState<string | null>(null);
  const [expandedResolvedIds, setExpandedResolvedIds] = useState<Record<string, true>>(
    {},
  );

  const rootComments = useMemo(() => {
    return [...props.comments]
      .filter((comment) => comment.parentCommentId == null && comment.deletedAt == null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [props.comments]);

  const repliesByParentId = useMemo(() => {
    const map = new Map<string, BacksterosTaskComment[]>();
    for (const comment of props.comments) {
      if (!comment.parentCommentId || comment.deletedAt != null) continue;
      const list = map.get(comment.parentCommentId) ?? [];
      list.push(comment);
      map.set(comment.parentCommentId, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return map;
  }, [props.comments]);

  useEffect(() => {
    setDraft("");
    setReplyDrafts({});
    setEditingCommentId(null);
    setExpandedResolvedIds({});
  }, [props.taskId]);

  const submitComposer = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      await props.onAdd(trimmed);
      setDraft("");
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not add comment",
        description: error instanceof Error ? error.message : "An error occurred.",
      });
    } finally {
      setPosting(false);
    }
  }, [draft, posting, props]);

  const submitReply = useCallback(
    async (parentId: string) => {
      const trimmed = (replyDrafts[parentId] ?? "").trim();
      if (!trimmed || postingReplyTo) return;
      setPostingReplyTo(parentId);
      try {
        await props.onAdd(trimmed, parentId);
        setReplyDrafts((current) => ({ ...current, [parentId]: "" }));
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not add reply",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      } finally {
        setPostingReplyTo(null);
      }
    },
    [postingReplyTo, props, replyDrafts],
  );

  const saveEdit = useCallback(
    async (commentId: string) => {
      const trimmed = editDraft.trim();
      if (!trimmed) return;
      setSavingCommentId(commentId);
      try {
        await props.onEdit(commentId, { body: trimmed });
        setEditingCommentId(null);
        setEditDraft("");
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not update comment",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      } finally {
        setSavingCommentId(null);
      }
    },
    [editDraft, props],
  );

  const toggleResolve = useCallback(
    async (comment: BacksterosTaskComment) => {
      setSavingCommentId(comment.id);
      try {
        await props.onEdit(comment.id, {
          resolvedAt: comment.resolvedAt ? null : new Date().toISOString(),
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not update thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      } finally {
        setSavingCommentId(null);
      }
    },
    [props],
  );

  const handleDelete = useCallback(
    async (commentId: string) => {
      setSavingCommentId(commentId);
      try {
        await props.onDelete(commentId);
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Could not delete comment",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      } finally {
        setSavingCommentId(null);
      }
    },
    [props],
  );

  const renderBody = (comment: BacksterosTaskComment) => {
    if (editingCommentId === comment.id) {
      return (
        <form
          className="bos-task-comment-edit"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEdit(comment.id);
          }}
        >
          <textarea
            autoFocus
            value={editDraft}
            onChange={(event) => setEditDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setEditingCommentId(null);
                setEditDraft("");
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                void saveEdit(comment.id);
              }
            }}
            className="bos-task-comment-edit__input"
            aria-label="Edit comment"
            rows={3}
          />
          <div className="bos-task-comment-edit__footer">
            <CommentSubmitButton
              disabled={!editDraft.trim()}
              busy={savingCommentId === comment.id}
              label="Save comment"
            />
          </div>
        </form>
      );
    }
    return (
      <div className="bos-task-comment__body">
        {comment.body}
      </div>
    );
  };

  return (
    <div className="bos-task-comments">
      <section
        className="bos-task-comment-card bos-task-comment-card--composer"
        aria-label="New comment"
      >
        <CommentComposer
          variant="composer"
          value={draft}
          onChange={setDraft}
          onSubmit={() => void submitComposer()}
          busy={posting}
          placeholder="Leave a comment…"
          ariaLabel="Leave a comment"
        />
      </section>

      {rootComments.map((comment) => {
        const replies = repliesByParentId.get(comment.id) ?? [];
        const isResolved = comment.resolvedAt != null;
        const isResolvedCollapsed =
          isResolved && !expandedResolvedIds[comment.id] && editingCommentId !== comment.id;
        const threadCount = 1 + replies.length;
        const isEditingThread =
          editingCommentId != null &&
          (editingCommentId === comment.id ||
            replies.some((reply) => reply.id === editingCommentId));
        const replyDraft = replyDrafts[comment.id] ?? "";

        if (isResolvedCollapsed) {
          return (
            <section
              key={comment.id}
              className="bos-task-comment-card bos-task-comment-card--resolved-summary"
              aria-label={`Resolved thread by ${comment.authorName}`}
            >
              <button
                type="button"
                className="bos-task-comment-resolved-summary"
                onClick={() =>
                  setExpandedResolvedIds((current) => ({
                    ...current,
                    [comment.id]: true,
                  }))
                }
              >
                <span className="bos-task-comment-resolved-summary__text">
                  {threadCount} resolved {threadCount === 1 ? "comment" : "comments"} from{" "}
                  <strong>{comment.authorName}</strong>
                </span>
                {comment.resolvedAt ? (
                  <time
                    className="bos-task-comment-resolved-summary__time"
                    dateTime={comment.resolvedAt}
                  >
                    {formatBacksterosActivityRelativeTime(comment.resolvedAt)}
                  </time>
                ) : null}
              </button>
            </section>
          );
        }

        return (
          <section
            key={comment.id}
            className={[
              "bos-task-comment-card",
              isResolved ? "is-resolved is-resolved-expanded" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            aria-label={`Comment by ${comment.authorName}`}
          >
            <div className="bos-task-comment-card__actions">
              <CommentActionsMenu
                disabled={savingCommentId === comment.id}
                onEdit={() => {
                  setEditingCommentId(comment.id);
                  setEditDraft(comment.body);
                }}
                onResolve={() => void toggleResolve(comment)}
                resolveLabel={isResolved ? "Unresolve thread" : "Resolve thread"}
                onDelete={() => void handleDelete(comment.id)}
              />
            </div>

            <div className="bos-task-comment-stack">
              <div className="bos-task-comment">
                <CommentAuthorMeta
                  authorName={comment.authorName}
                  createdAt={comment.createdAt}
                  avatarSrc={resolveCommentAvatarSrc(
                    comment,
                    avatarSrcByContactId,
                    avatarSrcByEmail,
                  )}
                  resolved={isResolved}
                />
                {renderBody(comment)}
              </div>

              {replies.map((reply) => (
                <div key={reply.id} className="bos-task-comment bos-task-comment--reply">
                  <div className="bos-task-comment__header">
                    <CommentAuthorMeta
                      authorName={reply.authorName}
                      createdAt={reply.createdAt}
                      avatarSrc={resolveCommentAvatarSrc(
                        reply,
                        avatarSrcByContactId,
                        avatarSrcByEmail,
                      )}
                    />
                    <div className="bos-task-comment__actions">
                      <CommentActionsMenu
                        disabled={savingCommentId === reply.id}
                        onEdit={() => {
                          setEditingCommentId(reply.id);
                          setEditDraft(reply.body);
                        }}
                        onDelete={() => void handleDelete(reply.id)}
                      />
                    </div>
                  </div>
                  {renderBody(reply)}
                </div>
              ))}
            </div>

            {!isEditingThread ? (
              <CommentComposer
                variant="reply"
                value={replyDraft}
                onChange={(value) =>
                  setReplyDrafts((current) => ({
                    ...current,
                    [comment.id]: value,
                  }))
                }
                onSubmit={() => void submitReply(comment.id)}
                busy={postingReplyTo === comment.id}
                placeholder="Leave a reply…"
                ariaLabel={`Reply to ${comment.authorName}`}
              />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
