"use client";

import { useEffect, useState } from "react";
import {
  HeartIcon,
  LinkExternalIcon,
  ReplyIcon,
  SyncIcon,
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

function SocialReplyRow({ reply }: { reply: SocialMockReply }) {
  const age = formatRelativeAgeLabel(reply.createdAt);
  const profileHref = getSocialProfileHref(reply.authorHandle);
  const avatarUrl = reply.authorAvatarUrl?.trim() || null;
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
  const [liveComments, setLiveComments] = useState<SocialMockReply[]>([]);
  const [liveCommentsStatus, setLiveCommentsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
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
  const linkedInCommentUrl =
    (post ? getSocialPostExternalReplyUrl(post) : null) ??
    SOCIAL_LINKEDIN_FEED_FALLBACK_URL;

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
                  <span>
                    <strong>{formatCount(post.likeCount)}</strong> Likes
                  </span>
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
                  <>
                    <div
                      className="social-post-detail__linkedin-comments"
                      role="note"
                    >
                      <p className="social-post-detail__linkedin-comments-title">
                        Commenting isn’t available in BacksterOS
                      </p>
                      <p className="social-post-detail__linkedin-comments-copy">
                        LinkedIn doesn’t let apps post comments from here. You
                        can still leave one on LinkedIn itself
                        {canLoadCompanyComments
                          ? ", and existing company-page comments show below."
                          : "."}
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
                              When people comment on LinkedIn, they’ll show up
                              here.
                            </p>
                          </div>
                        ) : (
                          replies.map((reply) => (
                            <SocialReplyRow key={reply.id} reply={reply} />
                          ))
                        )}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
