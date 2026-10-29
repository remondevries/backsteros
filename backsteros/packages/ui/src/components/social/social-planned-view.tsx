"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { CalendarApi } from "@fullcalendar/core";
import { TrashIcon } from "@primer/octicons-react";

import {
  type TaskCalendarEvent,
  type TaskCalendarPatch,
} from "../../calendar/calendar-events.js";
import { type CalendarViewMode } from "../../calendar/calendar-view-modes.js";
import { resolveCalendarDropAtPoint } from "../../calendar/calendar-task-drag.js";
import {
  useCalendarExternalTaskDrag,
  type ExternalDragPointerEvent,
} from "../../calendar/use-calendar-external-task-drag.js";
import { socialPlatformIcon } from "../../contacts/social-platforms.js";
import {
  getSocialMockPlatformIdsForAccount,
  getSocialMockPlannedPostById,
  getSocialMockPlannedPostsForAccount,
  getSocialMockProfileForAccount,
  socialMockPlannedPostAsFeedPost,
  socialMockProfileDisplayName,
  splitSocialPlannedCaption,
  type SocialMockAccountKind,
  type SocialMockAnalyticsPlatformFilterId,
  type SocialMockPlannedPost,
  type SocialMockPost,
  type SocialMockPostPlatform,
} from "../../social/social-mock-data.js";
import type { SocialPlannedPostRecord } from "../../social/social-planned-posts.js";
import { SOCIAL_PLATFORM_NAV_ITEMS } from "../../social/social-nav.js";
import { ProjectsSidePanelIcon } from "../codebase/projects-side-panel-icon.js";
import { CalendarDateNav } from "../calendar/calendar-date-nav.js";
import { CalendarView } from "../calendar/calendar-view.js";
import { SocialMediaLightbox } from "./social-media-lightbox.js";
import { SocialPlannedTimeModal } from "./social-planned-time-modal.js";

const SOCIAL_PENDING_DRAG_DURATION_MINUTES = 30;
const SOCIAL_PENDING_DRAG_ITEM_SELECTOR = "[data-social-pending-plan-id]";
const SOCIAL_MONTH_DROP_DEFAULT_TIME = "09:00";

type PendingTimePrompt = {
  plan: SocialPendingPlan;
  dateYmd: string;
};

/** Attached image/video on a tray chip (blob preview or authenticated API path). */
export type SocialPendingPlanMedia = {
  id: string;
  kind: "image" | "video";
  previewUrl: string;
};

/** Composer “Plan” result — not on the grid yet (dashed chip at the top). */
export type SocialPendingPlan = {
  id: string;
  body: string;
  accountKind: SocialMockAccountKind;
  platforms: readonly SocialMockPostPlatform[];
  media?: readonly SocialPendingPlanMedia[];
};

export type SocialPlannedViewProps = {
  accountKind: SocialMockAccountKind;
  platform?: SocialMockAnalyticsPlatformFilterId;
  /** Unscheduled plans from the composer — dashed chips in the toolbar. */
  pendingPlans?: readonly SocialPendingPlan[];
  /** Persisted scheduled posts from core (merged with mock seeds). */
  scheduledPlans?: readonly SocialPlannedPostRecord[];
  /** Tray chip currently loaded in the composer (stays visible, highlighted). */
  selectedPendingPlanId?: string | null;
  onDismissPendingPlan?: (id: string) => void;
  /** Load a plan back into the composer for editing. */
  onEditPendingPlan?: (plan: SocialPendingPlan) => void;
  /**
   * Persist schedule when a tray chip lands on the calendar.
   * May return a record with a new id when the tray chip was never in core
   * (schedule creates instead of patching).
   */
  onSchedulePendingPlan?: (
    plan: SocialPendingPlan,
    scheduledAt: Date,
  ) => void | Promise<SocialPlannedPostRecord | null | void>;
  /** Persist reschedule for a core-backed calendar event. */
  onReschedulePersistedPlan?: (id: string, scheduledAt: Date) => void;
  /** Clear schedule and return the post to the unscheduled tray. */
  onUnschedulePlan?: (plan: SocialPendingPlan) => void;
  /** Open post in the Discover rail (keeps the calendar mounted). */
  onInspectPost?: (post: SocialMockPost) => void;
};

export function pendingPlanAsFeedPost(
  plan: SocialPendingPlan,
  scheduledAt?: string | Date | null,
): SocialMockPost {
  const profile = getSocialMockProfileForAccount(plan.accountKind);
  const createdAt =
    scheduledAt instanceof Date
      ? scheduledAt.toISOString()
      : typeof scheduledAt === "string" && scheduledAt.trim()
        ? scheduledAt
        : new Date().toISOString();
  return {
    id: plan.id,
    authorName: socialMockProfileDisplayName(profile),
    authorHandle: profile.handle,
    authorVerified: profile.verified,
    platform: plan.platforms[0] ?? "x",
    targetPlatforms: plan.platforms,
    accountKind: plan.accountKind,
    body: plan.body,
    createdAt,
    replyCount: 0,
    repostCount: 0,
    likeCount: 0,
    feed: "both",
  };
}

const PLATFORM_EVENT_COLORS: Record<
  SocialMockPostPlatform,
  { backgroundColor: string; borderColor: string }
> = {
  facebook: { backgroundColor: "#1877f2", borderColor: "#1877f2" },
  instagram: { backgroundColor: "#e1306c", borderColor: "#e1306c" },
  x: { backgroundColor: "#1a1a1a", borderColor: "#444" },
  linkedin: { backgroundColor: "#0a66c2", borderColor: "#0a66c2" },
  "dev-null": { backgroundColor: "#ff8a4c", borderColor: "#ff8a4c" },
};

function socialPlannedCalendarEventClassNames(
  platforms: readonly SocialMockPostPlatform[],
): string[] {
  const primary = platforms[0];
  const multi = platforms.length > 1;
  return [
    "task-calendar-event",
    "social-planned-calendar-event",
    primary ? `social-planned-calendar-event--${primary}` : null,
    multi ? "social-planned-calendar-event--multi" : null,
  ].filter(Boolean) as string[];
}

function platformLabel(platform: SocialMockPostPlatform): string {
  if (platform === "x") return "X";
  if (platform === "dev-null") return "Dev-null";
  return (
    SOCIAL_PLATFORM_NAV_ITEMS.find((item) => item.id === platform)?.label ??
    platform
  );
}

export function planTargetsAllPlatforms(
  platforms: readonly SocialMockPostPlatform[],
  owned: readonly SocialMockPostPlatform[],
): boolean {
  if (owned.length === 0) return false;
  if (platforms.length < owned.length) return false;
  return owned.every((entry) => platforms.includes(entry));
}

function plannedPostLocalRange(
  post: SocialMockPlannedPost,
  now = new Date(),
): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + post.dayOffset);
  start.setHours(post.startHour, post.startMinute, 0, 0);
  // Short block for week/day grid presence — chip time shows start only.
  const end = new Date(start.getTime() + Math.max(15, post.durationMinutes) * 60_000);
  return { start, end };
}

function plannedPostToCalendarEvent(
  post: SocialMockPlannedPost,
  now = new Date(),
): TaskCalendarEvent {
  const { start, end } = plannedPostLocalRange(post, now);
  const colors = PLATFORM_EVENT_COLORS[post.platform];
  const { caption, hashtags } = splitSocialPlannedCaption(post.body);
  const imageOnly = Boolean(post.imageUrl) && !caption.trim();
  const mediaPreviewUrl = post.imageUrl?.trim() || null;
  return {
    id: post.id,
    title: imageOnly ? "" : caption,
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: false,
    editable: true,
    startEditable: true,
    durationEditable: false,
    displayEventEnd: false,
    classNames: socialPlannedCalendarEventClassNames([post.platform]),
    backgroundColor: colors.backgroundColor,
    borderColor: colors.borderColor,
    extendedProps: {
      entityType: "task",
      taskId: post.id,
      status: "ready_to_start",
      projectName: null,
      socialPlatform: post.platform,
      socialPlatforms: [post.platform],
      socialImageOnly: imageOnly,
      socialMediaPreviewUrl: mediaPreviewUrl,
      socialMediaKind: mediaPreviewUrl ? "image" : null,
      socialHashtags: hashtags.length > 0 ? hashtags : null,
    },
  };
}

function applyTaskPatchToEvent(
  event: TaskCalendarEvent,
  patch: TaskCalendarPatch,
): TaskCalendarEvent {
  const start = patch.dueDate;
  if (!start) return event;
  const end = patch.dueEndDate ?? undefined;
  const allDay = !end || !start.includes("T");
  return {
    ...event,
    start,
    end,
    allDay,
  };
}

/**
 * When the seed set gains/loses ids (tray schedule, unschedule, filter), keep
 * in-calendar drag positions for events that already exist. Replacing the whole
 * array with seed times was wiping local month moves.
 */
function mergeCalendarEventsWithSeed(
  current: readonly TaskCalendarEvent[],
  seed: readonly TaskCalendarEvent[],
): TaskCalendarEvent[] {
  const currentById = new Map(current.map((event) => [event.id, event]));
  return seed.map((seedEvent) => {
    const existing = currentById.get(seedEvent.id);
    if (!existing) return seedEvent;
    return {
      ...seedEvent,
      start: existing.start,
      end: existing.end,
      allDay: existing.allDay,
      displayEventEnd: existing.displayEventEnd,
    };
  });
}

function isSocialCalendarEvent(event: TaskCalendarEvent): boolean {
  if (event.extendedProps.entityType !== "task") return false;
  if (event.extendedProps.socialPlatform) return true;
  return Boolean(
    event.extendedProps.socialPlatforms &&
      event.extendedProps.socialPlatforms.length > 0,
  );
}

/**
 * Month-grid moves arrive as all-day patches (no end). Keep the existing
 * publish clock time and only shift the calendar day.
 */
function applySocialTaskPatchToEvent(
  event: TaskCalendarEvent,
  patch: TaskCalendarPatch,
): TaskCalendarEvent {
  const patchStartRaw = patch.dueDate;
  if (!patchStartRaw) return event;
  const patchStart = new Date(patchStartRaw);
  if (Number.isNaN(patchStart.getTime())) return event;

  const prevStart = event.start ? new Date(event.start) : null;
  const prevEnd = event.end ? new Date(event.end) : null;
  const durationMs =
    prevStart &&
    prevEnd &&
    !Number.isNaN(prevStart.getTime()) &&
    !Number.isNaN(prevEnd.getTime()) &&
    prevEnd.getTime() > prevStart.getTime()
      ? prevEnd.getTime() - prevStart.getTime()
      : SOCIAL_PENDING_DRAG_DURATION_MINUTES * 60_000;

  const monthOrAllDayMove = !patch.dueEndDate;
  if (monthOrAllDayMove) {
    const hours =
      prevStart && !Number.isNaN(prevStart.getTime())
        ? prevStart.getHours()
        : 9;
    const minutes =
      prevStart && !Number.isNaN(prevStart.getTime())
        ? prevStart.getMinutes()
        : 0;
    const start = new Date(
      patchStart.getFullYear(),
      patchStart.getMonth(),
      patchStart.getDate(),
      hours,
      minutes,
      0,
      0,
    );
    return {
      ...event,
      start: start.toISOString(),
      end: new Date(start.getTime() + durationMs).toISOString(),
      allDay: false,
    };
  }

  return {
    ...applyTaskPatchToEvent(event, patch),
    allDay: false,
    durationEditable: false,
    displayEventEnd: false,
  };
}

/** Resolve drop patch → timed publish window (month drops land at 09:00). */
function pendingPlanScheduleFromPatch(patch: TaskCalendarPatch): {
  start: Date;
  end: Date;
} | null {
  if (!patch.dueDate) return null;
  const parsed = new Date(patch.dueDate);
  if (Number.isNaN(parsed.getTime())) return null;

  if (patch.dueEndDate) {
    const end = new Date(patch.dueEndDate);
    if (Number.isNaN(end.getTime()) || end.getTime() <= parsed.getTime()) {
      return {
        start: parsed,
        end: new Date(
          parsed.getTime() + SOCIAL_PENDING_DRAG_DURATION_MINUTES * 60_000,
        ),
      };
    }
    return { start: parsed, end };
  }

  // All-day / month drop — publish at 09:00 local that day.
  const start = new Date(parsed);
  start.setHours(9, 0, 0, 0);
  return {
    start,
    end: new Date(
      start.getTime() + SOCIAL_PENDING_DRAG_DURATION_MINUTES * 60_000,
    ),
  };
}

function pendingPlanToCalendarEvents(
  plan: SocialPendingPlan,
  patch: TaskCalendarPatch,
): TaskCalendarEvent[] {
  const range = pendingPlanScheduleFromPatch(patch);
  if (!range) return [];
  return planToCalendarEventsAt(plan, range.start, range.end);
}

function planToCalendarEventsAt(
  plan: SocialPendingPlan,
  start: Date,
  end?: Date,
): TaskCalendarEvent[] {
  const platforms = plan.platforms;
  if (platforms.length === 0) return [];
  const { caption, hashtags } = splitSocialPlannedCaption(plan.body);
  const firstMedia = plan.media?.[0] ?? null;
  const imageOnly = !caption.trim() && Boolean(firstMedia);
  const primary = platforms[0]!;
  const colors = PLATFORM_EVENT_COLORS[primary];
  const endAt =
    end && end.getTime() > start.getTime()
      ? end
      : new Date(
          start.getTime() + SOCIAL_PENDING_DRAG_DURATION_MINUTES * 60_000,
        );
  // One calendar entry can target several networks — chip shows every mark.
  const multi = platforms.length > 1;
  return [
    {
      id: plan.id,
      title: imageOnly ? "" : caption,
      start: start.toISOString(),
      end: endAt.toISOString(),
      allDay: false,
      editable: true,
      startEditable: true,
      durationEditable: false,
      displayEventEnd: false,
      classNames: socialPlannedCalendarEventClassNames(platforms),
      backgroundColor: multi ? "#2a2a2a" : colors.backgroundColor,
      borderColor: multi ? "#555" : colors.borderColor,
      extendedProps: {
        entityType: "task" as const,
        taskId: plan.id,
        status: "ready_to_start",
        projectName: null,
        socialPlatform: primary,
        socialPlatforms: platforms,
        socialImageOnly: imageOnly,
        socialMediaPreviewUrl: firstMedia?.previewUrl ?? null,
        socialMediaKind: firstMedia?.kind ?? null,
        socialHashtags: hashtags.length > 0 ? hashtags : null,
      },
    },
  ];
}

function persistedRecordToCalendarEvent(
  record: SocialPlannedPostRecord,
): TaskCalendarEvent | null {
  if (!record.scheduledAt) return null;
  const start = new Date(record.scheduledAt);
  if (Number.isNaN(start.getTime())) return null;
  return (
    planToCalendarEventsAt(
      {
        id: record.id,
        body: record.body,
        accountKind: record.accountKind,
        platforms: record.platforms,
        media: record.media.map((item) => ({
          id: item.id,
          kind: item.kind,
          previewUrl: item.url,
        })),
      },
      start,
    )[0] ?? null
  );
}

export function SocialPlannedView({
  accountKind,
  platform = "all",
  pendingPlans = [],
  scheduledPlans = [],
  selectedPendingPlanId = null,
  onDismissPendingPlan,
  onEditPendingPlan,
  onSchedulePendingPlan,
  onReschedulePersistedPlan,
  onUnschedulePlan,
  onInspectPost,
}: SocialPlannedViewProps) {
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const pendingListRef = useRef<HTMLUListElement | null>(null);
  const pendingPanelListRef = useRef<HTMLUListElement | null>(null);
  const suppressChipClickRef = useRef(false);
  /** Plans placed on the grid — kept so chip click can open the inspect rail. */
  const scheduledPlansByIdRef = useRef(new Map<string, SocialPendingPlan>());
  const persistedIdSetRef = useRef(new Set<string>());
  /** Mock seed posts returned to the tray — keep them off the grid until re-scheduled. */
  const [unscheduledSeedIds, setUnscheduledSeedIds] = useState(
    () => new Set<string>(),
  );
  /** Spacious left list — default is the compact ribbon tray. */
  const [trayPanelOpen, setTrayPanelOpen] = useState(false);
  const [mediaLightbox, setMediaLightbox] = useState<{
    src: string;
    kind: "image" | "video";
    alt: string;
    sourceRect: DOMRect;
  } | null>(null);
  const [calendarNavReady, setCalendarNavReady] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [rangeTitle, setRangeTitle] = useState("");

  const seedEvents = useMemo(() => {
    const mocks = getSocialMockPlannedPostsForAccount(accountKind, platform)
      .filter((post) => !unscheduledSeedIds.has(post.id))
      .map((post) => plannedPostToCalendarEvent(post));
    const persisted = scheduledPlans
      .filter((row) => {
        if (row.accountKind !== accountKind) return false;
        if (platform === "all") return true;
        return row.platforms.includes(platform);
      })
      .map(persistedRecordToCalendarEvent)
      .filter((event): event is TaskCalendarEvent => event != null);
    for (const row of scheduledPlans) {
      scheduledPlansByIdRef.current.set(row.id, {
        id: row.id,
        body: row.body,
        accountKind: row.accountKind,
        platforms: row.platforms,
        media: row.media.map((item) => ({
          id: item.id,
          kind: item.kind,
          previewUrl: item.url,
        })),
      });
      persistedIdSetRef.current.add(row.id);
    }
    const mockIds = new Set(mocks.map((event) => event.id));
    return [...mocks, ...persisted.filter((event) => !mockIds.has(event.id))];
  }, [accountKind, platform, scheduledPlans, unscheduledSeedIds]);

  const [events, setEvents] = useState<TaskCalendarEvent[]>(seedEvents);
  const seedKey = `${accountKind}:${platform}:${seedEvents.map((e) => e.id).join(",")}`;
  const [appliedSeedKey, setAppliedSeedKey] = useState(seedKey);
  if (appliedSeedKey !== seedKey) {
    setAppliedSeedKey(seedKey);
    setEvents((current) => mergeCalendarEventsWithSeed(current, seedEvents));
  }

  const ownedPlatforms = useMemo(
    () => getSocialMockPlatformIdsForAccount(accountKind),
    [accountKind],
  );

  const visiblePendingPlans = useMemo(
    () =>
      pendingPlans.filter((plan) => {
        if (plan.accountKind !== accountKind) return false;
        if (platform === "all") return true;
        return plan.platforms.includes(platform);
      }),
    [pendingPlans, accountKind, platform],
  );

  const handlePendingDragStart = useCallback(() => {
    suppressChipClickRef.current = true;
  }, []);

  const [timePrompt, setTimePrompt] = useState<PendingTimePrompt | null>(null);

  const rememberScheduledPlan = useCallback((plan: SocialPendingPlan) => {
    scheduledPlansByIdRef.current.set(plan.id, plan);
  }, []);

  const remapScheduledPlanId = useCallback(
    (fromId: string, toPlan: SocialPendingPlan, start: Date) => {
      const end = new Date(
        start.getTime() + SOCIAL_PENDING_DRAG_DURATION_MINUTES * 60_000,
      );
      const scheduled = pendingPlanToCalendarEvents(toPlan, {
        dueDate: start.toISOString(),
        dueEndDate: end.toISOString(),
      });
      scheduledPlansByIdRef.current.delete(fromId);
      persistedIdSetRef.current.delete(fromId);
      rememberScheduledPlan(toPlan);
      persistedIdSetRef.current.add(toPlan.id);
      setEvents((current) => [
        ...current.filter(
          (event) =>
            event.id !== fromId &&
            event.id !== toPlan.id &&
            !(
              event.extendedProps.entityType === "task" &&
              (event.extendedProps.taskId === fromId ||
                event.extendedProps.taskId === toPlan.id)
            ),
        ),
        ...scheduled,
      ]);
    },
    [rememberScheduledPlan],
  );

  const commitPendingPlanAt = useCallback(
    (plan: SocialPendingPlan, start: Date) => {
      const end = new Date(
        start.getTime() + SOCIAL_PENDING_DRAG_DURATION_MINUTES * 60_000,
      );
      const scheduled = pendingPlanToCalendarEvents(plan, {
        dueDate: start.toISOString(),
        dueEndDate: end.toISOString(),
      });
      if (scheduled.length === 0) return false;
      rememberScheduledPlan(plan);
      persistedIdSetRef.current.add(plan.id);
      setUnscheduledSeedIds((current) => {
        if (!current.has(plan.id)) return current;
        const next = new Set(current);
        next.delete(plan.id);
        return next;
      });
      setEvents((current) => [
        ...current.filter((event) => event.id !== plan.id),
        ...scheduled,
      ]);
      if (onSchedulePendingPlan) {
        const result = onSchedulePendingPlan(plan, start);
        if (result != null && typeof (result as Promise<unknown>).then === "function") {
          void (result as Promise<SocialPlannedPostRecord | null | void>).then(
            (saved) => {
              if (!saved || saved.id === plan.id) return;
              remapScheduledPlanId(
                plan.id,
                {
                  id: saved.id,
                  body: saved.body,
                  accountKind: saved.accountKind,
                  platforms: saved.platforms,
                  media: saved.media.map((item) => ({
                    id: item.id,
                    kind: item.kind,
                    previewUrl: item.url,
                  })),
                },
                start,
              );
            },
          );
        }
      } else {
        onDismissPendingPlan?.(plan.id);
      }
      return true;
    },
    [
      onDismissPendingPlan,
      onSchedulePendingPlan,
      remapScheduledPlanId,
      rememberScheduledPlan,
    ],
  );

  const resolvePlanForUnschedule = useCallback(
    (taskId: string): SocialPendingPlan | null => {
      const remembered = scheduledPlansByIdRef.current.get(taskId);
      if (remembered) return remembered;
      const mock = getSocialMockPlannedPostById(taskId);
      if (mock) {
        return {
          id: mock.id,
          body: mock.body,
          accountKind: mock.accountKind,
          platforms: [mock.platform],
        };
      }
      const event = events.find(
        (entry) =>
          entry.id === taskId ||
          (entry.extendedProps.entityType === "task" &&
            entry.extendedProps.taskId === taskId),
      );
      if (!event || !isSocialCalendarEvent(event)) return null;
      if (event.extendedProps.entityType !== "task") return null;
      const allowed = new Set<SocialMockPostPlatform>([
        "facebook",
        "instagram",
        "x",
        "linkedin",
        "dev-null",
      ]);
      const fromList = event.extendedProps.socialPlatforms ?? [];
      const platforms = (
        fromList.length > 0
          ? fromList
          : event.extendedProps.socialPlatform
            ? [event.extendedProps.socialPlatform]
            : []
      ).filter((entry): entry is SocialMockPostPlatform =>
        allowed.has(entry as SocialMockPostPlatform),
      );
      if (platforms.length === 0) return null;
      return {
        id: taskId,
        body: event.title || "",
        accountKind,
        platforms,
      };
    },
    [accountKind, events],
  );

  const handleSocialPlanUnschedule = useCallback(
    (taskId: string) => {
      const plan = resolvePlanForUnschedule(taskId);
      if (!plan) return;
      setEvents((current) =>
        current.filter(
          (event) =>
            event.id !== taskId &&
            !(
              event.extendedProps.entityType === "task" &&
              event.extendedProps.taskId === taskId
            ),
        ),
      );
      setUnscheduledSeedIds((current) => {
        const next = new Set(current);
        next.add(taskId);
        return next;
      });
      scheduledPlansByIdRef.current.delete(taskId);
      persistedIdSetRef.current.delete(taskId);
      onUnschedulePlan?.(plan);
    },
    [onUnschedulePlan, resolvePlanForUnschedule],
  );

  const schedulePendingPlanAtPoint = useCallback(
    (plan: SocialPendingPlan, pageX: number, pageY: number) => {
      const drop = resolveCalendarDropAtPoint(
        pageX - window.scrollX,
        pageY - window.scrollY,
        {
          allDayHour: 9,
          durationMinutes: SOCIAL_PENDING_DRAG_DURATION_MINUTES,
        },
      );
      if (!drop) return false;
      if (drop.allDay) {
        // Month grid has no time slots — ask before placing.
        setTimePrompt({ plan, dateYmd: drop.dateYmd });
        return true;
      }
      return commitPendingPlanAt(plan, drop.start);
    },
    [commitPendingPlanAt],
  );

  const handlePendingDragEnd = useCallback(
    (ev: ExternalDragPointerEvent) => {
      const planId =
        ev.subjectEl.getAttribute("data-social-pending-plan-id") ??
        ev.subjectEl.getAttribute("data-calendar-task-id");
      const pending = planId
        ? pendingPlans.find((entry) => entry.id === planId)
        : null;
      if (pending) {
        schedulePendingPlanAtPoint(pending, ev.pageX, ev.pageY);
      }
      // Click fires after pointerup — clear on the next tick.
      window.setTimeout(() => {
        suppressChipClickRef.current = false;
      }, 0);
    },
    [pendingPlans, schedulePendingPlanAtPoint],
  );

  const handleTimePromptCancel = useCallback(() => {
    setTimePrompt(null);
  }, []);

  const handleTimePromptConfirm = useCallback(
    (timeHHmm: string) => {
      if (!timePrompt) return;
      const match = /^(\d{2}):(\d{2})$/.exec(timeHHmm.trim());
      const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(timePrompt.dateYmd);
      if (!match || !dayMatch) {
        setTimePrompt(null);
        return;
      }
      const start = new Date(
        Number(dayMatch[1]),
        Number(dayMatch[2]) - 1,
        Number(dayMatch[3]),
        Number(match[1]),
        Number(match[2]),
        0,
        0,
      );
      commitPendingPlanAt(timePrompt.plan, start);
      setTimePrompt(null);
    },
    [commitPendingPlanAt, timePrompt],
  );

  useCalendarExternalTaskDrag(pendingListRef, {
    enabled: !trayPanelOpen && visiblePendingPlans.length > 0,
    itemSelector: SOCIAL_PENDING_DRAG_ITEM_SELECTOR,
    minDistance: 6,
    onDragStart: handlePendingDragStart,
    onDragEnd: handlePendingDragEnd,
  });

  useCalendarExternalTaskDrag(pendingPanelListRef, {
    enabled: trayPanelOpen && visiblePendingPlans.length > 0,
    itemSelector: SOCIAL_PENDING_DRAG_ITEM_SELECTOR,
    minDistance: 6,
    onDragStart: handlePendingDragStart,
    onDragEnd: handlePendingDragEnd,
  });

  const handleCalendarApi = useCallback((api: CalendarApi | null) => {
    calendarApiRef.current = api;
    setCalendarNavReady(api != null);
  }, []);

  const handleTaskReschedule = useCallback(
    (taskId: string, patch: TaskCalendarPatch) => {
      const pending = pendingPlans.find((entry) => entry.id === taskId);
      if (pending) {
        const scheduled = pendingPlanToCalendarEvents(pending, patch);
        if (scheduled.length === 0) return;
        const range = pendingPlanScheduleFromPatch(patch);
        rememberScheduledPlan(pending);
        persistedIdSetRef.current.add(pending.id);
        setEvents((current) => [
          ...current.filter((event) => event.id !== pending.id),
          ...scheduled,
        ]);
        if (onSchedulePendingPlan && range) {
          onSchedulePendingPlan(pending, range.start);
        } else {
          onDismissPendingPlan?.(pending.id);
        }
        return;
      }
      setEvents((current) =>
        current.map((event) => {
          if (event.extendedProps.entityType !== "task") return event;
          if (event.extendedProps.taskId !== taskId) return event;
          if (isSocialCalendarEvent(event)) {
            const next = applySocialTaskPatchToEvent(event, patch);
            if (
              persistedIdSetRef.current.has(taskId) &&
              onReschedulePersistedPlan &&
              next.start
            ) {
              const start = new Date(next.start);
              if (!Number.isNaN(start.getTime())) {
                onReschedulePersistedPlan(taskId, start);
              }
            }
            return next;
          }
          return applyTaskPatchToEvent(event, patch);
        }),
      );
    },
    [
      onDismissPendingPlan,
      onReschedulePersistedPlan,
      onSchedulePendingPlan,
      pendingPlans,
      rememberScheduledPlan,
    ],
  );

  const handleInspectPlannedId = useCallback(
    (taskId: string) => {
      if (!onInspectPost) return;
      const baseId = taskId.includes(":") ? taskId.split(":")[0]! : taskId;
      const planned = getSocialMockPlannedPostById(baseId);
      if (planned) {
        onInspectPost(socialMockPlannedPostAsFeedPost(planned));
        return;
      }
      const event = events.find(
        (entry) =>
          entry.id === baseId ||
          (entry.extendedProps.entityType === "task" &&
            entry.extendedProps.taskId === baseId),
      );
      const scheduledAt = event?.start ?? null;
      const scheduled = scheduledPlansByIdRef.current.get(baseId);
      if (scheduled) {
        onInspectPost(pendingPlanAsFeedPost(scheduled, scheduledAt));
        return;
      }
      const pending = pendingPlans.find((entry) => entry.id === baseId);
      if (pending) onInspectPost(pendingPlanAsFeedPost(pending, scheduledAt));
    },
    [events, onInspectPost, pendingPlans],
  );

  function renderPendingPlanItem(
    plan: SocialPendingPlan,
    variant: "ribbon" | "panel",
  ) {
    const showAll = planTargetsAllPlatforms(plan.platforms, ownedPlatforms);
    const { caption, hashtags } = splitSocialPlannedCaption(plan.body);
    const primaryPlatform = plan.platforms[0] ?? "x";
    const colors = PLATFORM_EVENT_COLORS[primaryPlatform];
    const firstMedia = plan.media?.[0] ?? null;
    const dragTitle =
      caption.trim() ||
      plan.body ||
      (firstMedia ? "Image post" : "Planned post");
    const isSelected = selectedPendingPlanId === plan.id;
    const isPanel = variant === "panel";
    const imageOnly = !caption.trim() && Boolean(firstMedia);
    return (
      <li
        key={`${variant}-${plan.id}`}
        className={[
          isPanel
            ? "social-planned__tray-item"
            : "social-planned__pending-item",
          "social-planned__pending-item--draggable",
          isSelected
            ? isPanel
              ? "social-planned__tray-item--selected"
              : "social-planned__pending-item--selected"
            : null,
        ]
          .filter(Boolean)
          .join(" ")}
        data-social-pending-plan-id={plan.id}
        data-calendar-task-id={plan.id}
        data-calendar-task-title={dragTitle}
        data-calendar-task-status="ready_to_start"
        data-calendar-drag-duration-minutes={SOCIAL_PENDING_DRAG_DURATION_MINUTES}
        data-social-platform={primaryPlatform}
        data-social-event-bg={colors.backgroundColor}
        data-social-event-border={colors.borderColor}
        data-social-image-only={imageOnly ? "true" : "false"}
        data-social-media-preview-url={firstMedia?.previewUrl ?? undefined}
        data-social-media-kind={firstMedia?.kind ?? undefined}
        data-social-hashtags={hashtags.join(" ")}
      >
        <div
          className={[
            isPanel
              ? "social-planned__tray-row"
              : "social-planned__pending-chip",
            isSelected
              ? isPanel
                ? "social-planned__tray-row--selected"
                : "social-planned__pending-chip--selected"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {firstMedia ? (
            <button
              type="button"
              className="social-planned__pending-media"
              aria-label={
                firstMedia.kind === "video"
                  ? "View video fullscreen"
                  : "View image fullscreen"
              }
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                setMediaLightbox({
                  src: firstMedia.previewUrl,
                  kind: firstMedia.kind,
                  alt: firstMedia.kind === "video" ? "Video" : "Image",
                  sourceRect: DOMRect.fromRect({
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height,
                  }),
                });
              }}
            >
              {firstMedia.kind === "video" ? (
                <video
                  className="social-planned__pending-media-thumb"
                  src={firstMedia.previewUrl}
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img
                  className="social-planned__pending-media-thumb"
                  src={firstMedia.previewUrl}
                  alt=""
                />
              )}
            </button>
          ) : null}
          <button
            type="button"
            className={
              isPanel
                ? "social-planned__tray-open"
                : "social-planned__pending-open"
            }
            aria-pressed={isSelected}
            onClick={() => {
              if (suppressChipClickRef.current) return;
              if (onEditPendingPlan) {
                onEditPendingPlan(plan);
                return;
              }
              onInspectPost?.(pendingPlanAsFeedPost(plan));
            }}
          >
            {showAll ? (
              <span className="social-planned__pending-all">All</span>
            ) : (
              <span
                className="social-planned__pending-platforms"
                aria-hidden="true"
              >
                {plan.platforms.map((entry) => {
                  const nav = SOCIAL_PLATFORM_NAV_ITEMS.find(
                    (item) => item.id === entry,
                  );
                  return (
                    <span
                      key={entry}
                      className="social-planned__pending-platform"
                      title={platformLabel(entry)}
                    >
                      {socialPlatformIcon(nav?.platform ?? entry, 14)}
                    </span>
                  );
                })}
              </span>
            )}
            <span
              className={
                isPanel
                  ? "social-planned__tray-body"
                  : "social-planned__pending-body"
              }
            >
              {plan.body.trim()
                ? plan.body
                : firstMedia
                  ? firstMedia.kind === "video"
                    ? "Video"
                    : "Image"
                  : ""}
            </span>
          </button>
          {onDismissPendingPlan ? (
            <button
              type="button"
              className="social-planned__pending-delete"
              aria-label="Delete planned post"
              title="Delete planned post"
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={() => onDismissPendingPlan(plan.id)}
            >
              <TrashIcon size={isPanel ? 14 : 12} />
            </button>
          ) : null}
        </div>
      </li>
    );
  }

  return (
    <div
      className={[
        "social-planned",
        trayPanelOpen ? "social-planned--tray-open" : null,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {trayPanelOpen ? (
        <aside
          className="social-planned__tray-panel"
          aria-label="Planning tray"
        >
          <header className="social-planned__tray-panel-header">
            <h2 className="social-planned__tray-panel-title">Tray</h2>
            <span className="social-planned__tray-panel-count">
              {visiblePendingPlans.length}
            </span>
          </header>
          {visiblePendingPlans.length > 0 ? (
            <ul
              ref={pendingPanelListRef}
              className="social-planned__tray-list"
              role="list"
              aria-label="Unscheduled plans"
            >
              {visiblePendingPlans.map((plan) =>
                renderPendingPlanItem(plan, "panel"),
              )}
            </ul>
          ) : (
            <p className="social-planned__tray-empty">
              No unscheduled plans. Plan a post, then drag it onto the calendar.
            </p>
          )}
        </aside>
      ) : null}

      <div className="social-planned__main">
        <header className="social-planned__toolbar">
          <div className="social-planned__toolbar-start">
            <button
              type="button"
              className="social-planned__tray-toggle"
              aria-pressed={trayPanelOpen}
              aria-label={
                trayPanelOpen ? "Hide planning tray panel" : "Show planning tray panel"
              }
              title={
                trayPanelOpen ? "Hide tray panel" : "Show tray panel"
              }
              onClick={() => setTrayPanelOpen((open) => !open)}
            >
              <ProjectsSidePanelIcon
                size={16}
                collapsed={!trayPanelOpen}
                rail="start"
              />
            </button>
            <div className="social-planned__title-block">
              {!trayPanelOpen && visiblePendingPlans.length > 0 ? (
                <div className="social-planned__pending-scroll">
                  <ul
                    ref={pendingListRef}
                    className="social-planned__pending"
                    role="list"
                    aria-label="Unscheduled plans"
                  >
                    {visiblePendingPlans.map((plan) =>
                      renderPendingPlanItem(plan, "ribbon"),
                    )}
                  </ul>
                </div>
              ) : (
                <h2 className="social-planned__title">Planned</h2>
              )}
              {rangeTitle && viewMode !== "month" ? (
                <p className="social-planned__range">{rangeTitle}</p>
              ) : null}
            </div>
          </div>
          <CalendarDateNav
            disabled={!calendarNavReady}
            onPrev={() => calendarApiRef.current?.prev()}
            onNext={() => calendarApiRef.current?.next()}
            onToday={() => calendarApiRef.current?.today()}
          />
        </header>
        <div className="social-planned__calendar">
          <CalendarView
            events={events}
            onTaskReschedule={handleTaskReschedule}
            onTaskOpen={handleInspectPlannedId}
            onSocialPlanUnschedule={handleSocialPlanUnschedule}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onCalendarApi={handleCalendarApi}
            onRangeTitleChange={setRangeTitle}
            keyboardNavigationEnabled={false}
          />
        </div>
      </div>
      <SocialPlannedTimeModal
        open={timePrompt != null}
        dateYmd={timePrompt?.dateYmd ?? ""}
        defaultTime={SOCIAL_MONTH_DROP_DEFAULT_TIME}
        postPreview={timePrompt?.plan.body}
        onCancel={handleTimePromptCancel}
        onConfirm={handleTimePromptConfirm}
      />
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
