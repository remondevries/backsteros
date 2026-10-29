"use client";

import { useState } from "react";
import { HeartIcon, ReplyIcon, SyncIcon, XIcon } from "@primer/octicons-react";

import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import {
  getSocialMockPostById,
  getSocialMockRepliesForPost,
  resolveSocialMockInspectPost,
  type SocialMockPost,
  type SocialMockReply,
} from "../../social/social-mock-data.js";
import { getSocialProfileHref } from "../../social/social-nav.js";
import { ClientLink } from "../../shared/client-link.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { VerifiedBadgeIcon } from "../icons/verified-badge-icon.js";
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

function SocialReplyRow({ reply }: { reply: SocialMockReply }) {
  const age = formatRelativeAgeLabel(reply.createdAt);
  const profileHref = getSocialProfileHref(reply.authorHandle);
  return (
    <article className="social-reply">
      <ClientLink
        href={profileHref}
        className="social-reply__avatar-link"
        aria-label={`${reply.authorName}'s profile`}
      >
        <span className="social-reply__avatar" aria-hidden="true">
          <EntityAvatarIcon size={36} />
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
          <button type="button" className="social-post-card__action" disabled>
            <ReplyIcon size={14} />
          </button>
          <button type="button" className="social-post-card__action" disabled>
            <HeartIcon size={14} />
            <span>{formatCount(reply.likeCount)}</span>
          </button>
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
}: SocialPostDetailViewProps) {
  const post =
    postProp ??
    (postId
      ? (resolveSocialMockInspectPost(postId) ?? getSocialMockPostById(postId))
      : null);
  const replies = post ? getSocialMockRepliesForPost(post.id) : [];
  const [draft, setDraft] = useState("");
  const isPanel = layout === "panel";
  const isPendingPlan = Boolean(post?.id.startsWith("plan-"));
  const isPlanned = Boolean(
    post?.id.startsWith("planned-") || isPendingPlan,
  );

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
      {isPanel && onClose ? (
        <div className="social-post-detail__panel-bar">
          <p className="social-post-detail__panel-label">
            {isPlanned ? "Planned post" : "Post"}
          </p>
          <button
            type="button"
            className="social-post-detail__panel-close"
            aria-label="Back to Discover"
            onClick={onClose}
          >
            <XIcon size={14} />
          </button>
        </div>
      ) : null}
      <div className="social-post-detail__scroll">
        <div className="social-post-detail__inner">
          <div className="social-post-detail__column">
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
                  <span>
                    <strong>{formatCount(post.likeCount)}</strong> Likes
                  </span>
                  <span>
                    <strong>{formatCount(post.replyCount)}</strong> Replies
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

                <div className="social-post-detail__replies" aria-label="Replies">
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
              </>
            ) : (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
