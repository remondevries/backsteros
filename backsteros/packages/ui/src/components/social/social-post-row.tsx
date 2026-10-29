"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  PencilIcon,
  TrashIcon,
  UploadIcon,
} from "@primer/octicons-react";

import {
  isLiveSocialFeedPostId,
  type SocialFeedPostsClient,
} from "../../social/social-feed-posts.js";
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
import { SocialArchiveIcon } from "../icons/social-archive-icon.js";
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

/** Inbox only lists our own posts — resharing / hiding / saving them isn’t useful yet. */
const REPOST_DISABLED_REASON =
  "Repost isn’t available here yet — this feed only shows your own posts.";
const ARCHIVE_DISABLED_REASON =
  "Archive isn’t needed here — this feed only shows your own posts.";
const SAVE_DISABLED_REASON =
  "Save isn’t needed here — this feed only shows your own posts.";

const EDIT_DISABLED_REASON =
  "Only posts published through Network can be edited here.";

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
    id: "archive",
    label: "Archive",
    icon: <SocialArchiveIcon size={18} />,
    disabledReason: ARCHIVE_DISABLED_REASON,
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
    disabledReason: REPOST_DISABLED_REASON,
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
    disabledReason: REPOST_DISABLED_REASON,
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
    disabledReason: REPOST_DISABLED_REASON,
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
  const [likedByMe, setLikedByMe] = useState(variant === "liked");
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likeError, setLikeError] = useState<string | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(post.body);
  const [displayBody, setDisplayBody] = useState(post.body);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Sync from props only when the feed row identity/body changes — not when
  // leaving edit mode, or an optimistic save would snap back to the old text.
  useEffect(() => {
    setDisplayBody(post.body);
    setEditBody(post.body);
  }, [post.id, post.body]);

  const postFilingActions = filingActionsFor(variant).map((action) => {
    if (action.id === "edit") {
      if (canEditLive) return action;
      if (post.platform === "linkedin" && isLiveSocialFeedPostId(post.id)) {
        return { ...action, disabledReason: EDIT_DISABLED_REASON };
      }
      return { ...action, disabledReason: EDIT_DISABLED_REASON };
    }
    if (!canLikeLive) return action;
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
  const externalReplyUrl = getSocialPostExternalReplyUrl(post);
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

  async function setLiked(nextLiked: boolean) {
    if (!canLikeLive || !feedPostsClient || likeBusy) return;
    if (nextLiked === likedByMe) return;

    const previousLiked = likedByMe;
    const previousCount = likeCount;
    // Optimistic — flip UI immediately, roll back if the network call fails.
    setLikedByMe(nextLiked);
    setLikeCount((count) =>
      nextLiked ? count + 1 : Math.max(0, count - 1),
    );
    setLikeBusy(true);
    setLikeError(null);

    try {
      if (nextLiked) {
        const result = await feedPostsClient.like({
          platform: "linkedin",
          accountKind: post.accountKind,
          postId: post.id,
        });
        if (result.alreadyReacted) {
          setLikeCount(previousCount);
        }
      } else {
        await feedPostsClient.unlike({
          platform: "linkedin",
          accountKind: post.accountKind,
          postId: post.id,
        });
      }
    } catch (error) {
      setLikedByMe(previousLiked);
      setLikeCount(previousCount);
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : nextLiked
            ? "Couldn’t like this post."
            : "Couldn’t unlike this post.";
      setLikeError(message);
    } finally {
      setLikeBusy(false);
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

  async function onFilingAction(id: SocialPostFilingActionId) {
    if (id === "edit") {
      beginEdit();
      return;
    }
    if (id === "like" || id === "unlike") {
      await setLiked(id === "like");
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
            onToggleLike={
              canLikeLive
                ? () => {
                    void setLiked(!likedByMe);
                  }
                : undefined
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
                  {action.id === "reply" && externalReplyUrl ? (
                    <a
                      className="social-post-row__filing-action"
                      href={externalReplyUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={externalReplyLabel}
                      aria-label={externalReplyLabel}
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
                    <button
                      type="button"
                      className={[
                        "social-post-row__filing-action",
                        action.id === "unlike" || action.id === "unsave"
                          ? "social-post-row__filing-action--danger"
                          : null,
                        action.id === "like" && likedByMe
                          ? "social-post-row__filing-action--active"
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={
                        Boolean(action.disabledReason) ||
                        ((action.id === "like" || action.id === "unlike") &&
                          likeBusy) ||
                        (action.id === "edit" && (editBusy || editing))
                      }
                      title={
                        action.disabledReason ??
                        (action.id === "url"
                          ? urlCopied
                            ? "Copied"
                            : post.permalink?.trim()
                              ? "Copy post URL"
                              : "Copy BacksterOS URL"
                          : action.id === "like" || action.id === "unlike"
                            ? (likeError ?? undefined)
                            : action.id === "edit"
                              ? (editError ?? "Edit post text")
                              : undefined)
                      }
                      aria-busy={
                        (action.id === "like" || action.id === "unlike") &&
                        likeBusy
                          ? true
                          : undefined
                      }
                      onClick={() => {
                        void onFilingAction(action.id);
                      }}
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
                        {action.id === "url" && urlCopied
                          ? "Copied"
                          : action.label}
                      </span>
                    </button>
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
