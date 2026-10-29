import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import type { SocialSettings } from "@backsteros/contracts";
import {
  EntityDetailOverlay,
  RegisterPageTitle,
  SocialDashboardView,
  SocialDiscoverPanel,
  SocialPostDetailView,
  getSelectedSocialNavIdFromPathname,
  getSelectedSocialPostIdFromPathname,
  getSelectedSocialProfileHandleFromPathname,
  getSocialFeedAccountKindFromSearch,
  getSocialFeedHref,
  getSocialFeedPathname,
  getSocialFeedPlatformFromPathname,
  getSocialFeedPlatformFromSearch,
  getSocialFeedTabFromSearch,
  getSocialMockPostById,
  getSocialMockProfileByHandle,
  getSocialSidePanelSelectionLabel,
  isLiveSocialFeedPostId,
  routeCopy,
  socialMockProfileDisplayName,
  type SocialConnectedAccountAvatar,
  type SocialFeedPlatformFilterId,
  type SocialMockPost,
} from "@backsteros/ui";

import { useDesktopApi } from "../lib/api-context";
import {
  useKeepAliveActive,
  useShellLocation,
} from "../lib/shell-route-keep-alive";
import { createSocialFeedPostsClient } from "../lib/social/social-feed-posts-client";
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
  const feedPostsClient = useMemo(
    () => createSocialFeedPostsClient(client),
    [client],
  );
  const [discoverCollapsed, setDiscoverCollapsed] = useState(false);
  const [inspectPost, setInspectPost] = useState<SocialMockPost | null>(null);
  const inspectPostRef = useRef(inspectPost);
  inspectPostRef.current = inspectPost;
  const [connectedAccounts, setConnectedAccounts] = useState<
    SocialConnectedAccountAvatar[]
  >([]);
  const accountKind = getSocialFeedAccountKindFromSearch(searchStr);
  const platformFromPath = getSocialFeedPlatformFromPathname(pathname);
  const platformFromSearch = getSocialFeedPlatformFromSearch(searchStr);
  const platform: SocialFeedPlatformFilterId =
    platformFromPath ?? platformFromSearch ?? "all";
  const feedTab = getSocialFeedTabFromSearch(searchStr);
  const handleNavigateHref = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );
  const handleAccountKindChange = useCallback(
    (next: typeof accountKind) => {
      navigateToHref(
        navigate,
        getSocialFeedHref({
          pathname: getSocialFeedPathname(platform),
          searchStr,
          tab: feedTab,
          accountKind: next,
        }),
      );
    },
    [feedTab, navigate, platform, searchStr],
  );
  const handlePlatformChange = useCallback(
    (next: SocialFeedPlatformFilterId) => {
      navigateToHref(
        navigate,
        getSocialFeedHref({
          platform: next,
          searchStr,
          tab: feedTab,
          accountKind,
        }),
      );
    },
    [accountKind, feedTab, navigate, searchStr],
  );
  const postId = getSelectedSocialPostIdFromPathname(pathname);
  const mockPost = postId ? getSocialMockPostById(postId) : null;
  const [livePost, setLivePost] = useState<SocialMockPost | null>(null);
  const post = mockPost ?? livePost;
  const profileHandle = getSelectedSocialProfileHandleFromPathname(pathname);
  const profileFromHandle = profileHandle
    ? getSocialMockProfileByHandle(profileHandle)
    : null;
  const navId = getSelectedSocialNavIdFromPathname(pathname);
  const onPostDetail = Boolean(postId);

  useEffect(() => {
    if (!postId || !isLiveSocialFeedPostId(postId) || mockPost) {
      setLivePost(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await feedPostsClient.list({
          platform: "linkedin",
          accountKind,
        });
        if (cancelled) return;
        setLivePost(rows.find((row) => row.id === postId) ?? null);
      } catch {
        if (!cancelled) setLivePost(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountKind, feedPostsClient, mockPost, postId]);

  const sectionTitle = onPostDetail
    ? (post?.authorName ?? "Post")
    : profileFromHandle
      ? socialMockProfileDisplayName(profileFromHandle)
      : navId === "home"
        ? routeCopy.social.title
        : getSocialSidePanelSelectionLabel(navId);

  const networkHref = getSocialFeedHref({
    platform,
    accountKind,
    tab: feedTab,
  });

  useDesktopSectionBreadcrumb(
    onPostDetail
      ? [
          { label: "Network", href: networkHref },
          { label: "Post", href: pathname },
        ]
      : profileHandle
        ? [
            { label: "Network", href: networkHref },
            { label: "Profile", href: "/social/profile" },
            { label: sectionTitle, href: pathname },
          ]
        : [
            { label: "Network", href: networkHref },
            ...(navId === "home"
              ? []
              : [{ label: sectionTitle, href: pathname }]),
          ],
  );

  const hideDiscover = useCallback(() => setDiscoverCollapsed(true), []);
  const showDiscover = useCallback(() => setDiscoverCollapsed(false), []);
  const clearInspectPost = useCallback(() => setInspectPost(null), []);
  const handleInspectPost = useCallback((next: SocialMockPost) => {
    // Same post again → close (calendar / tray toggle).
    if (inspectPostRef.current?.id === next.id) {
      setInspectPost(null);
      return;
    }
    setInspectPost(next);
    setDiscoverCollapsed(false);
  }, []);
  const discoverHidden = navId === "analytics";

  useEffect(() => {
    setInspectPost(null);
  }, [pathname, accountKind]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await client.requestJson<SocialSettings>(
          "/api/v1/settings/social",
        );
        if (cancelled) return;
        setConnectedAccounts(
          (settings.accounts ?? []).map((account) => ({
            platform: account.platform,
            avatarUrl: account.avatarUrl,
            handle: account.handle,
            displayName: account.displayName,
            url: account.url,
            bio: account.bio,
            followersCount: account.followersCount,
            disconnected: account.disconnected,
          })),
        );
      } catch {
        if (!cancelled) setConnectedAccounts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client]);

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
        onPlatformChange={handlePlatformChange}
        accountKind={accountKind}
        onAccountKindChange={handleAccountKindChange}
        onInspectPost={handleInspectPost}
        onNavigateHref={handleNavigateHref}
        plannedPostsClient={plannedPostsClient}
        feedPostsClient={feedPostsClient}
        connectedAccounts={connectedAccounts}
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
                  connectedAccounts={connectedAccounts}
                />
              )}
            </EntityDetailOverlay>
          )
        }
      />
    </>
  );
}
