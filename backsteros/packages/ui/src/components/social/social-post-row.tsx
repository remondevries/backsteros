"use client";

import type { ReactNode } from "react";
import {
  PencilIcon,
  TrashIcon,
  UploadIcon,
} from "@primer/octicons-react";

import type {
  SocialMockPost,
  SocialMockPostPlatform,
} from "../../social/social-mock-data.js";
import {
  getSocialPostHref,
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
};

const FILING_ACTIONS: readonly FilingAction[] = [
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
  },
  {
    id: "archive",
    label: "Archive",
    icon: <SocialArchiveIcon size={18} />,
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
};

function postAbsoluteUrl(postId: string): string {
  const path = getSocialPostHref(postId);
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
}: SocialPostRowProps) {
  const isDraft = variant === "draft";
  const postFilingActions = filingActionsFor(variant);

  async function onFilingAction(id: SocialPostFilingActionId) {
    if (id !== "url") return;
    const url = postAbsoluteUrl(post.id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Demo mock — clipboard may be unavailable.
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
            post={post}
            interactive={!isDraft}
            variant={isDraft ? "draft" : "post"}
            draftPlatforms={
              draftPlatforms as readonly SocialMockPostPlatform[]
            }
          />
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
                  <button
                    type="button"
                    className={[
                      "social-post-row__filing-action",
                      action.id === "unlike" || action.id === "unsave"
                        ? "social-post-row__filing-action--danger"
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
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
                      {action.label}
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
