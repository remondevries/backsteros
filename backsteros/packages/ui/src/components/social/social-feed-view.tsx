"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getSocialMockLikedPostsForAccount,
  getSocialMockPlatformIdsForAccount,
  getSocialMockPostsForAccount,
  getSocialMockProfileForAccount,
  type SocialMockAccountKind,
  type SocialMockAnalyticsPlatformFilterId,
  type SocialMockPost,
  type SocialMockPostPlatform,
} from "../../social/social-mock-data.js";
import type {
  SocialPlannedPostRecord,
  SocialPlannedPostsClient,
} from "../../social/social-planned-posts.js";
import {
  SOCIAL_PLATFORM_NAV_ITEMS,
  getSelectedSocialNavIdFromPathname,
  getSelectedSocialPostIdFromPathname,
  getSelectedSocialProfileHandleFromPathname,
  getSocialFeedHref,
  getSocialFeedPlatformFromPathname,
  getSocialFeedTabFromSearch,
  getSocialSidePanelSelectionLabel,
  type SocialFeedTabId,
  type SocialPlatformNavId,
} from "../../social/social-nav.js";
import {
  SegmentedPillToggle,
  type SegmentedPillToggleOption,
} from "../list-nav/list-board-view-shell.js";
import { PillNav } from "../shared/pill-nav.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { SocialAnalyticsView } from "./social-analytics-view.js";
import { SocialComposerPostButton } from "./social-composer-post-button.js";
import {
  SocialPlannedView,
  planTargetsAllPlatforms,
  type SocialPendingPlan,
} from "./social-planned-view.js";
import { SocialPostDetailView } from "./social-post-detail-view.js";
import { SocialPostRow } from "./social-post-row.js";
import { SocialProfileView } from "./social-profile-view.js";

export type SocialFeedTab = SocialFeedTabId;

export type SocialFeedViewProps = {
  pathname: string;
  searchStr?: string;
  platform?: SocialMockAnalyticsPlatformFilterId;
  onPlatformChange?: (platform: SocialMockAnalyticsPlatformFilterId) => void;
  accountKind?: SocialMockAccountKind;
  onAccountKindChange?: (kind: SocialMockAccountKind) => void;
  /** Open a post in the Discover rail (Planned calendar stays mounted). */
  onInspectPost?: (post: SocialMockPost) => void;
  /** Navigate to a feed href (`/social?tab=planned`) so tabs survive refresh. */
  onNavigateHref?: (href: string) => void;
  /** Persist Planned posts in core (unscheduled tray + scheduled calendar). */
  plannedPostsClient?: SocialPlannedPostsClient | null;
};

const FEED_TABS: readonly { value: SocialFeedTab; label: string }[] = [
  { value: "inbox", label: "Inbox" },
  { value: "planned", label: "Planned" },
  { value: "liked", label: "Liked" },
  { value: "saved", label: "Saved" },
];

const ACCOUNT_OPTIONS: readonly SegmentedPillToggleOption<SocialMockAccountKind>[] =
  [
    { value: "personal", label: "Personal" },
    { value: "business", label: "Business" },
  ];

function platformOptionsFor(
  platforms: readonly SocialMockPostPlatform[],
): SegmentedPillToggleOption<SocialMockAnalyticsPlatformFilterId>[] {
  return [
    { value: "all", label: "All" },
    ...platforms.map((id) => {
      const item = SOCIAL_PLATFORM_NAV_ITEMS.find((entry) => entry.id === id);
      return {
        value: id as SocialMockAnalyticsPlatformFilterId,
        label:
          id === "x" ? "X" : id === "dev-null" ? "Dev-null" : (item?.label ?? id),
      };
    }),
  ];
}

const EMPTY_COPY: Record<
  Exclude<SocialFeedTab, "inbox">,
  { title: string; copy: string }
> = {
  planned: {
    title: "No planned posts",
    copy: "Scheduled posts will show up here.",
  },
  liked: {
    title: "No liked posts",
    copy: "Posts you like across connected accounts will show up here.",
  },
  saved: {
    title: "No saved posts",
    copy: "Bookmarks and saved posts will show up here.",
  },
};

function recordToPendingPlan(record: SocialPlannedPostRecord): SocialPendingPlan {
  return {
    id: record.id,
    body: record.body,
    accountKind: record.accountKind,
    platforms: record.platforms,
  };
}

export function SocialFeedView({
  pathname,
  searchStr = "",
  platform: platformProp,
  onPlatformChange,
  accountKind: accountKindProp,
  onAccountKindChange,
  onInspectPost,
  onNavigateHref,
  plannedPostsClient = null,
}: SocialFeedViewProps) {
  const postId = getSelectedSocialPostIdFromPathname(pathname);
  const profileHandle = getSelectedSocialProfileHandleFromPathname(pathname);
  const navId = getSelectedSocialNavIdFromPathname(pathname);
  const platformFromPath = getSocialFeedPlatformFromPathname(pathname);
  const tabFromSearch = getSocialFeedTabFromSearch(searchStr);
  const [tabFallback, setTabFallback] = useState<SocialFeedTab>(tabFromSearch);
  const tab = onNavigateHref ? tabFromSearch : tabFallback;
  const [accountKindState, setAccountKindState] =
    useState<SocialMockAccountKind>("personal");
  const accountKind = accountKindProp ?? accountKindState;
  const setAccountKind = onAccountKindChange ?? setAccountKindState;
  const [platformState, setPlatformState] =
    useState<SocialMockAnalyticsPlatformFilterId>(
      platformProp ?? platformFromPath ?? "all",
    );
  const platform = platformProp ?? platformState;
  const setPlatform = onPlatformChange ?? setPlatformState;
  const composerProfile = getSocialMockProfileForAccount(accountKind);
  const ownedPlatforms = useMemo(
    () => getSocialMockPlatformIdsForAccount(accountKind),
    [accountKind],
  );
  const platformOptions = useMemo(
    () => platformOptionsFor(ownedPlatforms),
    [ownedPlatforms],
  );
  const [draft, setDraft] = useState("");
  const [pendingPlans, setPendingPlans] = useState<SocialPendingPlan[]>([]);
  const [scheduledPlans, setScheduledPlans] = useState<SocialPlannedPostRecord[]>(
    [],
  );
  const [postTargets, setPostTargets] = useState<readonly SocialPlatformNavId[]>(
    () => [...ownedPlatforms],
  );
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const plannedPostsClientRef = useRef(plannedPostsClient);
  plannedPostsClientRef.current = plannedPostsClient;
  /** When editing a tray chip, Plan updates this id instead of creating a duplicate. */
  const editingPlanIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (platformProp != null) return;
    if (platformFromPath) setPlatformState(platformFromPath);
  }, [platformFromPath, platformProp]);

  useEffect(() => {
    if (platform !== "all" && !ownedPlatforms.includes(platform)) {
      setPlatform("all");
    }
  }, [ownedPlatforms, platform, setPlatform]);

  useEffect(() => {
    setTabFallback(tabFromSearch);
  }, [tabFromSearch]);

  useEffect(() => {
    const client = plannedPostsClient;
    if (!client) {
      setPendingPlans([]);
      setScheduledPlans([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const rows = await client.list();
        if (cancelled) return;
        setPendingPlans(
          rows
            .filter((row) => row.scheduledAt == null)
            .map(recordToPendingPlan),
        );
        setScheduledPlans(rows.filter((row) => row.scheduledAt != null));
      } catch {
        // Keep any in-session tray items if core isn't serving this route yet.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plannedPostsClient]);

  function selectTab(next: SocialFeedTab) {
    if (onNavigateHref) {
      onNavigateHref(
        getSocialFeedHref({ tab: next, pathname, searchStr }),
      );
      return;
    }
    setTabFallback(next);
  }

  async function planComposerPost() {
    const body = draft.trim();
    if (!body) return;
    const platforms =
      platform === "all"
        ? postTargets
        : ([platform] as readonly SocialPlatformNavId[]);
    if (platforms.length === 0) return;

    const client = plannedPostsClientRef.current;
    const editingId = editingPlanIdRef.current;
    if (client) {
      try {
        const saved = editingId
          ? await client.update(editingId, {
              body,
              accountKind,
              platforms,
              scheduledAt: null,
            })
          : await client.create({
              body,
              accountKind,
              platforms,
              scheduledAt: null,
            });
        editingPlanIdRef.current = null;
        setPendingPlans((current) => [
          recordToPendingPlan(saved),
          ...current.filter((entry) => entry.id !== saved.id),
        ]);
        setDraft("");
        selectTab("planned");
        return;
      } catch {
        // Core may be mid-upgrade (route missing / scopes) — still stage locally.
      }
    }

    const localId = editingId ?? `plan-${Date.now()}`;
    editingPlanIdRef.current = null;
    setPendingPlans((current) => [
      {
        id: localId,
        body,
        accountKind,
        platforms,
      },
      ...current.filter((entry) => entry.id !== localId),
    ]);
    setDraft("");
    selectTab("planned");
  }

  function editPendingPlan(plan: SocialPendingPlan) {
    const planOwned = getSocialMockPlatformIdsForAccount(plan.accountKind);
    const targets = plan.platforms.filter((entry) =>
      planOwned.includes(entry),
    ) as SocialPlatformNavId[];
    editingPlanIdRef.current = plan.id;
    setPendingPlans((current) =>
      current.filter((entry) => entry.id !== plan.id),
    );
    setDraft(plan.body);
    if (plan.accountKind !== accountKind) {
      setAccountKind(plan.accountKind);
    }
    if (
      targets.length === 1 &&
      !planTargetsAllPlatforms(plan.platforms, planOwned)
    ) {
      setPlatform(targets[0]!);
      setPostTargets(targets);
    } else {
      setPlatform("all");
      setPostTargets(
        targets.length > 0
          ? targets
          : ([...planOwned] as SocialPlatformNavId[]),
      );
    }
    requestAnimationFrame(() => {
      const input = composerInputRef.current;
      if (!input) return;
      input.focus();
      const end = input.value.length;
      input.setSelectionRange(end, end);
    });
  }

  const dismissPendingPlan = useCallback(
    async (id: string) => {
      setPendingPlans((current) => current.filter((plan) => plan.id !== id));
      const client = plannedPostsClientRef.current;
      if (!client) return;
      try {
        await client.remove(id);
      } catch {
        // Keep local dismiss; next reload reconciles.
      }
    },
    [],
  );

  const schedulePendingPlan = useCallback(
    async (plan: SocialPendingPlan, scheduledAt: Date) => {
      const iso = scheduledAt.toISOString();
      setPendingPlans((current) =>
        current.filter((entry) => entry.id !== plan.id),
      );
      const client = plannedPostsClientRef.current;
      if (!client) {
        setScheduledPlans((current) => [
          {
            id: plan.id,
            body: plan.body,
            accountKind: plan.accountKind,
            platforms: plan.platforms,
            scheduledAt: iso,
            createdAt: iso,
            updatedAt: iso,
          },
          ...current.filter((entry) => entry.id !== plan.id),
        ]);
        return;
      }
      try {
        const updated = await client.update(plan.id, { scheduledAt: iso });
        setScheduledPlans((current) => [
          updated,
          ...current.filter((entry) => entry.id !== updated.id),
        ]);
      } catch {
        setPendingPlans((current) => [plan, ...current]);
      }
    },
    [],
  );

  const reschedulePersistedPlan = useCallback(
    async (id: string, scheduledAt: Date) => {
      const iso = scheduledAt.toISOString();
      setScheduledPlans((current) =>
        current.map((entry) =>
          entry.id === id
            ? { ...entry, scheduledAt: iso, updatedAt: iso }
            : entry,
        ),
      );
      const client = plannedPostsClientRef.current;
      if (!client) return;
      try {
        const updated = await client.update(id, { scheduledAt: iso });
        setScheduledPlans((current) =>
          current.map((entry) => (entry.id === id ? updated : entry)),
        );
      } catch {
        // Optimistic update already applied; next reload reconciles.
      }
    },
    [],
  );

  const posts = useMemo(() => {
    if (tab === "liked") {
      return getSocialMockLikedPostsForAccount(accountKind, platform);
    }
    if (tab !== "inbox") return [];
    return getSocialMockPostsForAccount(accountKind, platform);
  }, [tab, accountKind, platform]);

  if (postId) {
    return <SocialPostDetailView postId={postId} />;
  }

  if (navId === "analytics") {
    return (
      <SocialAnalyticsView searchStr={searchStr} accountKind={accountKind} />
    );
  }

  if (navId === "profile") {
    return (
      <SocialProfileView
        accountKind={accountKind}
        handle={profileHandle}
        platform={platform}
      />
    );
  }

  if (navId !== "home") {
    const label = getSocialSidePanelSelectionLabel(navId);
    return (
      <div className="social-feed social-feed--placeholder">
        <div className="social-feed__placeholder">
          <h2 className="social-feed__placeholder-title">{label}</h2>
          <p className="social-feed__placeholder-copy">
            Static placeholder — {label} will land here later.
          </p>
        </div>
      </div>
    );
  }

  const empty =
    tab === "inbox"
      ? {
          title: "No posts",
          copy: "Nothing in this feed for the selected platform yet.",
        }
      : EMPTY_COPY[tab];

  return (
    <div
      className={[
        "social-feed",
        tab === "planned" ? "social-feed--planned" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      data-platform={platform}
    >
      <div className="social-feed__compose-band">
        <header className="social-feed__chrome social-feed__chrome--toggles">
          <div className="social-feed__chrome-row social-feed__chrome-row--platforms">
            <div className="social-feed__account-toggle">
              <SegmentedPillToggle
                value={accountKind}
                options={ACCOUNT_OPTIONS}
                onChange={(next) => {
                  setAccountKind(next);
                  setPostTargets([
                    ...getSocialMockPlatformIdsForAccount(next),
                  ]);
                }}
                ariaLabel="Account"
              />
            </div>
            <div className="social-feed__platform-toggle">
              <SegmentedPillToggle
                value={platform}
                options={platformOptions}
                onChange={setPlatform}
                ariaLabel="Platform"
              />
            </div>
          </div>
        </header>

        {/* Same card + filing-slot grid as feed rows so composer lines up. */}
        <div className="social-feed__composer-shell">
          <div className="social-feed__composer">
            <div className="social-feed__composer-avatar" aria-hidden="true">
              {composerProfile.avatarUrl ? (
                <img
                  src={composerProfile.avatarUrl}
                  alt=""
                  className="social-feed__composer-avatar-image"
                />
              ) : (
                <EntityAvatarIcon size={40} />
              )}
            </div>
            <div className="social-feed__composer-main">
              <textarea
                ref={composerInputRef}
                className="social-feed__composer-input"
                rows={2}
                placeholder={
                  tab === "planned"
                    ? "Plan something to schedule…"
                    : "What's happening?"
                }
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label={
                  tab === "planned" ? "Compose planned post" : "Compose post"
                }
              />
              <div className="social-feed__composer-actions">
                <SocialComposerPostButton
                  platform={platform}
                  disabled={!draft.trim()}
                  availablePlatforms={ownedPlatforms}
                  postTargets={postTargets}
                  onPostTargetsChange={setPostTargets}
                  action={tab === "planned" ? "plan" : "post"}
                  onSubmit={
                    tab === "planned" ? () => void planComposerPost() : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <PillNav
        className="social-feed__tabs"
        ariaLabel="Post lists"
        items={FEED_TABS}
        value={tab}
        onChange={selectTab}
        slidingIndicator
      />

      {tab === "planned" ? (
        <SocialPlannedView
          accountKind={accountKind}
          platform={platform}
          pendingPlans={pendingPlans}
          scheduledPlans={scheduledPlans}
          onDismissPendingPlan={(id) => {
            void dismissPendingPlan(id);
          }}
          onEditPendingPlan={editPendingPlan}
          onSchedulePendingPlan={(plan, scheduledAt) => {
            void schedulePendingPlan(plan, scheduledAt);
          }}
          onReschedulePersistedPlan={(id, scheduledAt) => {
            void reschedulePersistedPlan(id, scheduledAt);
          }}
          onInspectPost={onInspectPost}
        />
      ) : posts.length === 0 ? (
        <div className="social-feed__empty">
          <p className="social-feed__empty-title">{empty.title}</p>
          <p className="social-feed__empty-copy">{empty.copy}</p>
        </div>
      ) : (
        <div className="social-feed__list" role="feed" aria-label={tab}>
          {posts.map((post) => (
            <SocialPostRow
              key={post.id}
              post={post}
              variant={
                tab === "liked"
                  ? "liked"
                  : tab === "saved"
                    ? "saved"
                    : "post"
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
