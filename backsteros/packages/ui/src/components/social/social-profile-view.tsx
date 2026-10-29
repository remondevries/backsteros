"use client";

import { useMemo, useState } from "react";
import { CalendarIcon, LinkIcon, LocationIcon } from "@primer/octicons-react";

import {
  getSocialMockPostsByAuthorHandle,
  getSocialMockProfileByHandle,
  getSocialMockProfileForAccount,
  SOCIAL_MOCK_POSTS,
  socialMockProfileDisplayName,
  type SocialMockAccountKind,
  type SocialMockAnalyticsPlatformFilterId,
  type SocialMockPost,
  type SocialMockProfile,
} from "../../social/social-mock-data.js";
import { VerifiedBadgeIcon } from "../icons/verified-badge-icon.js";
import { PillNav } from "../shared/pill-nav.js";
import { SocialPostRow } from "./social-post-row.js";

export type SocialProfileTab = "posts" | "replies" | "media" | "likes";

export type SocialProfileViewProps = {
  accountKind?: SocialMockAccountKind;
  /** When set, show that author's profile (from `/social/profile/:handle`). */
  handle?: string | null;
  /** Active feed platform filter — tints identity + tabs like the Network feed. */
  platform?: SocialMockAnalyticsPlatformFilterId;
};

const PROFILE_TABS = [
  { value: "posts" as const, label: "Posts" },
  { value: "replies" as const, label: "Replies" },
  { value: "media" as const, label: "Media" },
  { value: "likes" as const, label: "Likes" },
];

function formatStat(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(value);
}

function isOwnProfile(
  profile: SocialMockProfile,
  accountKind: SocialMockAccountKind,
  handle: string | null | undefined,
): boolean {
  if (!handle?.trim()) return true;
  const owned = getSocialMockProfileForAccount(accountKind);
  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  return (
    profile.handle.toLowerCase() === owned.handle.toLowerCase() ||
    normalized === owned.handle.toLowerCase()
  );
}

function postsForProfile(
  profile: SocialMockProfile,
  own: boolean,
  handle: string | null | undefined,
): SocialMockPost[] {
  if (!own && handle) {
    return getSocialMockPostsByAuthorHandle(handle);
  }
  if (profile.postIds.length > 0) {
    const byId = new Map(SOCIAL_MOCK_POSTS.map((post) => [post.id, post]));
    return profile.postIds
      .map((id) => byId.get(id))
      .filter((post): post is SocialMockPost => post != null);
  }
  return getSocialMockPostsByAuthorHandle(profile.handle);
}

export function SocialProfileView({
  accountKind = "personal",
  handle = null,
  platform = "all",
}: SocialProfileViewProps) {
  const ownedProfile = getSocialMockProfileForAccount(accountKind);
  const profile =
    (handle ? getSocialMockProfileByHandle(handle) : null) ?? ownedProfile;
  const displayName = socialMockProfileDisplayName(profile);
  const own = isOwnProfile(profile, accountKind, handle);
  const [tab, setTab] = useState<SocialProfileTab>("posts");

  const posts = useMemo(
    () => postsForProfile(profile, own, handle),
    [profile, own, handle],
  );

  const mediaPosts = useMemo(
    () => posts.filter((post) => Boolean(post.imageUrl)),
    [posts],
  );

  return (
    <div className="social-feed social-profile" data-platform={platform}>
      <div className="social-profile__scroll">
        <div className="social-profile__hero">
          <div className="social-profile__cover">
            <img
              src={profile.coverUrl}
              alt=""
              className="social-profile__cover-image"
            />
          </div>

          {/*
            Same card+filing column grid as SocialPostRow so identity lines up
            with the feed cards (filing slot reserved on the right).
          */}
          <div className="social-profile__identity-band">
            <div className="social-profile__identity-inner">
              <div className="social-profile__identity">
                <div className="social-profile__avatar-row">
                  <div className="social-profile__avatar">
                    <img
                      src={profile.avatarUrl}
                      alt=""
                      className="social-profile__avatar-image"
                    />
                  </div>
                  {own ? (
                    <button
                      type="button"
                      className="social-profile__edit"
                      disabled
                    >
                      Edit profile
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="social-profile__edit"
                      disabled
                    >
                      Follow
                    </button>
                  )}
                </div>

                <div className="social-profile__names">
                  <h1 className="social-profile__name">
                    {displayName}
                    {profile.verified ? (
                      <span
                        className="social-profile__verified"
                        title="Verified"
                        aria-label="Verified"
                      >
                        <VerifiedBadgeIcon size={18} />
                      </span>
                    ) : null}
                  </h1>
                  <p className="social-profile__handle">@{profile.handle}</p>
                </div>

                <p className="social-profile__bio">{profile.bio}</p>

                <ul
                  className="social-profile__meta"
                  aria-label="Profile details"
                >
                  {profile.location && profile.location !== "—" ? (
                    <li className="social-profile__meta-item">
                      <LocationIcon size={14} />
                      <span>{profile.location}</span>
                    </li>
                  ) : null}
                  {profile.websiteUrl ? (
                    <li className="social-profile__meta-item">
                      <LinkIcon size={14} />
                      <a
                        href={profile.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="social-profile__website"
                      >
                        {profile.websiteLabel}
                      </a>
                    </li>
                  ) : null}
                  <li className="social-profile__meta-item">
                    <CalendarIcon size={14} />
                    <span>{profile.joinedLabel}</span>
                  </li>
                </ul>

                <div className="social-profile__stats">
                  <span className="social-profile__stat">
                    <strong>{formatStat(profile.followingCount)}</strong>{" "}
                    Following
                  </span>
                  <span className="social-profile__stat">
                    <strong>{formatStat(profile.followersCount)}</strong>{" "}
                    Followers
                  </span>
                </div>
              </div>
            </div>
          </div>

          <PillNav
            className="social-feed__tabs social-profile__tabs"
            ariaLabel="Profile sections"
            items={PROFILE_TABS}
            value={tab}
            onChange={setTab}
            slidingIndicator
          />
        </div>

        {tab === "posts" ? (
          <div
            className="social-feed__list"
            role="feed"
            aria-label={own ? "Your posts" : `Posts by @${profile.handle}`}
          >
            {posts.map((post) => (
              <SocialPostRow key={post.id} post={post} />
            ))}
          </div>
        ) : null}

        {tab === "media" ? (
          mediaPosts.length > 0 ? (
            <div
              className="social-feed__list"
              role="feed"
              aria-label="Media posts"
            >
              {mediaPosts.map((post) => (
                <SocialPostRow key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <div className="social-profile__empty">
              <p className="social-profile__empty-title">No media yet</p>
              <p className="social-profile__empty-copy">
                Photos and videos you post will show up here.
              </p>
            </div>
          )
        ) : null}

        {tab === "replies" || tab === "likes" ? (
          <div className="social-profile__empty">
            <p className="social-profile__empty-title">
              {tab === "replies" ? "No replies yet" : "No likes yet"}
            </p>
            <p className="social-profile__empty-copy">
              Static placeholder — {tab} will land here later.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
