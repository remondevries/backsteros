"use client";

import { useEffect, useMemo, useRef, useState, type Ref } from "react";

import {
  calendarSidePanelMeetingItemId,
  parseCalendarSidePanelKeyboardItemId,
  partitionCalendarSidePanelMeetings,
} from "../../calendar/calendar-side-panel-keyboard.js";
import {
  findMeetingClosestToReference,
  groupScheduledMeetingsByPeriod,
  isCurrentMeetingScheduleGroup,
  meetingScheduleGranularityFromViewMode,
} from "../../calendar/calendar-meetings-week-groups.js";
import type { CalendarViewMode } from "../../calendar/calendar-view-modes.js";
import { LIST_KEYBOARD_NAV_ZONE_CONTENT } from "../../list-nav/list-keyboard-nav-zone.js";
import { type MeetingListItem } from "../../meetings/meetings.js";
import { ProjectTypeGroupSection } from "../projects/project-type-group-section.js";
import {
  buildMeetingListItemCardData,
  MeetingListItemCard,
} from "../meetings/meeting-list-item-card.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
  useListKeyboardNavigationZone,
} from "../list-nav/list-keyboard-navigation-provider.js";

export const CALENDAR_MEETINGS_SIDE_PANEL_WIDTH_KEY =
  "calendar-meetings-side-panel-width";

export type CalendarMeetingsSidePanelViewProps = {
  meetings: MeetingListItem[];
  /** Matches the main calendar chrome view (day / week / month / list). */
  viewMode?: CalendarViewMode;
  loading?: boolean;
  selectedMeetingId?: string | null;
  onMeetingOpen?: (meetingId: string) => void;
  emptyLabel?: string;
  /** When false, j/k / Tab skip this rail (e.g. keep-alive hidden). */
  keyboardNavigationEnabled?: boolean;
};

/**
 * Right-rail meetings list for the calendar page (domains-style detail split).
 * Registers as the `content` keyboard-nav zone so Tab cycles
 * left panel → calendar grid → meetings.
 */
export function CalendarMeetingsSidePanelView({
  meetings,
  viewMode = "week",
  loading = false,
  selectedMeetingId = null,
  onMeetingOpen,
  emptyLabel = "No meetings yet.",
  keyboardNavigationEnabled = true,
}: CalendarMeetingsSidePanelViewProps) {
  const listRef = useRef<HTMLElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrolledToCurrentKeyRef = useRef<string | null>(null);
  // Inbox/triage meetings live on the left calendar panel (above habits).
  const { scheduledMeetings } = partitionCalendarSidePanelMeetings(meetings);
  const granularity = meetingScheduleGranularityFromViewMode(viewMode);
  const scheduledGroups = useMemo(
    () =>
      groupScheduledMeetingsByPeriod(scheduledMeetings, {
        granularity,
      }),
    [granularity, scheduledMeetings],
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const closestScheduledMeeting = useMemo(
    () => findMeetingClosestToReference(scheduledMeetings),
    [scheduledMeetings],
  );
  const closestItemId = closestScheduledMeeting
    ? calendarSidePanelMeetingItemId(closestScheduledMeeting.id)
    : null;

  const selectedItemId = selectedMeetingId
    ? calendarSidePanelMeetingItemId(selectedMeetingId)
    : null;

  const itemIds = useMemo(() => {
    const ids: string[] = [];
    for (const group of scheduledGroups) {
      if (collapsedGroups.has(group.groupKey)) continue;
      for (const meeting of group.meetings) {
        ids.push(calendarSidePanelMeetingItemId(meeting.id));
      }
    }
    return ids;
  }, [collapsedGroups, scheduledGroups]);

  const landingItemId =
    selectedItemId && itemIds.includes(selectedItemId)
      ? selectedItemId
      : closestItemId && itemIds.includes(closestItemId)
        ? closestItemId
        : null;

  const { highlightedId, setHighlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedItemId,
    defaultHighlightedId: landingItemId,
    onNavigate: (itemId) => {
      const parsed = parseCalendarSidePanelKeyboardItemId(itemId);
      if (parsed?.kind === "meeting") {
        onMeetingOpen?.(parsed.entityId);
      }
    },
    zone: LIST_KEYBOARD_NAV_ZONE_CONTENT,
    enabled: keyboardNavigationEnabled && itemIds.length > 0,
  });
  const { activeZone } = useListKeyboardNavigationZone();
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_CONTENT,
  );

  // Seed / re-seed j/k onto today/closest when empty (keep-alive hide, or after
  // another zone was active). Prefer keeping a user j/k position when present.
  useEffect(() => {
    if (!keyboardNavigationEnabled) return;
    if (!landingItemId) return;
    if (
      activeZone === LIST_KEYBOARD_NAV_ZONE_CONTENT &&
      highlightedId != null &&
      itemIds.includes(highlightedId)
    ) {
      return;
    }
    setHighlightedId((current) =>
      current != null && itemIds.includes(current) ? current : landingItemId,
    );
  }, [
    activeZone,
    highlightedId,
    itemIds,
    keyboardNavigationEnabled,
    landingItemId,
    setHighlightedId,
  ]);

  // Scroll so the current week/day/month group sits at the top of the rail.
  useEffect(() => {
    if (loading || !keyboardNavigationEnabled) {
      if (!keyboardNavigationEnabled) {
        scrolledToCurrentKeyRef.current = null;
      }
      return;
    }
    const currentGroup = scheduledGroups.find((group) =>
      isCurrentMeetingScheduleGroup(group.groupKey, granularity),
    );
    const scrollKey = currentGroup
      ? `${granularity}:${currentGroup.groupKey}`
      : null;
    if (!scrollKey || scrolledToCurrentKeyRef.current === scrollKey) return;

    const frame = requestAnimationFrame(() => {
      const body = bodyRef.current;
      if (!body) return;
      const target = body.querySelector<HTMLElement>(
        '[data-current-schedule-group="true"]',
      );
      if (!target) return;
      const bodyRect = body.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      body.scrollTop += targetRect.top - bodyRect.top - 4;
      scrolledToCurrentKeyRef.current = scrollKey;
    });
    return () => cancelAnimationFrame(frame);
  }, [granularity, keyboardNavigationEnabled, loading, scheduledGroups]);

  function renderMeetingRow(meeting: MeetingListItem) {
    const itemId = calendarSidePanelMeetingItemId(meeting.id);
    return (
      <li key={meeting.id} className="calendar-meetings-side-panel__item">
        <MeetingListItemCard
          item={buildMeetingListItemCardData(meeting)}
          itemId={itemId}
          active={selectedItemId === itemId}
          keyboardHighlighted={highlightedId === itemId}
          onActivate={() => onMeetingOpen?.(meeting.id)}
        />
      </li>
    );
  }

  const hasScheduled = scheduledGroups.length > 0;
  const isEmpty = !loading && !hasScheduled;

  return (
    <div
      className="calendar-meetings-side-panel"
      data-content-detail
      data-schedule-granularity={granularity}
    >
      <div className="calendar-meetings-side-panel__header">
        <h2 className="calendar-meetings-side-panel__title">Meetings</h2>
      </div>
      <div ref={bodyRef} className="calendar-meetings-side-panel__body">
        {loading ? (
          <p className="calendar-meetings-side-panel__empty">Loading…</p>
        ) : isEmpty ? (
          <p className="calendar-meetings-side-panel__empty">{emptyLabel}</p>
        ) : (
          <ul
            ref={listRef as Ref<HTMLUListElement>}
            className="calendar-meetings-side-panel__list"
            aria-label="Meetings"
            {...listContainerProps}
          >
            {scheduledGroups.map((group) => {
              const collapsed = collapsedGroups.has(group.groupKey);
              const currentGroup = isCurrentMeetingScheduleGroup(
                group.groupKey,
                granularity,
              );
              return (
                <ProjectTypeGroupSection
                  key={`${granularity}:${group.groupKey}`}
                  title={group.label}
                  titleHighlighted={currentGroup}
                  collapsed={collapsed}
                  onToggle={() => {
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(group.groupKey)) next.delete(group.groupKey);
                      else next.add(group.groupKey);
                      return next;
                    });
                  }}
                >
                  {group.meetings.map((meeting) => renderMeetingRow(meeting))}
                </ProjectTypeGroupSection>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
