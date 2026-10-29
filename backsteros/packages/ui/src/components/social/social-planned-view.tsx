"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import type { CalendarApi } from "@fullcalendar/core";

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
import { CalendarDateNav } from "../calendar/calendar-date-nav.js";
import { CalendarView } from "../calendar/calendar-view.js";
import { SocialPlannedTimeModal } from "./social-planned-time-modal.js";

const SOCIAL_PENDING_DRAG_DURATION_MINUTES = 30;
const SOCIAL_PENDING_DRAG_ITEM_SELECTOR = "[data-social-pending-plan-id]";
const SOCIAL_MONTH_DROP_DEFAULT_TIME = "09:00";

type PendingTimePrompt = {
  plan: SocialPendingPlan;
  dateYmd: string;
};

/** Composer “Plan” result — not on the grid yet (dashed chip at the top). */
export type SocialPendingPlan = {
  id: string;
  body: string;
  accountKind: SocialMockAccountKind;
  platforms: readonly SocialMockPostPlatform[];
};

export type SocialPlannedViewProps = {
  accountKind: SocialMockAccountKind;
  platform?: SocialMockAnalyticsPlatformFilterId;
  /** Unscheduled plans from the composer — dashed chips in the toolbar. */
  pendingPlans?: readonly SocialPendingPlan[];
  /** Persisted scheduled posts from core (merged with mock seeds). */
  scheduledPlans?: readonly SocialPlannedPostRecord[];
  onDismissPendingPlan?: (id: string) => void;
  /** Load a plan back into the composer for editing. */
  onEditPendingPlan?: (plan: SocialPendingPlan) => void;
  /** Persist schedule when a tray chip lands on the calendar. */
  onSchedulePendingPlan?: (plan: SocialPendingPlan, scheduledAt: Date) => void;
  /** Persist reschedule for a core-backed calendar event. */
  onReschedulePersistedPlan?: (id: string, scheduledAt: Date) => void;
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
    classNames: ["task-calendar-event", "social-planned-calendar-event"],
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
  const imageOnly = !caption.trim();
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
      classNames: [
        "task-calendar-event",
        "social-planned-calendar-event",
        multi ? "social-planned-calendar-event--multi" : null,
      ].filter(Boolean) as string[],
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
  onDismissPendingPlan,
  onEditPendingPlan,
  onSchedulePendingPlan,
  onReschedulePersistedPlan,
  onInspectPost,
}: SocialPlannedViewProps) {
  const calendarApiRef = useRef<CalendarApi | null>(null);
  const pendingListRef = useRef<HTMLUListElement | null>(null);
  const suppressChipClickRef = useRef(false);
  /** Plans placed on the grid — kept so chip click can open the inspect rail. */
  const scheduledPlansByIdRef = useRef(new Map<string, SocialPendingPlan>());
  const persistedIdSetRef = useRef(new Set<string>());
  const [calendarNavReady, setCalendarNavReady] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [rangeTitle, setRangeTitle] = useState("");

  const seedEvents = useMemo(() => {
    const mocks = getSocialMockPlannedPostsForAccount(accountKind, platform).map(
      (post) => plannedPostToCalendarEvent(post),
    );
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
      });
      persistedIdSetRef.current.add(row.id);
    }
    const mockIds = new Set(mocks.map((event) => event.id));
    return [...mocks, ...persisted.filter((event) => !mockIds.has(event.id))];
  }, [accountKind, platform, scheduledPlans]);

  const [events, setEvents] = useState<TaskCalendarEvent[]>(seedEvents);
  const seedKey = `${accountKind}:${platform}:${seedEvents.map((e) => e.id).join(",")}`;
  const [appliedSeedKey, setAppliedSeedKey] = useState(seedKey);
  if (appliedSeedKey !== seedKey) {
    setAppliedSeedKey(seedKey);
    setEvents(seedEvents);
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
      setEvents((current) => [
        ...current.filter((event) => event.id !== plan.id),
        ...scheduled,
      ]);
      if (onSchedulePendingPlan) {
        onSchedulePendingPlan(plan, start);
      } else {
        onDismissPendingPlan?.(plan.id);
      }
      return true;
    },
    [onDismissPendingPlan, onSchedulePendingPlan, rememberScheduledPlan],
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
    enabled: visiblePendingPlans.length > 0,
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

  return (
    <div className="social-planned">
      <header className="social-planned__toolbar">
        <div className="social-planned__title-block">
          {visiblePendingPlans.length > 0 ? (
            <ul
              ref={pendingListRef}
              className="social-planned__pending"
              role="list"
              aria-label="Unscheduled plans"
            >
              {visiblePendingPlans.map((plan) => {
                const showAll = planTargetsAllPlatforms(
                  plan.platforms,
                  ownedPlatforms,
                );
                const { caption, hashtags } = splitSocialPlannedCaption(
                  plan.body,
                );
                const primaryPlatform = plan.platforms[0] ?? "x";
                const colors = PLATFORM_EVENT_COLORS[primaryPlatform];
                const dragTitle = caption.trim() || plan.body || "Planned post";
                return (
                  <li
                    key={plan.id}
                    className="social-planned__pending-item social-planned__pending-item--draggable"
                    data-social-pending-plan-id={plan.id}
                    data-calendar-task-id={plan.id}
                    data-calendar-task-title={dragTitle}
                    data-calendar-task-status="ready_to_start"
                    data-calendar-drag-duration-minutes={
                      SOCIAL_PENDING_DRAG_DURATION_MINUTES
                    }
                    data-social-platform={primaryPlatform}
                    data-social-event-bg={colors.backgroundColor}
                    data-social-event-border={colors.borderColor}
                    data-social-image-only={caption.trim() ? "false" : "true"}
                    data-social-hashtags={hashtags.join(" ")}
                  >
                    <div className="social-planned__pending-chip">
                      <button
                        type="button"
                        className="social-planned__pending-open"
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
                          <span className="social-planned__pending-all">
                            All
                          </span>
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
                                  {socialPlatformIcon(
                                    nav?.platform ?? entry,
                                    14,
                                  )}
                                </span>
                              );
                            })}
                          </span>
                        )}
                        <span className="social-planned__pending-body">
                          {plan.body}
                        </span>
                      </button>
                      {onDismissPendingPlan ? (
                        <button
                          type="button"
                          className="social-planned__pending-dismiss"
                          aria-label="Remove unscheduled plan"
                          onPointerDown={(event) => {
                            // Keep dismiss from starting a calendar drag.
                            event.stopPropagation();
                          }}
                          onClick={() => onDismissPendingPlan(plan.id)}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <h2 className="social-planned__title">Planned</h2>
          )}
          {rangeTitle && viewMode !== "month" ? (
            <p className="social-planned__range">{rangeTitle}</p>
          ) : null}
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
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onCalendarApi={handleCalendarApi}
          onRangeTitleChange={setRangeTitle}
          keyboardNavigationEnabled={false}
        />
      </div>
      <SocialPlannedTimeModal
        open={timePrompt != null}
        dateYmd={timePrompt?.dateYmd ?? ""}
        defaultTime={SOCIAL_MONTH_DROP_DEFAULT_TIME}
        postPreview={timePrompt?.plan.body}
        onCancel={handleTimePromptCancel}
        onConfirm={handleTimePromptConfirm}
      />
    </div>
  );
}
