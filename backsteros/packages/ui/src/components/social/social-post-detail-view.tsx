"use client";

import { useEffect, useState } from "react";
import {
  HeartIcon,
  LinkExternalIcon,
  ReplyIcon,
  SyncIcon,
  TrashIcon,
} from "@primer/octicons-react";

import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import {
  getSocialMockPostById,
  getSocialMockRepliesForPost,
  getSocialPostExternalReplyUrl,
  resolveSocialMockInspectPost,
  SOCIAL_LINKEDIN_FEED_FALLBACK_URL,
  type SocialMockAccountKind,
  type SocialMockPost,
  type SocialMockReply,
} from "../../social/social-mock-data.js";
import {
  isLiveSocialFeedPostId,
  type SocialFeedPostsClient,
} from "../../social/social-feed-posts.js";
import { getSocialProfileHref } from "../../social/social-nav.js";
import { ClientLink } from "../../shared/client-link.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { VerifiedBadgeIcon } from "../icons/verified-badge-icon.js";
import type { SocialFeedPostReaction } from "@backsteros/contracts";

import { linkedInReactionLabel } from "../../social/linkedin-reactions.js";
import { SocialPostCard } from "./social-post-card.js";

export type SocialPostDetailViewProps = {
  postId?: string;
  /** When set, skips id lookup (e.g. pending Plan chips). */
  post?: SocialMockPost | null;
  /** Fallback link when the post is missing (defaults to Network home). */
  backHref?: string;
  /** `panel` — Discover rail; `page` — full main column. */
  layout?: "page" | "panel";
  /** Clear inspect selection and restore Discover widgets. */
  onClose?: () => void;
  /** Personal vs Business — company LinkedIn can load live comments. */
  accountKind?: SocialMockAccountKind;
  /** Live inbox client (LinkedIn company comments). */
  feedPostsClient?: SocialFeedPostsClient | null;
};

function formatCount(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}

function SocialReplyRow({
  reply,
  canDelete = false,
  deleteBusy = false,
  likeBusy = false,
  likedByMe = false,
  likeCount,
  onDelete,
  onReply,
  onToggleLike,
}: {
  reply: SocialMockReply;
  canDelete?: boolean;
  deleteBusy?: boolean;
  likeBusy?: boolean;
  likedByMe?: boolean;
  likeCount?: number;
  onDelete?: () => void;
  onReply?: () => void;
  onToggleLike?: () => void;
}) {
  const age = formatRelativeAgeLabel(reply.createdAt);
  const profileHref = getSocialProfileHref(reply.authorHandle);
  const avatarUrl = reply.authorAvatarUrl?.trim() || null;
  const displayLikes = likeCount ?? reply.likeCount;
  return (
    <article className="social-reply">
      <ClientLink
        href={profileHref}
        className="social-reply__avatar-link"
        aria-label={`${reply.authorName}'s profile`}
      >
        <span className="social-reply__avatar" aria-hidden="true">
          {avatarUrl ? (
            <img
              className="social-reply__avatar-image"
              src={avatarUrl}
              alt=""
              width={36}
              height={36}
              decoding="async"
            />
          ) : (
            <EntityAvatarIcon size={36} />
          )}
        </span>
      </ClientLink>
      <div className="social-reply__body">
        <header className="social-reply__header">
          <ClientLink href={profileHref} className="social-reply__name">
            {reply.authorName}
            {reply.authorVerified ? (
              <span
                className="social-reply__verified"
                title="Verified"
                aria-label="Verified"
              >
                <VerifiedBadgeIcon size={14} />
              </span>
            ) : null}
          </ClientLink>
          <ClientLink href={profileHref} className="social-reply__handle">
            @{reply.authorHandle}
          </ClientLink>
          {age ? (
            <>
              <span className="social-reply__dot" aria-hidden="true">
                ·
              </span>
              <time
                className="social-reply__age"
                dateTime={reply.createdAt}
                title={new Date(reply.createdAt).toLocaleString()}
              >
                {age}
              </time>
            </>
          ) : null}
        </header>
        <p className="social-reply__text">{reply.body}</p>
        <div className="social-reply__actions">
          <button
            type="button"
            className="social-post-card__action"
            disabled={!onReply}
            title={onReply ? "Reply" : undefined}
            aria-label={onReply ? "Reply to comment" : undefined}
            onClick={onReply}
          >
            <ReplyIcon size={14} />
          </button>
          <button
            type="button"
            className={[
              "social-post-card__action",
              likedByMe ? "social-post-card__action--active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={!onToggleLike || likeBusy}
            title={
              onToggleLike
                ? likedByMe
                  ? "Remove reaction"
                  : "Like comment"
                : undefined
            }
            aria-label={
              onToggleLike
                ? likedByMe
                  ? "Unlike comment"
                  : "Like comment"
                : undefined
            }
            aria-busy={likeBusy || undefined}
            onClick={onToggleLike}
          >
            <HeartIcon size={14} />
            <span>{formatCount(displayLikes)}</span>
          </button>
          {canDelete ? (
            <button
              type="button"
              className="social-post-card__action"
              disabled={deleteBusy || !onDelete}
              title="Delete comment"
              aria-label="Delete comment"
              onClick={onDelete}
            >
              <TrashIcon size={14} />
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function SocialPostDetailView({
  postId,
  post: postProp = null,
  backHref = "/social",
  layout = "page",
  onClose,
  accountKind = "personal",
  feedPostsClient = null,
}: SocialPostDetailViewProps) {
  // Prefer an explicit post (live Zernio / planned inspect). `null` means
  // "resolved missing" — skip mock lookup so live ids don't flash "not found".
  const post =
    postProp !== undefined && postProp !== null
      ? postProp
      : postProp === null
        ? null
        : postId
          ? (resolveSocialMockInspectPost(postId) ??
            getSocialMockPostById(postId))
          : null;
  const mockReplies = post ? getSocialMockRepliesForPost(post.id) : [];
  const [draft, setDraft] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null,
  );
  const [liveComments, setLiveComments] = useState<SocialMockReply[]>([]);
  const [liveCommentsStatus, setLiveCommentsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [commentLikeCounts, setCommentLikeCounts] = useState<
    Record<string, number>
  >({});
  const [likingCommentId, setLikingCommentId] = useState<string | null>(null);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [reactionsStatus, setReactionsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [reactions, setReactions] = useState<SocialFeedPostReaction[]>([]);
  const isPanel = layout === "panel";
  const isPendingPlan = Boolean(post?.id.startsWith("plan-"));
  const isPlanned = Boolean(
    post?.id.startsWith("planned-") || isPendingPlan,
  );
  const commentsViaLinkedIn = post?.platform === "linkedin";
  const canLoadCompanyComments =
    Boolean(post) &&
    commentsViaLinkedIn &&
    accountKind === "business" &&
    isLiveSocialFeedPostId(post!.id) &&
    feedPostsClient != null;
  const canWriteCompanyComments =
    canLoadCompanyComments && feedPostsClient != null;
  const linkedInCommentUrl =
    (post ? getSocialPostExternalReplyUrl(post) : null) ??
    SOCIAL_LINKEDIN_FEED_FALLBACK_URL;

  async function submitCompanyComment() {
    if (!canWriteCompanyComments || !post || !feedPostsClient || commentBusy) {
      return;
    }
    const body = draft.trim();
    if (!body) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      const created = await feedPostsClient.createComment({
        platform: "linkedin",
        accountKind: "business",
        postId: post.id,
        body,
        parentCommentId: replyParentId,
      });
      setLiveComments((current) => [created, ...current]);
      setDraft("");
      setReplyParentId(null);
      setLiveCommentsStatus("ready");
    } catch (error) {
      setCommentError(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Couldn’t post this comment.",
      );
    } finally {
      setCommentBusy(false);
    }
  }

  async function removeCompanyComment(commentId: string) {
    if (!canWriteCompanyComments || !post || !feedPostsClient) return;
    if (deletingCommentId) return;
    setDeletingCommentId(commentId);
    setCommentError(null);
    const previous = liveComments;
    setLiveComments((current) =>
      current.filter((entry) => entry.id !== commentId),
    );
    try {
      await feedPostsClient.deleteComment({
        platform: "linkedin",
        accountKind: "business",
        postId: post.id,
        commentId,
      });
    } catch (error) {
      setLiveComments(previous);
      setCommentError(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Couldn’t delete this comment.",
      );
    } finally {
      setDeletingCommentId(null);
    }
  }

  async function toggleCompanyCommentLike(comment: SocialMockReply) {
    if (!canWriteCompanyComments || !post || !feedPostsClient) return;
    if (likingCommentId) return;
    const liked = likedCommentIds.has(comment.id);
    const previousCount =
      commentLikeCounts[comment.id] ?? comment.likeCount ?? 0;
    setLikingCommentId(comment.id);
    setCommentError(null);
    setLikedCommentIds((current) => {
      const next = new Set(current);
      if (liked) next.delete(comment.id);
      else next.add(comment.id);
      return next;
    });
    setCommentLikeCounts((current) => ({
      ...current,
      [comment.id]: liked
        ? Math.max(0, previousCount - 1)
        : previousCount + 1,
    }));
    try {
      if (liked) {
        await feedPostsClient.unlikeComment({
          platform: "linkedin",
          accountKind: "business",
          postId: post.id,
          commentId: comment.id,
        });
      } else {
        await feedPostsClient.likeComment({
          platform: "linkedin",
          accountKind: "business",
          postId: post.id,
          commentId: comment.id,
        });
      }
    } catch (error) {
      setLikedCommentIds((current) => {
        const next = new Set(current);
        if (liked) next.add(comment.id);
        else next.delete(comment.id);
        return next;
      });
      setCommentLikeCounts((current) => ({
        ...current,
        [comment.id]: previousCount,
      }));
      setCommentError(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Couldn’t update comment reaction.",
      );
    } finally {
      setLikingCommentId(null);
    }
  }

  async function openReactions() {
    if (!post || !feedPostsClient?.listReactions) return;
    if (accountKind !== "business" || !isLiveSocialFeedPostId(post.id)) return;
    setReactionsOpen(true);
    setReactionsStatus("loading");
    try {
      const rows = await feedPostsClient.listReactions({
        platform: "linkedin",
        accountKind: "business",
        postId: post.id,
      });
      setReactions(rows);
      setReactionsStatus("ready");
    } catch {
      setReactions([]);
      setReactionsStatus("error");
    }
  }

  useEffect(() => {
    if (!canLoadCompanyComments || !post || !feedPostsClient) {
      setLiveComments([]);
      setLiveCommentsStatus("idle");
      return;
    }
    let cancelled = false;
    setLiveCommentsStatus("loading");
    void (async () => {
      try {
        const rows = await feedPostsClient.listComments({
          platform: "linkedin",
          accountKind: "business",
          postId: post.id,
        });
        if (cancelled) return;
        setLiveComments(rows);
        setLiveCommentsStatus("ready");
      } catch {
        if (cancelled) return;
        setLiveComments([]);
        setLiveCommentsStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canLoadCompanyComments, feedPostsClient, post]);

  if (!post) {
    return (
      <div
        className={[
          "social-feed",
          "social-feed--placeholder",
          isPanel ? "social-post-detail--panel" : null,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="social-feed__placeholder">
          <h2 className="social-feed__placeholder-title">Post not found</h2>
          <p className="social-feed__placeholder-copy">
            This demo post doesn’t exist.{" "}
            {onClose ? (
              <button
                type="button"
                className="social-profile__website"
                onClick={onClose}
              >
                Back to Discover
              </button>
            ) : (
              <ClientLink href={backHref} className="social-profile__website">
                Back to Network
              </ClientLink>
            )}
          </p>
        </div>
      </div>
    );
  }

  const replies = canLoadCompanyComments ? liveComments : mockReplies;
  const replyCountLabel = canLoadCompanyComments
    ? liveCommentsStatus === "ready"
      ? liveComments.length
      : post.replyCount
    : post.replyCount;

  return (
    <div
      className={[
        "social-feed",
        "social-post-detail",
        isPanel ? "social-post-detail--panel" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {isPanel ? (
        <div className="social-post-detail__panel-bar">
          <p className="social-post-detail__panel-label">
            {isPlanned ? "Planned post" : "Post"}
          </p>
        </div>
      ) : null}
      <div className="social-post-detail__scroll">
        <div className="social-post-detail__inner">
          <div className="social-post-detail__column">
            {isPlanned ? (
              <p className="social-post-detail__planned-hint">
                {isPendingPlan ? (
                  "Not on the calendar yet — keep it here until you schedule a time."
                ) : (
                  <>
                    Scheduled{" "}
                    <time dateTime={post.createdAt}>
                      {new Date(post.createdAt).toLocaleString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </time>
                    . Drag on the calendar to reschedule.
                  </>
                )}
              </p>
            ) : null}

            <SocialPostCard
              post={post}
              interactive={false}
              emphasis={isPanel ? "list" : "detail"}
              variant={isPlanned ? "draft" : "post"}
              draftPlatforms={
                isPlanned
                  ? (post.targetPlatforms ?? [post.platform])
                  : undefined
              }
            />

            {!isPlanned ? (
              <>
                <div
                  className="social-post-detail__stats"
                  aria-label="Engagement"
                >
                  <span>
                    <strong>{formatCount(post.repostCount)}</strong> Reposts
                  </span>
                  {accountKind === "business" &&
                  isLiveSocialFeedPostId(post.id) &&
                  feedPostsClient?.listReactions ? (
                    <button
                      type="button"
                      className="social-profile__website"
                      onClick={() => {
                        void openReactions();
                      }}
                    >
                      <strong>{formatCount(post.likeCount)}</strong> Likes
                    </button>
                  ) : (
                    <span>
                      <strong>{formatCount(post.likeCount)}</strong> Likes
                    </span>
                  )}
                  <span>
                    <strong>{formatCount(post.saveCount ?? 0)}</strong> Saves
                  </span>
                  <span>
                    <strong>{formatCount(replyCountLabel)}</strong> Replies
                  </span>
                </div>

                <div
                  className="social-post-detail__actions"
                  role="group"
                  aria-label="Post actions"
                >
                  <button
                    type="button"
                    className="social-post-card__action"
                    disabled
                  >
                    <ReplyIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="social-post-card__action"
                    disabled
                  >
                    <SyncIcon size={16} />
                  </button>
                  <button
                    type="button"
                    className="social-post-card__action"
                    disabled
                  >
                    <HeartIcon size={16} />
                  </button>
                </div>

                {commentsViaLinkedIn ? (
                  <div id="comments" className="social-post-detail__comments">
                    {canWriteCompanyComments ? (
                      <div className="social-feed__composer social-post-detail__composer">
                        <div
                          className="social-feed__composer-avatar"
                          aria-hidden="true"
                        >
                          <EntityAvatarIcon size={40} />
                        </div>
                        <div className="social-feed__composer-main">
                          {replyParentId ? (
                            <p className="social-post-detail__linkedin-comments-copy">
                              Replying to a comment.{" "}
                              <button
                                type="button"
                                className="social-profile__website"
                                onClick={() => setReplyParentId(null)}
                              >
                                Cancel reply
                              </button>
                            </p>
                          ) : null}
                          <textarea
                            className="social-feed__composer-input"
                            rows={2}
                            placeholder={
                              replyParentId
                                ? "Write your reply"
                                : "Comment as the company page"
                            }
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            aria-label={
                              replyParentId
                                ? "Reply to comment"
                                : "Comment on post"
                            }
                            disabled={commentBusy}
                          />
                          <div className="social-feed__composer-actions">
                            <button
                              type="button"
                              className="social-feed__composer-submit"
                              disabled={!draft.trim() || commentBusy}
                              onClick={() => {
                                void submitCompanyComment();
                              }}
                            >
                              {commentBusy
                                ? "Posting…"
                                : replyParentId
                                  ? "Reply"
                                  : "Comment"}
                            </button>
                          </div>
                          {commentError ? (
                            <p
                              className="social-feed__composer-error"
                              role="alert"
                            >
                              {commentError}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="social-post-detail__linkedin-comments"
                        role="note"
                      >
                        <p className="social-post-detail__linkedin-comments-title">
                          Commenting isn’t available for personal LinkedIn
                        </p>
                        <p className="social-post-detail__linkedin-comments-copy">
                          Switch to Business to comment on company-page posts,
                          or leave a comment on LinkedIn itself.
                        </p>
                        <a
                          className="social-feed__composer-submit social-post-detail__linkedin-comments-action"
                          href={linkedInCommentUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <LinkExternalIcon size={14} />
                          Comment on LinkedIn
                        </a>
                      </div>
                    )}

                    {canLoadCompanyComments ? (
                      <div
                        className="social-post-detail__replies"
                        aria-label="Comments"
                      >
                        {liveCommentsStatus === "loading" ? (
                          <div className="social-profile__empty">
                            <p className="social-profile__empty-title">
                              Loading comments…
                            </p>
                            <p className="social-profile__empty-copy">
                              Fetching LinkedIn company-page comments.
                            </p>
                          </div>
                        ) : liveCommentsStatus === "error" ? (
                          <div className="social-profile__empty">
                            <p className="social-profile__empty-title">
                              Couldn’t load comments
                            </p>
                            <p className="social-profile__empty-copy">
                              Try again in a moment, or open the post on
                              LinkedIn.
                            </p>
                          </div>
                        ) : replies.length === 0 ? (
                          <div className="social-profile__empty">
                            <p className="social-profile__empty-title">
                              No comments yet
                            </p>
                            <p className="social-profile__empty-copy">
                              Be the first to comment from Network.
                            </p>
                          </div>
                        ) : (
                          replies.map((reply) => (
                            <SocialReplyRow
                              key={reply.id}
                              reply={reply}
                              canDelete={canWriteCompanyComments}
                              deleteBusy={deletingCommentId === reply.id}
                              likeBusy={likingCommentId === reply.id}
                              likedByMe={likedCommentIds.has(reply.id)}
                              likeCount={
                                commentLikeCounts[reply.id] ?? reply.likeCount
                              }
                              onReply={
                                canWriteCompanyComments
                                  ? () => {
                                      setReplyParentId(reply.id);
                                      setCommentError(null);
                                    }
                                  : undefined
                              }
                              onToggleLike={
                                canWriteCompanyComments
                                  ? () => {
                                      void toggleCompanyCommentLike(reply);
                                    }
                                  : undefined
                              }
                              onDelete={
                                canWriteCompanyComments
                                  ? () => {
                                      void removeCompanyComment(reply.id);
                                    }
                                  : undefined
                              }
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div id="comments" className="social-post-detail__comments">
                    <div className="social-feed__composer social-post-detail__composer">
                      <div
                        className="social-feed__composer-avatar"
                        aria-hidden="true"
                      >
                        <EntityAvatarIcon size={40} />
                      </div>
                      <div className="social-feed__composer-main">
                        <textarea
                          className="social-feed__composer-input"
                          rows={2}
                          placeholder="Post your reply"
                          value={draft}
                          onChange={(event) => setDraft(event.target.value)}
                          aria-label="Reply to post"
                        />
                        <div className="social-feed__composer-actions">
                          <button
                            type="button"
                            className="social-feed__composer-submit"
                            disabled={!draft.trim()}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      className="social-post-detail__replies"
                      aria-label="Replies"
                    >
                      {replies.length === 0 ? (
                        <div className="social-profile__empty">
                          <p className="social-profile__empty-title">
                            No replies yet
                          </p>
                          <p className="social-profile__empty-copy">
                            Be the first to reply to this post.
                          </p>
                        </div>
                      ) : (
                        replies.map((reply) => (
                          <SocialReplyRow key={reply.id} reply={reply} />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
      {reactionsOpen ? (
        <div
          className="social-post-detail__reactions-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Who reacted"
          onClick={() => setReactionsOpen(false)}
        >
          <div
            className="social-post-detail__reactions-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="social-post-detail__panel-bar">
              <p className="social-post-detail__panel-label">Who reacted</p>
              <button
                type="button"
                className="social-profile__website"
                onClick={() => setReactionsOpen(false)}
              >
                Close
              </button>
            </div>
            {reactionsStatus === "loading" ? (
              <p className="social-profile__empty-copy">Loading reactions…</p>
            ) : reactionsStatus === "error" ? (
              <p className="social-profile__empty-copy">
                Couldn’t load reactions for this post.
              </p>
            ) : reactions.length === 0 ? (
              <p className="social-profile__empty-copy">No reactions yet.</p>
            ) : (
              <div className="social-post-detail__reactions-list">
                {reactions.map((reaction) => (
                  <div
                    key={reaction.id}
                    className="social-post-detail__reaction-row"
                  >
                    {reaction.avatarUrl ? (
                      <img
                        className="social-post-detail__reaction-avatar"
                        src={reaction.avatarUrl}
                        alt=""
                        width={32}
                        height={32}
                      />
                    ) : (
                      <span
                        className="social-post-detail__reaction-avatar"
                        aria-hidden="true"
                      />
                    )}
                    <div className="social-post-detail__reaction-meta">
                      <span className="social-post-detail__reaction-name">
                        {reaction.name}
                      </span>
                      <span className="social-post-detail__reaction-sub">
                        {linkedInReactionLabel(reaction.reactionType)}
                        {reaction.headline ? ` · ${reaction.headline}` : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
