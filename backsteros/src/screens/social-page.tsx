import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import {
  EntityDetailOverlay,
  RegisterPageTitle,
  SocialDashboardView,
  SocialDiscoverPanel,
  SocialPostDetailView,
  getSelectedSocialNavIdFromPathname,
  getSelectedSocialPostIdFromPathname,
  getSelectedSocialProfileHandleFromPathname,
  getSocialFeedPlatformFromPathname,
  getSocialMockPostById,
  getSocialMockProfileByHandle,
  getSocialSidePanelSelectionLabel,
  routeCopy,
  socialMockProfileDisplayName,
  type SocialMockAccountKind,
  type SocialMockAnalyticsPlatformFilterId,
  type SocialMockPost,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  useKeepAliveActive,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import { createSocialPlannedPostsClient } from "../lib/social/social-planned-posts-client";
import { useDesktopSectionBreadcrumb } from "../lib/use-desktop-breadcrumb";
import { navigateToHref } from "../router/navigate-href";

const SOCIAL_DISCOVER_PANEL_WIDTH_KEY = "social-discover-panel-width";

export function SocialPage() {
  const active = useKeepAliveActive();
  if (!active) return null;
  return <SocialPageBody />;
}

function SocialPageBody() {
  const { pathname, searchStr } = useShellLocation();
  const navigate = useNavigate();
  const { client } = useDesktopApi();
  const keepAliveActive = useKeepAliveActive();
  const plannedPostsClient = useMemo(
    () => createSocialPlannedPostsClient(client),
    [client],
  );
  const [discoverCollapsed, setDiscoverCollapsed] = useState(false);
  const [inspectPost, setInspectPost] = useState<SocialMockPost | null>(null);
  const [accountKind, setAccountKind] =
    useState<SocialMockAccountKind>("personal");
  const platformFromPath = getSocialFeedPlatformFromPathname(pathname);
  const [platform, setPlatform] =
    useState<SocialMockAnalyticsPlatformFilterId>(
      platformFromPath ?? "all",
    );
  const handleNavigateHref = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );
  const postId = getSelectedSocialPostIdFromPathname(pathname);
  const post = postId ? getSocialMockPostById(postId) : null;
  const profileHandle = getSelectedSocialProfileHandleFromPathname(pathname);
  const profileFromHandle = profileHandle
    ? getSocialMockProfileByHandle(profileHandle)
    : null;
  const navId = getSelectedSocialNavIdFromPathname(pathname);

  useEffect(() => {
    if (platformFromPath) setPlatform(platformFromPath);
  }, [platformFromPath]);
  const sectionTitle = post
    ? post.authorName
    : profileFromHandle
      ? socialMockProfileDisplayName(profileFromHandle)
      : navId === "home"
        ? routeCopy.social.title
        : getSocialSidePanelSelectionLabel(navId);

  useDesktopSectionBreadcrumb(
    post
      ? [
          { label: "Network", href: "/social" },
          { label: "Post", href: pathname },
        ]
      : profileHandle
        ? [
            { label: "Network", href: "/social" },
            { label: "Profile", href: "/social/profile" },
            { label: sectionTitle, href: pathname },
          ]
        : [
            { label: "Network", href: "/social" },
            ...(navId === "home"
              ? []
              : [{ label: sectionTitle, href: pathname }]),
          ],
  );

  const hideDiscover = useCallback(() => setDiscoverCollapsed(true), []);
  const showDiscover = useCallback(() => setDiscoverCollapsed(false), []);
  const clearInspectPost = useCallback(() => setInspectPost(null), []);
  const handleInspectPost = useCallback((next: SocialMockPost) => {
    setInspectPost(next);
    setDiscoverCollapsed(false);
  }, []);
  const discoverHidden = navId === "analytics";

  useEffect(() => {
    setInspectPost(null);
  }, [pathname, accountKind]);

  return (
    <>
      <RegisterPageTitle
        active={keepAliveActive}
        href={pathname}
        title={sectionTitle}
      />
      <SocialDashboardView
        pathname={pathname}
        searchStr={searchStr}
        platform={platform}
        onPlatformChange={setPlatform}
        accountKind={accountKind}
        onAccountKindChange={setAccountKind}
        onInspectPost={handleInspectPost}
        onNavigateHref={handleNavigateHref}
        plannedPostsClient={plannedPostsClient}
        discoverCollapsed={discoverHidden || discoverCollapsed}
        discoverPanel={
          discoverHidden ? null : (
            <EntityDetailOverlay
              open
              collapsed={discoverCollapsed}
              title={inspectPost ? "Post" : "Discover"}
              entityLabel={inspectPost ? "post" : "discover"}
              overlayDataKey="social-discover"
              panelWidthStorageKey={SOCIAL_DISCOVER_PANEL_WIDTH_KEY}
              onHide={hideDiscover}
              onShow={showDiscover}
            >
              {inspectPost ? (
                <SocialPostDetailView
                  post={inspectPost}
                  layout="panel"
                  onClose={clearInspectPost}
                />
              ) : (
                <SocialDiscoverPanel
                  platform={platform}
                  accountKind={accountKind}
                />
              )}
            </EntityDetailOverlay>
          )
        }
      />
    </>
  );
}
