"use client";

import type { ReactNode } from "react";

import type {
  SocialMockAccountKind,
  SocialMockAnalyticsPlatformFilterId,
  SocialMockPost,
} from "../../social/social-mock-data.js";
import type { SocialPlannedPostsClient } from "../../social/social-planned-posts.js";
import { SocialFeedView } from "./social-feed-view.js";

export type SocialDashboardViewProps = {
  pathname: string;
  searchStr?: string;
  platform?: SocialMockAnalyticsPlatformFilterId;
  onPlatformChange?: (platform: SocialMockAnalyticsPlatformFilterId) => void;
  accountKind?: SocialMockAccountKind;
  onAccountKindChange?: (kind: SocialMockAccountKind) => void;
  /** Right-rail overlay (ContactDetailOverlay Discover panel). Omit on full-bleed pages. */
  discoverPanel?: ReactNode;
  discoverCollapsed?: boolean;
  /** Open a post in the Discover rail (Planned calendar stays mounted). */
  onInspectPost?: (post: SocialMockPost) => void;
  /** Navigate to a feed href so Network tabs survive refresh. */
  onNavigateHref?: (href: string) => void;
  /** Persist Planned posts in core. */
  plannedPostsClient?: SocialPlannedPostsClient | null;
};

/**
 * Network page shell — Messages-style journal split with feed main + Discover rail.
 */
export function SocialDashboardView({
  pathname,
  searchStr = "",
  platform,
  onPlatformChange,
  accountKind = "personal",
  onAccountKindChange,
  discoverPanel = null,
  discoverCollapsed = false,
  onInspectPost,
  onNavigateHref,
  plannedPostsClient = null,
}: SocialDashboardViewProps) {
  const railHidden = discoverCollapsed || discoverPanel == null;

  return (
    <div
      className={[
        "social-dashboard-layout",
        "journal-day-layout",
        "desktop-journal-day-layout",
        railHidden ? "is-calendar-collapsed" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-content-detail
      data-detail-split
      data-calendar-collapsed={railHidden ? "true" : "false"}
    >
      <div className="journal-day-layout__main">
        <SocialFeedView
          pathname={pathname}
          searchStr={searchStr}
          platform={platform}
          onPlatformChange={onPlatformChange}
          accountKind={accountKind}
          onAccountKindChange={onAccountKindChange}
          onInspectPost={onInspectPost}
          onNavigateHref={onNavigateHref}
          plannedPostsClient={plannedPostsClient}
        />
      </div>
      {discoverPanel}
    </div>
  );
}
