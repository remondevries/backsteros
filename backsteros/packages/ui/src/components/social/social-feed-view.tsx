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
import {
  collectSocialMediaFiles,
  createComposerDraftMedia,
  fileToBase64DataUrl,
  isRevocableMediaPreviewUrl,
  revokeComposerDraftMedia,
  type SocialComposerDraftMedia,
} from "../../social/social-composer-media.js";
import {
  resolveSocialComposerAvatarUrl,
  type SocialConnectedAccountAvatar,
} from "../../social/social-connected-account-avatar.js";
import type {
  SocialPlannedPostRecord,
  SocialPlannedPostsClient,
} from "../../social/social-planned-posts.js";
import {
  isLiveSocialFeedPlatform,
  isLiveSocialFeedPostId,
  type SocialFeedPostsClient,
} from "../../social/social-feed-posts.js";
import type { SocialPendingPlanMedia } from "./social-planned-view.js";
import {
  SOCIAL_PLATFORM_NAV_ITEMS,
  getSelectedSocialNavIdFromPathname,
  getSelectedSocialPostIdFromPathname,
  getSelectedSocialProfileHandleFromPathname,
  getSocialFeedHref,
  getSocialFeedPlatformFromPathname,
  getSocialFeedPlatformFromSearch,
  getSocialFeedTabFromSearch,
  getSocialSidePanelSelectionLabel,
  type SocialFeedPlatformFilterId,
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
import { SocialMediaLightbox } from "./social-media-lightbox.js";
import {
  SocialPlannedView,
  planTargetsAllPlatforms,
  type SocialPendingPlan,
} from "./social-planned-view.js";
import { SocialPostDetailView } from "./social-post-detail-view.js";
import { SocialPostRow } from "./social-post-row.js";
import { SocialProfileView } from "./social-profile-view.js";

type SocialMediaLightboxState = {
  src: string;
  kind: "image" | "video";
  alt: string;
  sourceRect: DOMRect;
};

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
  /** Live inbox posts for platforms with a provider feed (LinkedIn first). */
  feedPostsClient?: SocialFeedPostsClient | null;
  /** Connected owned accounts (Zernio sync) — used for LinkedIn composer avatars. */
  connectedAccounts?: readonly SocialConnectedAccountAvatar[];
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

const LINKEDIN_LIKED_UNAVAILABLE = {
  title: "Liked posts aren’t available for LinkedIn",
  copy: "LinkedIn doesn’t let apps read the posts you’ve liked (no member likes/history API). You can still like from Network; this tab can’t list them from LinkedIn.",
} as const;

const LINKEDIN_SAVED_UNAVAILABLE = {
  title: "Saved posts aren’t available for LinkedIn",
  copy: "LinkedIn doesn’t let apps read My Items / saved posts. Network can show how often others save your posts; this tab can’t list what you’ve saved.",
} as const;

function recordToPendingPlan(record: SocialPlannedPostRecord): SocialPendingPlan {
  return {
    id: record.id,
    body: record.body,
    accountKind: record.accountKind,
    platforms: record.platforms,
    media: record.media.map((item) => ({
      id: item.id,
      kind: item.kind,
      previewUrl: item.url,
    })),
  };
}

async function draftMediaToUploads(draftMedia: readonly SocialComposerDraftMedia[]) {
  const uploads = [];
  for (const item of draftMedia) {
    if (!item.file) continue;
    uploads.push({
      data: await fileToBase64DataUrl(item.file),
      contentType: item.file.type || undefined,
      filename: item.file.name || undefined,
      kind: item.kind,
    });
  }
  return uploads;
}

function draftMediaFromPlanMedia(
  media: readonly SocialPendingPlanMedia[] | undefined,
): SocialComposerDraftMedia[] {
  if (!media?.length) return [];
  return media.map((item) => ({
    localId: item.id,
    kind: item.kind,
    previewUrl: item.previewUrl,
    persistedId: item.id,
  }));
}

function mediaPreviewIsUsable(url: string): boolean {
  return url.startsWith("blob:") || url.startsWith("data:");
}

async function hydratePendingPlanMedia(
  plan: SocialPendingPlan,
  downloadMedia: SocialPlannedPostsClient["downloadMedia"] | undefined,
): Promise<SocialPendingPlan> {
  if (!plan.media?.length || !downloadMedia) return plan;
  const media = await Promise.all(
    plan.media.map(async (item) => {
      if (mediaPreviewIsUsable(item.previewUrl)) return item;
      try {
        const blob = await downloadMedia(plan.id, item.id);
        return {
          ...item,
          previewUrl: URL.createObjectURL(blob),
        };
      } catch {
        return item;
      }
    }),
  );
  return { ...plan, media };
}

/** Keep local paste/drop previews when core didn't persist (or can't download) media yet. */
function mergeLocalMediaFallback(
  plan: SocialPendingPlan,
  localMedia: readonly SocialComposerDraftMedia[],
): SocialPendingPlan {
  if (localMedia.length === 0) return plan;
  const hasUsablePreview = (plan.media ?? []).some((item) =>
    mediaPreviewIsUsable(item.previewUrl),
  );
  if (hasUsablePreview) return plan;
  return {
    ...plan,
    media: localMedia.map((item) => ({
      id: item.persistedId ?? item.localId,
      kind: item.kind,
      previewUrl: item.previewUrl,
    })),
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
  feedPostsClient = null,
  connectedAccounts = [],
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
  const composerAvatarUrl = useMemo(
    () =>
      resolveSocialComposerAvatarUrl({
        feedPlatform: platform,
        accountKind,
        connectedAccounts,
        fallbackAvatarUrl: composerProfile.avatarUrl,
      }),
    [accountKind, composerProfile.avatarUrl, connectedAccounts, platform],
  );
  const ownedPlatforms = useMemo(
    () => getSocialMockPlatformIdsForAccount(accountKind),
    [accountKind],
  );
  const platformOptions = useMemo(
    () => platformOptionsFor(ownedPlatforms),
    [ownedPlatforms],
  );
  const [draft, setDraft] = useState("");
  const [draftMedia, setDraftMedia] = useState<SocialComposerDraftMedia[]>([]);
  const [composerDropActive, setComposerDropActive] = useState(false);
  const [mediaLightbox, setMediaLightbox] =
    useState<SocialMediaLightboxState | null>(null);
  const [pendingPlans, setPendingPlans] = useState<SocialPendingPlan[]>([]);
  const [scheduledPlans, setScheduledPlans] = useState<SocialPlannedPostRecord[]>(
    [],
  );
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [postTargets, setPostTargets] = useState<readonly SocialPlatformNavId[]>(
    () => [...ownedPlatforms],
  );
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerDropDepthRef = useRef(0);
  const draftMediaRef = useRef(draftMedia);
  draftMediaRef.current = draftMedia;
  const plannedPostsClientRef = useRef(plannedPostsClient);
  plannedPostsClientRef.current = plannedPostsClient;
  /** When editing a tray chip, Plan updates this id instead of creating a duplicate. */
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const editingPlanIdRef = useRef<string | null>(null);
  editingPlanIdRef.current = editingPlanId;

  useEffect(() => {
    return () => {
      revokeComposerDraftMedia(draftMediaRef.current);
    };
  }, []);

  const clearDraftMedia = useCallback(() => {
    setDraftMedia((current) => {
      revokeComposerDraftMedia(current);
      return [];
    });
  }, []);

  const appendDraftMediaFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    setDraftMedia((current) => {
      const next = [...current];
      for (const file of files) {
        if (next.length >= 5) break;
        const created = createComposerDraftMedia(file);
        if (created) next.push(created);
      }
      return next;
    });
  }, []);

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
        const pending = await Promise.all(
          rows
            .filter((row) => row.scheduledAt == null)
            .map((row) =>
              hydratePendingPlanMedia(
                recordToPendingPlan(row),
                client.downloadMedia,
              ),
            ),
        );
        if (cancelled) return;
        setPendingPlans(pending);
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
    const mediaSnapshot = draftMedia;
    if (!body && mediaSnapshot.length === 0) return;
    const platforms =
      platform === "all"
        ? postTargets
        : ([platform] as readonly SocialPlatformNavId[]);
    if (platforms.length === 0) return;

    const client = plannedPostsClientRef.current;
    const editingId = editingPlanIdRef.current;
    const mediaUploads = await draftMediaToUploads(mediaSnapshot);
    const mediaUploadsOrOmit =
      mediaUploads.length > 0 ? mediaUploads : undefined;

    if (client) {
      try {
        setScheduleError(null);
        const saved = editingId
          ? await client.update(editingId, {
              body,
              accountKind,
              platforms,
              scheduledAt: null,
              mediaUploads: mediaUploadsOrOmit,
            })
          : await client.create({
              body,
              accountKind,
              platforms,
              scheduledAt: null,
              mediaUploads: mediaUploadsOrOmit,
            });
        const hydrated = mergeLocalMediaFallback(
          await hydratePendingPlanMedia(
            recordToPendingPlan(saved),
            client.downloadMedia,
          ),
          mediaSnapshot,
        );
        const keptLocalPreviews = (hydrated.media ?? []).some(
          (item) =>
            mediaSnapshot.some(
              (local) => local.previewUrl === item.previewUrl,
            ) && mediaPreviewIsUsable(item.previewUrl),
        );
        setEditingPlanId(null);
        setPendingPlans((current) => [
          hydrated,
          ...current.filter((entry) => entry.id !== saved.id),
        ]);
        setDraft("");
        if (keptLocalPreviews) {
          // Tray now owns these blob URLs — don't revoke them.
          setDraftMedia([]);
        } else {
          clearDraftMedia();
        }
        selectTab("planned");
        return;
      } catch (error) {
        // Don't invent local tray ids when core is available — scheduling
        // those later PATCHes a missing id and shows "Planned post not found".
        setScheduleError(
          error instanceof Error
            ? error.message
            : "Could not save planned post.",
        );
        selectTab("planned");
        return;
      }
    }

    const localId = editingId ?? `plan-${Date.now()}`;
    setEditingPlanId(null);
    setPendingPlans((current) => [
      {
        id: localId,
        body,
        accountKind,
        platforms,
        media: mediaSnapshot.map((item) => ({
          id: item.persistedId ?? item.localId,
          kind: item.kind,
          previewUrl: item.previewUrl,
        })),
      },
      ...current.filter((entry) => entry.id !== localId),
    ]);
    // Keep blob URLs alive for tray thumbs — don't revoke after local Plan.
    setDraftMedia([]);
    setDraft("");
    selectTab("planned");
  }

  function editPendingPlan(plan: SocialPendingPlan) {
    // Clicking the already-selected chip clears edit mode so the user can compose anew.
    if (editingPlanIdRef.current === plan.id) {
      setEditingPlanId(null);
      setDraft("");
      clearDraftMedia();
      requestAnimationFrame(() => {
        composerInputRef.current?.focus();
      });
      return;
    }

    // Prefer the live tray entry so media previews stay in sync after Plan.
    const latest =
      pendingPlans.find((entry) => entry.id === plan.id) ?? plan;

    const planOwned = getSocialMockPlatformIdsForAccount(latest.accountKind);
    const targets = latest.platforms.filter((entry) =>
      planOwned.includes(entry),
    ) as SocialPlatformNavId[];
    setEditingPlanId(latest.id);
    setDraft(latest.body);
    setDraftMedia((current) => {
      revokeComposerDraftMedia(current);
      return draftMediaFromPlanMedia(latest.media);
    });
    if (latest.accountKind !== accountKind) {
      setAccountKind(latest.accountKind);
    }
    if (
      targets.length === 1 &&
      !planTargetsAllPlatforms(latest.platforms, planOwned)
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
      setEditingPlanId((current) => (current === id ? null : current));
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
    async (
      plan: SocialPendingPlan,
      scheduledAt: Date,
    ): Promise<SocialPlannedPostRecord | null> => {
      const iso = scheduledAt.toISOString();
      setScheduleError(null);
      setEditingPlanId((current) => (current === plan.id ? null : current));
      setPendingPlans((current) =>
        current.filter((entry) => entry.id !== plan.id),
      );
      const client = plannedPostsClientRef.current;
      if (!client) {
        const local: SocialPlannedPostRecord = {
          id: plan.id,
          body: plan.body,
          accountKind: plan.accountKind,
          platforms: plan.platforms,
          media: (plan.media ?? []).map((item) => ({
            id: item.id,
            kind: item.kind,
            url: item.previewUrl,
            contentType: item.kind === "video" ? "video/mp4" : "image/jpeg",
          })),
          scheduledAt: iso,
          createdAt: iso,
          updatedAt: iso,
        };
        setScheduledPlans((current) => [
          local,
          ...current.filter((entry) => entry.id !== plan.id),
        ]);
        return local;
      }
      try {
        let updated: SocialPlannedPostRecord;
        try {
          updated = await client.update(plan.id, { scheduledAt: iso });
        } catch (error) {
          // Tray chip was never persisted (local/mock id) — create scheduled.
          const notFound =
            typeof error === "object" &&
            error !== null &&
            "status" in error &&
            (error as { status?: number }).status === 404;
          if (!notFound) throw error;
          updated = await client.create({
            body: plan.body,
            accountKind: plan.accountKind,
            platforms: plan.platforms,
            scheduledAt: iso,
          });
        }
        setScheduledPlans((current) => [
          updated,
          ...current.filter(
            (entry) => entry.id !== updated.id && entry.id !== plan.id,
          ),
        ]);
        return updated;
      } catch (error) {
        setPendingPlans((current) => [plan, ...current]);
        setScheduleError(
          error instanceof Error
            ? error.message
            : "Could not schedule post with LinkedIn.",
        );
        return null;
      }
    },
    [],
  );

  const reschedulePersistedPlan = useCallback(
    async (id: string, scheduledAt: Date) => {
      const iso = scheduledAt.toISOString();
      setScheduleError(null);
      let previous: SocialPlannedPostRecord | null = null;
      setScheduledPlans((current) => {
        previous = current.find((entry) => entry.id === id) ?? null;
        return current.map((entry) =>
          entry.id === id
            ? { ...entry, scheduledAt: iso, updatedAt: iso }
            : entry,
        );
      });
      const client = plannedPostsClientRef.current;
      if (!client) return;
      try {
        const updated = await client.update(id, { scheduledAt: iso });
        setScheduledPlans((current) =>
          current.map((entry) => (entry.id === id ? updated : entry)),
        );
      } catch (error) {
        if (previous) {
          const restored = previous;
          setScheduledPlans((current) =>
            current.map((entry) => (entry.id === id ? restored : entry)),
          );
        }
        setScheduleError(
          error instanceof Error
            ? error.message
            : "Could not reschedule post with LinkedIn.",
        );
      }
    },
    [],
  );

  const unschedulePlan = useCallback(async (plan: SocialPendingPlan) => {
    setScheduleError(null);
    let previous: SocialPlannedPostRecord | null = null;
    setScheduledPlans((current) => {
      previous = current.find((entry) => entry.id === plan.id) ?? null;
      return current.filter((entry) => entry.id !== plan.id);
    });
    setPendingPlans((current) => [
      plan,
      ...current.filter((entry) => entry.id !== plan.id),
    ]);
    const client = plannedPostsClientRef.current;
    if (!client) return;
    try {
      await client.update(plan.id, { scheduledAt: null });
    } catch (error) {
      if (previous) {
        const restored = previous;
        setScheduledPlans((current) => [
          restored,
          ...current.filter((entry) => entry.id !== plan.id),
        ]);
        setPendingPlans((current) =>
          current.filter((entry) => entry.id !== plan.id),
        );
      }
      setScheduleError(
        error instanceof Error
          ? error.message
          : "Could not unschedule post with LinkedIn.",
      );
    }
  }, []);

  const useLiveLinkedInFeed =
    tab === "inbox" && isLiveSocialFeedPlatform(platform);
  const [livePosts, setLivePosts] = useState<SocialMockPost[]>([]);
  const [liveFeedStatus, setLiveFeedStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [liveFeedError, setLiveFeedError] = useState<string | null>(null);
  const [liveFeedNonce, setLiveFeedNonce] = useState(0);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** Survives leaving the list so `/social/post/:id` can open live Zernio posts. */
  const livePostByIdRef = useRef(new Map<string, SocialMockPost>());
  const [detailLivePost, setDetailLivePost] = useState<SocialMockPost | null>(
    null,
  );
  const [detailLiveStatus, setDetailLiveStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");

  useEffect(() => {
    if (!useLiveLinkedInFeed) {
      setLivePosts([]);
      setLiveFeedStatus("idle");
      setLiveFeedError(null);
      return;
    }
    const client = feedPostsClient;
    if (!client) {
      setLivePosts([]);
      setLiveFeedStatus("ready");
      setLiveFeedError(null);
      return;
    }
    let cancelled = false;
    // Drop the other accountKind’s rows immediately so Personal/Business
    // never flash each other’s LinkedIn inbox.
    setLivePosts([]);
    setLiveFeedStatus("loading");
    setLiveFeedError(null);
    void (async () => {
      try {
        const rows = await client.list({
          platform: "linkedin",
          accountKind,
        });
        if (cancelled) return;
        livePostByIdRef.current.clear();
        for (const row of rows) {
          livePostByIdRef.current.set(row.id, row);
        }
        setLivePosts(rows);
        setLiveFeedStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setLivePosts([]);
        setLiveFeedStatus("error");
        setLiveFeedError(
          error instanceof Error ? error.message : "Could not load LinkedIn feed",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountKind, feedPostsClient, liveFeedNonce, useLiveLinkedInFeed]);

  useEffect(() => {
    if (!postId || !isLiveSocialFeedPostId(postId)) {
      setDetailLivePost(null);
      setDetailLiveStatus("idle");
      return;
    }
    const cached =
      livePosts.find((row) => row.id === postId) ??
      livePostByIdRef.current.get(postId) ??
      null;
    if (cached) {
      setDetailLivePost(cached);
      setDetailLiveStatus("ready");
      return;
    }
    const client = feedPostsClient;
    if (!client) {
      setDetailLivePost(null);
      setDetailLiveStatus("ready");
      return;
    }
    let cancelled = false;
    setDetailLiveStatus("loading");
    void (async () => {
      try {
        const rows = await client.list({
          platform: "linkedin",
          accountKind,
        });
        if (cancelled) return;
        for (const row of rows) {
          livePostByIdRef.current.set(row.id, row);
        }
        setDetailLivePost(livePostByIdRef.current.get(postId) ?? null);
        setDetailLiveStatus("ready");
      } catch {
        if (cancelled) return;
        setDetailLivePost(null);
        setDetailLiveStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountKind, feedPostsClient, livePosts, postId]);

  async function publishComposerPost() {
    const body = draft.trim();
    if (!body) return;
    if (!isLiveSocialFeedPlatform(platform)) return;
    if (draftMedia.length > 0) {
      setPublishError(
        "Text-only LinkedIn publish for now — remove media, or use Plan.",
      );
      return;
    }
    const client = feedPostsClient;
    if (!client) {
      setPublishError("LinkedIn publish is not available.");
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      await client.publish({
        platform: "linkedin",
        accountKind,
        body,
      });
      setDraft("");
      clearDraftMedia();
      setLiveFeedNonce((value) => value + 1);
      if (tab !== "inbox") selectTab("inbox");
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : "Could not publish to LinkedIn",
      );
    } finally {
      setPublishing(false);
    }
  }

  const posts = useMemo(() => {
    if (tab === "liked") {
      // LinkedIn has no “posts I liked” feed for third-party apps.
      if (platform === "linkedin") return [];
      return getSocialMockLikedPostsForAccount(accountKind, platform);
    }
    if (tab !== "inbox") return [];
    if (useLiveLinkedInFeed) return livePosts;
    return getSocialMockPostsForAccount(accountKind, platform);
  }, [tab, accountKind, platform, useLiveLinkedInFeed, livePosts]);

  if (postId) {
    const liveDetail =
      detailLivePost ??
      livePosts.find((row) => row.id === postId) ??
      livePostByIdRef.current.get(postId) ??
      null;
    if (
      isLiveSocialFeedPostId(postId) &&
      !liveDetail &&
      detailLiveStatus === "loading"
    ) {
      return (
        <div className="social-feed social-feed--placeholder">
          <div className="social-feed__placeholder">
            <h2 className="social-feed__placeholder-title">Loading post…</h2>
            <p className="social-feed__placeholder-copy">
              Fetching this LinkedIn post from your connected account.
            </p>
          </div>
        </div>
      );
    }
    const backPlatform: SocialFeedPlatformFilterId =
      getSocialFeedPlatformFromPathname(pathname) ??
      getSocialFeedPlatformFromSearch(searchStr) ??
      platform;
    return (
      <SocialPostDetailView
        postId={postId}
        // Live Zernio ids aren't in mock data — pass the resolved row (or null).
        post={isLiveSocialFeedPostId(postId) ? liveDetail : undefined}
        backHref={getSocialFeedHref({
          platform: backPlatform,
          accountKind,
          tab,
        })}
        accountKind={accountKind}
        feedPostsClient={feedPostsClient}
      />
    );
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
    tab === "liked" && platform === "linkedin"
      ? LINKEDIN_LIKED_UNAVAILABLE
      : tab === "saved" && platform === "linkedin"
        ? LINKEDIN_SAVED_UNAVAILABLE
        : tab === "inbox"
          ? useLiveLinkedInFeed
            ? liveFeedStatus === "error"
              ? {
                  title: "Couldn’t load LinkedIn",
                  copy:
                    liveFeedError ??
                    "Check Settings → Social, then try LinkedIn again.",
                }
              : liveFeedStatus === "loading"
                ? {
                    title: "Loading LinkedIn…",
                    copy: "Fetching recent posts from the connected account.",
                  }
                : {
                    title: "No LinkedIn posts yet",
                    copy:
                      accountKind === "business"
                        ? "LinkedIn didn’t return company-page posts for this connection. Posts you publish from Network will show up here."
                        : "LinkedIn doesn’t let apps read your personal post history (no r_member_social). Your profile activity on LinkedIn won’t appear here — publish from Network and those posts will.",
                  }
            : {
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
          <div
            className={[
              "social-feed__composer",
              composerDropActive ? "social-feed__composer--drop-active" : null,
            ]
              .filter(Boolean)
              .join(" ")}
            onDragEnter={(event) => {
              if (![...event.dataTransfer.types].includes("Files")) return;
              event.preventDefault();
              composerDropDepthRef.current += 1;
              setComposerDropActive(true);
            }}
            onDragLeave={() => {
              composerDropDepthRef.current = Math.max(
                0,
                composerDropDepthRef.current - 1,
              );
              if (composerDropDepthRef.current === 0) {
                setComposerDropActive(false);
              }
            }}
            onDragOver={(event) => {
              if (![...event.dataTransfer.types].includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(event) => {
              const files = collectSocialMediaFiles(event.dataTransfer);
              if (files.length === 0) return;
              event.preventDefault();
              composerDropDepthRef.current = 0;
              setComposerDropActive(false);
              appendDraftMediaFiles(files);
            }}
            onPaste={(event) => {
              const files = collectSocialMediaFiles(event.clipboardData);
              if (files.length === 0) return;
              event.preventDefault();
              appendDraftMediaFiles(files);
            }}
          >
            <div className="social-feed__composer-avatar" aria-hidden="true">
              {composerAvatarUrl ? (
                <img
                  src={composerAvatarUrl}
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
                    ? "Plan something to schedule… (paste or drop media)"
                    : "What's happening? (paste or drop media)"
                }
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (publishError) setPublishError(null);
                }}
                onPaste={(event) => {
                  const files = collectSocialMediaFiles(event.clipboardData);
                  if (files.length === 0) return;
                  event.preventDefault();
                  // Composer shell also listens for paste — stop bubble or the
                  // same files get attached twice.
                  event.stopPropagation();
                  appendDraftMediaFiles(files);
                }}
                aria-label={
                  tab === "planned" ? "Compose planned post" : "Compose post"
                }
              />
              {draftMedia.length > 0 ? (
                <ul
                  className="social-feed__composer-media"
                  aria-label="Attached media"
                >
                  {draftMedia.map((item) => (
                    <li
                      key={item.localId}
                      className="social-feed__composer-media-item"
                    >
                      <button
                        type="button"
                        className="social-feed__composer-media-open"
                        aria-label={
                          item.kind === "video"
                            ? "View video fullscreen"
                            : "View image fullscreen"
                        }
                        onClick={(event) => {
                          const rect =
                            event.currentTarget.getBoundingClientRect();
                          setMediaLightbox({
                            src: item.previewUrl,
                            kind: item.kind,
                            alt:
                              item.file?.name ||
                              (item.kind === "video" ? "Video" : "Image"),
                            sourceRect: DOMRect.fromRect({
                              x: rect.x,
                              y: rect.y,
                              width: rect.width,
                              height: rect.height,
                            }),
                          });
                        }}
                      >
                        {item.kind === "video" ? (
                          <video
                            className="social-feed__composer-media-thumb"
                            src={item.previewUrl}
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <img
                            className="social-feed__composer-media-thumb"
                            src={item.previewUrl}
                            alt=""
                          />
                        )}
                      </button>
                      <button
                        type="button"
                        className="social-feed__composer-media-remove"
                        aria-label="Remove media"
                        onClick={() => {
                          setDraftMedia((current) => {
                            const next = current.filter(
                              (entry) => entry.localId !== item.localId,
                            );
                            if (
                              !item.persistedId &&
                              isRevocableMediaPreviewUrl(item.previewUrl)
                            ) {
                              URL.revokeObjectURL(item.previewUrl);
                            }
                            return next;
                          });
                        }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="social-feed__composer-actions">
                <SocialComposerPostButton
                  platform={platform}
                  accountKind={accountKind}
                  disabled={
                    publishing || (!draft.trim() && draftMedia.length === 0)
                  }
                  availablePlatforms={ownedPlatforms}
                  postTargets={postTargets}
                  onPostTargetsChange={setPostTargets}
                  action={
                    tab === "planned"
                      ? editingPlanId
                        ? "update"
                        : "plan"
                      : "post"
                  }
                  onSubmit={
                    tab === "planned"
                      ? () => void planComposerPost()
                      : isLiveSocialFeedPlatform(platform)
                        ? () => void publishComposerPost()
                        : undefined
                  }
                />
              </div>
              {publishError ? (
                <p className="social-feed__composer-error" role="alert">
                  {publishError}
                </p>
              ) : null}
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
        <>
          {scheduleError ? (
            <p className="social-feed__composer-error" role="alert">
              {scheduleError}
            </p>
          ) : null}
          <SocialPlannedView
            accountKind={accountKind}
            platform={platform}
            pendingPlans={pendingPlans}
            scheduledPlans={scheduledPlans}
            selectedPendingPlanId={editingPlanId}
            onDismissPendingPlan={(id) => {
              void dismissPendingPlan(id);
            }}
            onEditPendingPlan={editPendingPlan}
            onSchedulePendingPlan={(plan, scheduledAt) =>
              schedulePendingPlan(plan, scheduledAt)
            }
            onReschedulePersistedPlan={(id, scheduledAt) => {
              void reschedulePersistedPlan(id, scheduledAt);
            }}
            onUnschedulePlan={(plan) => {
              void unschedulePlan(plan);
            }}
            onInspectPost={onInspectPost}
          />
        </>
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
              feedPostsClient={feedPostsClient}
              feedAccountKind={accountKind}
              feedPlatform={platform}
              feedTab={tab}
            />
          ))}
        </div>
      )}
      {mediaLightbox ? (
        <SocialMediaLightbox
          src={mediaLightbox.src}
          kind={mediaLightbox.kind}
          alt={mediaLightbox.alt}
          sourceRect={mediaLightbox.sourceRect}
          onClose={() => setMediaLightbox(null)}
        />
      ) : null}
    </div>
  );
}
