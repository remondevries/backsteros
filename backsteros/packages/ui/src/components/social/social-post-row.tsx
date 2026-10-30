"use client";

import { useEffect, useState, type ReactNode } from "react";

type ReactionMenuAnchor = "filing" | "card" | null;
import {
  PencilIcon,
  TrashIcon,
  UploadIcon,
} from "@primer/octicons-react";

import type { LinkedInReactionType } from "@backsteros/contracts";

import {
  isLiveSocialFeedPostId,
  type SocialFeedPostsClient,
} from "../../social/social-feed-posts.js";
import {
  LINKEDIN_REACTION_OPTIONS,
  linkedInReactionGlyph,
  linkedInReactionLabel,
} from "../../social/linkedin-reactions.js";
import {
  getSocialPostExternalReplyUrl,
  type SocialMockPost,
  type SocialMockPostPlatform,
} from "../../social/social-mock-data.js";
import {
  getSocialPostHref,
  type SocialFeedAccountKind,
  type SocialFeedPlatformFilterId,
  type SocialFeedTabId,
  type SocialPlatformNavId,
} from "../../social/social-nav.js";
import { ClientLink } from "../../shared/client-link.js";
import { SocialLikeIcon } from "../icons/social-like-icon.js";
import { SocialReplyIcon } from "../icons/social-reply-icon.js";
import { SocialRepostIcon } from "../icons/social-repost-icon.js";
import { SocialSaveIcon } from "../icons/social-save-icon.js";
import { SocialUrlIcon } from "../icons/social-url-icon.js";
import { SocialPostCard } from "./social-post-card.js";

export type SocialPostFilingActionId =
  | "edit"
  | "save"
  | "unsave"
  | "reply"
  | "archive"
  | "delete"
  | "like"
  | "unlike"
  | "repost"
  | "url";

export type SocialDraftFilingActionId = "edit" | "publish" | "delete";

type FilingAction = {
  id: SocialPostFilingActionId;
  label: string;
  /** Visual break before this action (e.g. after triage → outbound). */
  dividerBefore?: boolean;
  icon?: ReactNode;
  /** When set, the control is disabled and this explains why. */
  disabledReason?: string;
};

const SAVE_DISABLED_REASON =
  "Save isn’t needed here — this feed only shows your own posts.";
const REPOST_DISABLED_REASON =
  "Repost needs a LinkedIn post URL — open the post on LinkedIn first.";

const EDIT_DISABLED_REASON =
  "Only posts published through Network can be edited here.";
const DELETE_DISABLED_REASON =
  "Only posts published through Network can be deleted here.";

const FILING_ACTIONS: readonly FilingAction[] = [
  {
    id: "edit",
    label: "Edit",
    icon: <PencilIcon size={18} />,
  },
  {
    id: "reply",
    label: "Reply",
    icon: <SocialReplyIcon size={18} />,
  },
  {
    id: "like",
    label: "Like",
    icon: <SocialLikeIcon size={18} />,
  },
  {
    id: "save",
    label: "Save",
    icon: <SocialSaveIcon size={18} />,
    disabledReason: SAVE_DISABLED_REASON,
  },
  {
    id: "delete",
    label: "Delete",
    icon: <TrashIcon size={18} />,
  },
  {
    id: "url",
    label: "URL",
    dividerBefore: true,
    icon: <SocialUrlIcon size={18} />,
  },
  {
    id: "repost",
    label: "Repost",
    icon: <SocialRepostIcon size={18} />,
  },
];

/** Liked tab — remove from likes instead of Archive. */
const LIKED_FILING_ACTIONS: readonly FilingAction[] = [
  {
    id: "reply",
    label: "Reply",
    icon: <SocialReplyIcon size={18} />,
  },
  {
    id: "unlike",
    label: "Unlike",
    icon: <SocialLikeIcon size={18} />,
  },
  {
    id: "save",
    label: "Save",
    icon: <SocialSaveIcon size={18} />,
    disabledReason: SAVE_DISABLED_REASON,
  },
  {
    id: "url",
    label: "URL",
    dividerBefore: true,
    icon: <SocialUrlIcon size={18} />,
  },
  {
    id: "repost",
    label: "Repost",
    icon: <SocialRepostIcon size={18} />,
  },
];

/** Saved tab — remove from saves instead of Archive. */
const SAVED_FILING_ACTIONS: readonly FilingAction[] = [
  {
    id: "reply",
    label: "Reply",
    icon: <SocialReplyIcon size={18} />,
  },
  {
    id: "like",
    label: "Like",
    icon: <SocialLikeIcon size={18} />,
  },
  {
    id: "unsave",
    label: "Unsave",
    icon: <SocialSaveIcon size={18} />,
    disabledReason: SAVE_DISABLED_REASON,
  },
  {
    id: "url",
    label: "URL",
    dividerBefore: true,
    icon: <SocialUrlIcon size={18} />,
  },
  {
    id: "repost",
    label: "Repost",
    icon: <SocialRepostIcon size={18} />,
  },
];

const DRAFT_FILING_ACTIONS: readonly {
  id: SocialDraftFilingActionId;
  label: string;
  icon: ReactNode;
}[] = [
  {
    id: "edit",
    label: "Edit",
    icon: <PencilIcon size={18} />,
  },
  {
    id: "publish",
    label: "Publish",
    icon: <UploadIcon size={18} />,
  },
  {
    id: "delete",
    label: "Delete",
    icon: <TrashIcon size={18} />,
  },
];

export type SocialPostRowProps = {
  post: SocialMockPost;
  /**
   * `draft` — Edit / Publish / Delete; card shows platforms.
   * `liked` — Reply / Unlike / Save | URL / Repost.
   * `saved` — Reply / Like / Unsave | URL / Repost.
   */
  variant?: "post" | "draft" | "liked" | "saved";
  /** Platforms this draft will publish to (draft variant only). */
  draftPlatforms?: readonly SocialPlatformNavId[];
  /** Live LinkedIn like/unlike via core → Zernio. */
  feedPostsClient?: SocialFeedPostsClient | null;
  /** Current Network filters — baked into the post link for Back. */
  feedAccountKind?: SocialFeedAccountKind;
  feedPlatform?: SocialFeedPlatformFilterId;
  feedTab?: SocialFeedTabId;
  /** Called after a live Network post is unpublished/deleted. */
  onPostDeleted?: (postId: string) => void;
};

function postAbsoluteUrl(
  postId: string,
  options?: {
    accountKind?: SocialFeedAccountKind;
    platform?: SocialFeedPlatformFilterId;
    tab?: SocialFeedTabId;
  },
): string {
  const path = getSocialPostHref(postId, options);
  if (typeof window === "undefined") return path;
  return new URL(path, window.location.origin).toString();
}

function filingActionsFor(
  variant: NonNullable<SocialPostRowProps["variant"]>,
): readonly FilingAction[] {
  if (variant === "liked") return LIKED_FILING_ACTIONS;
  if (variant === "saved") return SAVED_FILING_ACTIONS;
  return FILING_ACTIONS;
}

export function SocialPostRow({
  post,
  variant = "post",
  draftPlatforms = [],
  feedPostsClient = null,
  feedAccountKind,
  feedPlatform,
  feedTab,
  onPostDeleted,
}: SocialPostRowProps) {
  const isDraft = variant === "draft";
  const postHref = getSocialPostHref(post.id, {
    accountKind: feedAccountKind,
    platform: feedPlatform,
    tab: feedTab,
  });
  const canLikeLive =
    post.platform === "linkedin" &&
    isLiveSocialFeedPostId(post.id) &&
    feedPostsClient != null;
  const canEditLive =
    post.platform === "linkedin" &&
    post.id.startsWith("zernio-post:") &&
    feedPostsClient != null;
  const canDeleteLive = canEditLive;
  const canRepostLive =
    post.platform === "linkedin" &&
    Boolean(post.permalink?.trim()) &&
    feedPostsClient != null;
  const [likedByMe, setLikedByMe] = useState(variant === "liked");
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const [reactionType, setReactionType] = useState<LinkedInReactionType | null>(
    variant === "liked" ? "LIKE" : null,
  );
  const [reactionMenuAnchor, setReactionMenuAnchor] =
    useState<ReactionMenuAnchor>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [displayBody, setDisplayBody] = useState(post.body);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [repostBusy, setRepostBusy] = useState(false);
  const [repostError, setRepostError] = useState<string | null>(null);

  // Sync from props only when the feed row identity/body changes — not when
  // leaving edit mode, or an optimistic save would snap back to the old text.
  useEffect(() => {
    setDisplayBody(post.body);
    setEditBody(post.body);
  }, [post.id, post.body]);

  const postFilingActions = filingActionsFor(variant).map((action) => {
    if (action.id === "edit") {
      if (canEditLive) return action;
      return { ...action, disabledReason: EDIT_DISABLED_REASON };
    }
    if (action.id === "delete") {
      if (canDeleteLive) return action;
      return { ...action, disabledReason: DELETE_DISABLED_REASON };
    }
    if (action.id === "repost") {
      if (canRepostLive) return action;
      return { ...action, disabledReason: REPOST_DISABLED_REASON };
    }
    // LinkedIn live: keep `like` so the right-nav always opens the reaction menu.
    if (canLikeLive && (action.id === "like" || action.id === "unlike")) {
      return {
        ...action,
        id: "like" as const,
        label: likedByMe
          ? linkedInReactionLabel(reactionType)
          : "Like",
      };
    }
    if (action.id === "like" && likedByMe) {
      return {
        ...action,
        id: "unlike" as const,
        label: "Unlike",
      };
    }
    if (action.id === "unlike" && !likedByMe && variant !== "liked") {
      return {
        ...action,
        id: "like" as const,
        label: "Like",
      };
    }
    return action;
  });
  // Company-page comments are in-app; personal LinkedIn still opens the network.
  const replyInApp =
    (feedAccountKind ?? post.accountKind) === "business";
  const externalReplyUrl = replyInApp
    ? null
    : getSocialPostExternalReplyUrl(post);
  const inAppReplyHref = replyInApp ? `${postHref}#comments` : null;
  const externalReplyLabel =
    post.platform === "linkedin"
      ? "Reply on LinkedIn"
      : post.platform === "x"
        ? "Reply on X"
        : post.platform === "facebook"
          ? "Reply on Facebook"
          : post.platform === "instagram"
            ? "Reply on Instagram"
            : "Reply on the network";
  const replyLabel = replyInApp ? "Open comments" : externalReplyLabel;

  async function setLiked(
    nextLiked: boolean,
    nextReaction: LinkedInReactionType = "LIKE",
  ) {
    if (!canLikeLive || !feedPostsClient || likeBusy) return;
    if (nextLiked && likedByMe && reactionType === nextReaction) {
      setReactionMenuAnchor(null);
      return;
    }
    if (!nextLiked && !likedByMe) return;

    const previousLiked = likedByMe;
    const previousCount = likeCount;
    const previousReaction = reactionType;
    // Optimistic — flip UI immediately (card heart + right-nav), roll back if
    // the network call fails.
    const countDelta = nextLiked && !previousLiked ? 1 : !nextLiked ? -1 : 0;
    setLikedByMe(nextLiked);
    setReactionType(nextLiked ? nextReaction : null);
    if (countDelta !== 0) {
      setLikeCount((count) => Math.max(0, count + countDelta));
    }
    setLikeBusy(true);
    setLikeError(null);
    setReactionMenuAnchor(null);

    // LinkedIn cannot change a reaction in place — Zernio returns 409 (or
    // alreadyReacted with the old type). Remove first, then create the new one.
    const replacingReaction =
      nextLiked && previousLiked && previousReaction !== nextReaction;

    try {
      if (nextLiked) {
        if (replacingReaction) {
          try {
            await feedPostsClient.unlike({
              platform: "linkedin",
              accountKind: post.accountKind,
              postId: post.id,
            });
          } catch {
            // Already cleared on LinkedIn — still try to create the new type.
          }
        }
        const result = await feedPostsClient.like({
          platform: "linkedin",
          accountKind: post.accountKind,
          postId: post.id,
          reactionType: nextReaction,
        });
        if (result.alreadyReacted && countDelta !== 0) {
          setLikeCount(previousCount);
        }
        // If Zernio still reports a different type (stale alreadyReacted),
        // force one more remove + create cycle before giving up.
        const echoed =
          typeof result.reactionType === "string" ? result.reactionType : null;
        if (
          result.alreadyReacted &&
          echoed != null &&
          echoed !== nextReaction
        ) {
          try {
            await feedPostsClient.unlike({
              platform: "linkedin",
              accountKind: post.accountKind,
              postId: post.id,
            });
          } catch {
            // ignore
          }
          await feedPostsClient.like({
            platform: "linkedin",
            accountKind: post.accountKind,
            postId: post.id,
            reactionType: nextReaction,
          });
        }
        setReactionType(nextReaction);
      } else {
        await feedPostsClient.unlike({
          platform: "linkedin",
          accountKind: post.accountKind,
          postId: post.id,
        });
      }
    } catch (error) {
      // Best-effort restore if we cleared the old reaction before failing.
      if (replacingReaction && previousReaction) {
        try {
          await feedPostsClient.like({
            platform: "linkedin",
            accountKind: post.accountKind,
            postId: post.id,
            reactionType: previousReaction,
          });
        } catch {
          // ignore — UI rolls back either way
        }
      }
      setLikedByMe(previousLiked);
      setLikeCount(previousCount);
      setReactionType(previousReaction);
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : nextLiked
            ? "Couldn’t update this reaction."
            : "Couldn’t unlike this post.";
      setLikeError(message);
    } finally {
      setLikeBusy(false);
    }
  }

  const linkedInReactionMenu =
    canLikeLive && reactionMenuAnchor ? (
      <div
        className={[
          "social-post-row__reaction-menu",
          reactionMenuAnchor === "card"
            ? "social-post-row__reaction-menu--card"
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        role="menu"
        aria-label="LinkedIn reactions"
      >
        {LINKEDIN_REACTION_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="menuitem"
            className={[
              "social-post-row__reaction-option",
              likedByMe && reactionType === option.id
                ? "social-post-row__reaction-option--active"
                : null,
            ]
              .filter(Boolean)
              .join(" ")}
            disabled={likeBusy}
            onClick={() => {
              void setLiked(true, option.id);
            }}
          >
            <span aria-hidden="true">{option.glyph}</span> {option.label}
          </button>
        ))}
        {likedByMe ? (
          <button
            type="button"
            role="menuitem"
            className="social-post-row__reaction-option social-post-row__reaction-option--remove"
            disabled={likeBusy}
            onClick={() => {
              void setLiked(false);
            }}
          >
            Remove reaction
          </button>
        ) : null}
      </div>
    ) : null;

  async function repostLive() {
    if (!canRepostLive || !feedPostsClient || repostBusy) return;
    const reshareUrl = post.permalink?.trim();
    if (!reshareUrl) return;
    setRepostBusy(true);
    setRepostError(null);
    try {
      await feedPostsClient.publish({
        platform: "linkedin",
        accountKind: feedAccountKind ?? post.accountKind,
        body: "",
        reshareUrl,
      });
    } catch (error) {
      setRepostError(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Couldn’t repost this.",
      );
    } finally {
      setRepostBusy(false);
    }
  }

  async function saveEdit() {
    if (!canEditLive || !feedPostsClient || editBusy) return;
    const next = editBody.trim();
    if (!next) {
      setEditError("Post text is required.");
      return;
    }
    if (next === displayBody.trim()) {
      setEditing(false);
      setEditError(null);
      return;
    }
    const previous = displayBody;
    // Optimistic — close the editor on the new text immediately; roll back if
    // Zernio rejects the edit.
    setDisplayBody(next);
    setEditBody(next);
    setEditing(false);
    setEditBusy(true);
    setEditError(null);
    try {
      const result = await feedPostsClient.edit({
        platform: "linkedin",
        accountKind: post.accountKind,
        postId: post.id,
        body: next,
      });
      setDisplayBody(result.body);
      setEditBody(result.body);
    } catch (error) {
      setDisplayBody(previous);
      setEditBody(previous);
      setEditing(true);
      setEditError(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Couldn’t save this edit.",
      );
    } finally {
      setEditBusy(false);
    }
  }

  function beginEdit() {
    if (!canEditLive || editBusy) return;
    setEditBody(displayBody);
    setEditError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditBody(displayBody);
    setEditing(false);
    setEditError(null);
  }

  async function deleteLivePost() {
    if (!canDeleteLive || !feedPostsClient || deleteBusy) return;
    const confirmed =
      typeof window === "undefined"
        ? true
        : window.confirm(
            "Delete this LinkedIn post from Network? It will be unpublished via Zernio.",
          );
    if (!confirmed) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await feedPostsClient.deletePost({
        platform: "linkedin",
        accountKind: post.accountKind,
        postId: post.id,
      });
      onPostDeleted?.(post.id);
    } catch (error) {
      setDeleteError(
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "Couldn’t delete this post.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onFilingAction(id: SocialPostFilingActionId) {
    if (id === "edit") {
      beginEdit();
      return;
    }
    if (id === "delete") {
      await deleteLivePost();
      return;
    }
    if (id === "like") {
      // LinkedIn: reaction picker (also on the card heart under the post).
      if (canLikeLive) {
        setReactionMenuAnchor((current) =>
          current === "filing" ? null : "filing",
        );
        return;
      }
      await setLiked(true);
      return;
    }
    if (id === "unlike") {
      await setLiked(false);
      return;
    }
    if (id === "repost") {
      await repostLive();
      return;
    }
    if (id !== "url") return;
    // Prefer the public network permalink (e.g. LinkedIn); fall back to in-app.
    const url =
      post.permalink?.trim() ||
      postAbsoluteUrl(post.id, {
        accountKind: feedAccountKind,
        platform: feedPlatform,
        tab: feedTab,
      });
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      window.setTimeout(() => setUrlCopied(false), 1600);
    } catch {
      setUrlCopied(false);
    }
  }

  return (
    <div
      className={["social-post-row", isDraft ? "social-post-row--draft" : null]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="social-post-row__inner">
        <div className="social-post-row__card">
          <SocialPostCard
            post={{ ...post, body: displayBody }}
            interactive={!isDraft && !editing}
            variant={isDraft ? "draft" : "post"}
            draftPlatforms={
              draftPlatforms as readonly SocialMockPostPlatform[]
            }
            href={postHref}
            liked={likedByMe}
            likeBusy={likeBusy}
            likeCount={likeCount}
            reactionType={reactionType}
            onOpenReactionMenu={
              canLikeLive
                ? () => {
                    setReactionMenuAnchor((current) =>
                      current === "card" ? null : "card",
                    );
                  }
                : undefined
            }
            reactionMenuOpen={reactionMenuAnchor === "card"}
            reactionMenu={
              reactionMenuAnchor === "card" ? linkedInReactionMenu : null
            }
            editing={editing}
            editBody={editBody}
            editBusy={editBusy}
            onEditBodyChange={setEditBody}
            onEditSave={() => {
              void saveEdit();
            }}
            onEditCancel={cancelEdit}
          />
          {editError ? (
            <p className="social-post-row__edit-error" role="alert">
              {editError}
            </p>
          ) : null}
          {deleteError ? (
            <p className="social-post-row__edit-error" role="alert">
              {deleteError}
            </p>
          ) : null}
          {repostError ? (
            <p className="social-post-row__edit-error" role="alert">
              {repostError}
            </p>
          ) : null}
        </div>
        <div className="social-post-row__filing">
          {isDraft ? (
            <div
              className="social-post-row__filing-sticky"
              role="group"
              aria-label="Draft actions"
            >
              {DRAFT_FILING_ACTIONS.map((action) => (
                <div key={action.id} className="social-post-row__filing-item">
                  <button
                    type="button"
                    className={[
                      "social-post-row__filing-action",
                      action.id === "delete"
                        ? "social-post-row__filing-action--danger"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span
                      className="social-post-row__filing-icon"
                      aria-hidden="true"
                    >
                      {action.icon}
                    </span>
                    <span className="social-post-row__filing-label">
                      {action.label}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div
              className="social-post-row__filing-sticky"
              role="group"
              aria-label={`File post by ${post.authorName}`}
            >
              {postFilingActions.map((action) => (
                <div
                  key={action.id}
                  className={[
                    "social-post-row__filing-item",
                    action.dividerBefore
                      ? "social-post-row__filing-item--divided"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {action.dividerBefore ? (
                    <span
                      className="social-post-row__filing-divider"
                      aria-hidden="true"
                    />
                  ) : null}
                  {action.id === "reply" && inAppReplyHref ? (
                    <ClientLink
                      className="social-post-row__filing-action"
                      href={inAppReplyHref}
                      title={replyLabel}
                      aria-label={replyLabel}
                    >
                      {action.icon ? (
                        <span
                          className="social-post-row__filing-icon"
                          aria-hidden="true"
                        >
                          {action.icon}
                        </span>
                      ) : null}
                      <span className="social-post-row__filing-label">
                        {action.label}
                      </span>
                    </ClientLink>
                  ) : action.id === "reply" && externalReplyUrl ? (
                    <a
                      className="social-post-row__filing-action"
                      href={externalReplyUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={replyLabel}
                      aria-label={replyLabel}
                    >
                      {action.icon ? (
                        <span
                          className="social-post-row__filing-icon"
                          aria-hidden="true"
                        >
                          {action.icon}
                        </span>
                      ) : null}
                      <span className="social-post-row__filing-label">
                        {action.label}
                      </span>
                    </a>
                  ) : (
                    <div className="social-post-row__filing-action-wrap">
                      <button
                        type="button"
                        className={[
                          "social-post-row__filing-action",
                          action.id === "unlike" ||
                            action.id === "unsave" ||
                            action.id === "delete"
                            ? "social-post-row__filing-action--danger"
                            : null,
                          (action.id === "like" || action.id === "unlike") &&
                            likedByMe
                            ? "social-post-row__filing-action--active"
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        disabled={
                          Boolean(action.disabledReason) ||
                          ((action.id === "like" || action.id === "unlike") &&
                            likeBusy) ||
                          (action.id === "edit" && (editBusy || editing)) ||
                          (action.id === "delete" && deleteBusy) ||
                          (action.id === "repost" && repostBusy)
                        }
                        title={
                          action.disabledReason ??
                          (action.id === "url"
                            ? urlCopied
                              ? "Copied"
                              : post.permalink?.trim()
                                ? "Copy post URL"
                                : "Copy BacksterOS URL"
                            : action.id === "like"
                              ? (likeError ??
                                (canLikeLive
                                  ? likedByMe
                                    ? `${linkedInReactionLabel(reactionType)} — change or remove`
                                    : "Choose a LinkedIn reaction"
                                  : undefined))
                              : action.id === "unlike"
                                ? (likeError ?? "Unlike")
                              : action.id === "edit"
                                ? (editError ?? "Edit post text")
                                : action.id === "delete"
                                  ? (deleteError ?? "Delete post")
                                  : action.id === "repost"
                                    ? (repostError ?? "Repost on LinkedIn")
                                    : undefined)
                        }
                        aria-busy={
                          ((action.id === "like" || action.id === "unlike") &&
                            likeBusy) ||
                          (action.id === "delete" && deleteBusy) ||
                          (action.id === "repost" && repostBusy)
                            ? true
                            : undefined
                        }
                        aria-expanded={
                          action.id === "like" && canLikeLive
                            ? reactionMenuAnchor === "filing"
                            : undefined
                        }
                        onClick={() => {
                          void onFilingAction(action.id);
                        }}
                      >
                        {action.icon ||
                        (action.id === "like" &&
                          canLikeLive &&
                          likedByMe &&
                          linkedInReactionGlyph(reactionType)) ? (
                          <span
                            className="social-post-row__filing-icon"
                            aria-hidden="true"
                          >
                            {action.id === "like" &&
                            canLikeLive &&
                            likedByMe &&
                            linkedInReactionGlyph(reactionType)
                              ? linkedInReactionGlyph(reactionType)
                              : action.icon}
                          </span>
                        ) : null}
                        <span className="social-post-row__filing-label">
                          {action.id === "url" && urlCopied
                            ? "Copied"
                            : action.label}
                        </span>
                      </button>
                      {action.id === "like" && reactionMenuAnchor === "filing"
                        ? linkedInReactionMenu
                        : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
