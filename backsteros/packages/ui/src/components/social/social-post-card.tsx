"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { HeartIcon, ReplyIcon, SyncIcon } from "@primer/octicons-react";

import { formatRelativeAgeLabel } from "../../shared/format-relative-age.js";
import {
  getSocialMockProfileByHandle,
  type SocialMockPost,
  type SocialMockPostPlatform,
} from "../../social/social-mock-data.js";
import {
  SOCIAL_PLATFORM_NAV_ITEMS,
  getSocialPostHref,
  getSocialProfileHref,
} from "../../social/social-nav.js";
import { ClientLink } from "../../shared/client-link.js";
import {
  CommunicationInstagramKindIcon,
  CommunicationXKindIcon,
} from "../communication/communication-kind-icons.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { DevNullIcon } from "../icons/dev-null-icon.js";
import { FacebookIcon } from "../icons/facebook-icon.js";
import { LinkedInIcon } from "../icons/linkedin-icon.js";
import { VerifiedBadgeIcon } from "../icons/verified-badge-icon.js";

/** Trailing `#tag` run (Instagram caption style), after caption copy. */
const TRAILING_HASHTAG_BLOCK =
  /^(?<caption>[\s\S]*?)(?:\n+|\s{2,}|\s+)(?<tags>(?:#[\p{L}\p{N}_]+)(?:\s+#[\p{L}\p{N}_]+)*)\s*$/u;

function stopCardNavigation(event: MouseEvent | KeyboardEvent) {
  event.stopPropagation();
}

function splitInstagramCaption(body: string): {
  caption: string;
  hashtags: string[];
} {
  const match = body.match(TRAILING_HASHTAG_BLOCK);
  if (!match?.groups) {
    return { caption: body, hashtags: [] };
  }
  const caption = match.groups.caption.trimEnd();
  const hashtags = match.groups.tags.match(/#[\p{L}\p{N}_]+/gu) ?? [];
  if (!caption || hashtags.length === 0) {
    return { caption: body, hashtags: [] };
  }
  return { caption, hashtags };
}

function InstagramPostCaption({
  body,
  defaultExpanded = false,
}: {
  body: string;
  defaultExpanded?: boolean;
}) {
  const { caption, hashtags } = splitInstagramCaption(body);
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (hashtags.length === 0) {
    return <p className="social-post-card__text">{body}</p>;
  }

  return (
    <p className="social-post-card__text social-post-card__text--instagram">
      <span className="social-post-card__caption">{caption}</span>
      {expanded ? (
        <>
          {"\n\n"}
          <span className="social-post-card__hashtags">
            {hashtags.join(" ")}
          </span>
        </>
      ) : (
        <>
          {" "}
          <button
            type="button"
            className="social-post-card__caption-more"
            onClick={(event) => {
              stopCardNavigation(event);
              setExpanded(true);
            }}
            onKeyDown={stopCardNavigation}
          >
            … more
          </button>
        </>
      )}
    </p>
  );
}

export type SocialPostCardProps = {
  post: SocialMockPost;
  /** When false, the card is not a link (e.g. hero on the detail page). */
  interactive?: boolean;
  /** Larger typography / media for the post detail hero. */
  emphasis?: "list" | "detail";
  /** Composer draft — no engagement counts; footer shows target platforms. */
  variant?: "post" | "draft";
  /** Platforms this draft will publish to (draft variant only). */
  draftPlatforms?: readonly SocialMockPostPlatform[];
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

function socialPostPlatformLabel(platform: SocialMockPostPlatform): string {
  return (
    SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === platform)?.label ??
    platform
  );
}

function SocialPostPlatformBadge({
  platform,
}: {
  platform: SocialMockPostPlatform;
}) {
  const label = socialPostPlatformLabel(platform);
  return (
    <span
      className={[
        "social-post-card__platform",
        `social-post-card__platform--${platform}`,
      ].join(" ")}
      title={label}
      aria-label={label}
    >
      {platform === "instagram" ? (
        <CommunicationInstagramKindIcon size={15} />
      ) : null}
      {platform === "x" ? <CommunicationXKindIcon size={15} /> : null}
      {platform === "facebook" ? <FacebookIcon size={15} /> : null}
      {platform === "linkedin" ? <LinkedInIcon size={15} /> : null}
      {platform === "dev-null" ? <DevNullIcon size={15} /> : null}
    </span>
  );
}

export function SocialPostCard({
  post,
  interactive = true,
  emphasis = "list",
  variant = "post",
  draftPlatforms = [],
}: SocialPostCardProps) {
  const age = formatRelativeAgeLabel(post.createdAt);
  const postHref = getSocialPostHref(post.id);
  const profileHref = getSocialProfileHref(post.authorHandle);
  const authorProfile = getSocialMockProfileByHandle(post.authorHandle);
  const followersLabel = formatCount(authorProfile?.followersCount ?? 0);
  const isInstagram = post.platform === "instagram";
  const isDraft = variant === "draft";
  const avatarSize = emphasis === "detail" ? 48 : 40;
  const className = [
    "social-post-card",
    interactive ? "social-post-card--interactive" : null,
    emphasis === "detail" ? "social-post-card--detail" : null,
    isInstagram ? "social-post-card--instagram" : null,
    isDraft ? "social-post-card--draft" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const media = post.imageUrl ? (
    <div className="social-post-card__media">
      <img
        className="social-post-card__media-image"
        src={post.imageUrl}
        alt={post.imageAlt ?? ""}
        width={isInstagram ? 1080 : undefined}
        height={isInstagram ? 1080 : undefined}
        loading="lazy"
        decoding="async"
      />
    </div>
  ) : null;

  return (
    <article className={className} data-platform={post.platform}>
      {interactive ? (
        <ClientLink
          href={postHref}
          className="social-post-card__stretch-link"
          aria-label={`Open post by ${post.authorName}`}
          tabIndex={-1}
        >
          <span className="social-post-card__stretch-link-hit" aria-hidden="true" />
        </ClientLink>
      ) : null}

      <div className="social-post-card__body">
        <header className="social-post-card__top">
          <ClientLink
            href={profileHref}
            className="social-post-card__avatar-link"
            aria-label={`${post.authorName}'s profile`}
            onClick={stopCardNavigation}
          >
            <span className="social-post-card__avatar-wrap">
              <span className="social-post-card__avatar" aria-hidden="true">
                <EntityAvatarIcon size={avatarSize} />
              </span>
              {!isDraft ? (
                <SocialPostPlatformBadge platform={post.platform} />
              ) : null}
            </span>
          </ClientLink>

          <div className="social-post-card__identity">
            <div className="social-post-card__header">
              <ClientLink
                href={profileHref}
                className="social-post-card__name"
                onClick={stopCardNavigation}
              >
                {post.authorName}
                {post.authorVerified ? (
                  <span
                    className="social-post-card__verified"
                    title="Verified"
                    aria-label="Verified"
                  >
                    <VerifiedBadgeIcon size={14} />
                  </span>
                ) : null}
              </ClientLink>
              <ClientLink
                href={profileHref}
                className="social-post-card__handle"
                onClick={stopCardNavigation}
              >
                @{post.authorHandle}
              </ClientLink>
            </div>
            <p className="social-post-card__insights">
              <span>{followersLabel} followers</span>
              {age ? (
                <>
                  <span className="social-post-card__dot" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    Updated{" "}
                    <time
                      dateTime={post.createdAt}
                      title={new Date(post.createdAt).toLocaleString()}
                    >
                      {age}
                    </time>
                  </span>
                </>
              ) : null}
            </p>
          </div>
        </header>

        {/* Instagram feed posts lead with square media, then caption. */}
        {isInstagram ? media : null}
        {isInstagram ? (
          <InstagramPostCaption
            body={post.body}
            defaultExpanded={emphasis === "detail"}
          />
        ) : (
          <p className="social-post-card__text">{post.body}</p>
        )}
        {!isInstagram ? media : null}
        {emphasis === "list" && isDraft && draftPlatforms.length > 0 ? (
          <div
            className="social-post-card__actions social-post-card__draft-platforms"
            role="list"
            aria-label="Draft platforms"
            onClick={stopCardNavigation}
            onKeyDown={stopCardNavigation}
          >
            {draftPlatforms.map((platform) => (
              <span
                key={platform}
                className={[
                  "social-post-card__draft-platform",
                  `social-post-card__draft-platform--${platform}`,
                ].join(" ")}
                role="listitem"
                title={socialPostPlatformLabel(platform)}
                aria-label={socialPostPlatformLabel(platform)}
              >
                {platform === "instagram" ? (
                  <CommunicationInstagramKindIcon size={15} />
                ) : null}
                {platform === "x" ? <CommunicationXKindIcon size={15} /> : null}
                {platform === "facebook" ? <FacebookIcon size={15} /> : null}
                {platform === "linkedin" ? <LinkedInIcon size={15} /> : null}
                {platform === "dev-null" ? <DevNullIcon size={15} /> : null}
              </span>
            ))}
          </div>
        ) : null}
        {emphasis === "list" && !isDraft ? (
          <div
            className="social-post-card__actions"
            role="group"
            aria-label="Post actions"
            onClick={stopCardNavigation}
            onKeyDown={stopCardNavigation}
          >
            <button type="button" className="social-post-card__action" disabled>
              <ReplyIcon size={14} />
              <span>{formatCount(post.replyCount)}</span>
            </button>
            <button type="button" className="social-post-card__action" disabled>
              <SyncIcon size={14} />
              <span>{formatCount(post.repostCount)}</span>
            </button>
            <button type="button" className="social-post-card__action" disabled>
              <HeartIcon size={14} />
              <span>{formatCount(post.likeCount)}</span>
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}
