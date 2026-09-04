"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { flattenGroupedListItemIds } from "../../list-nav/list-keyboard-nav-index.js";
import { LIST_KEYBOARD_NAV_ZONE_MAIN } from "../../list-nav/list-keyboard-nav-zone.js";
import {
  groupMeetingsByStatus,
  type MeetingListItem,
} from "../../meetings/meetings.js";
import { type TaskStatus } from "../../tasks/task-status.js";
import {
  useListKeyboardNavigation,
  useListKeyboardNavigationContainerProps,
} from "../list-nav/list-keyboard-navigation-provider.js";
import { StatusGroupSection } from "../list-nav/status-group-section.js";
import {
  MeetingListItemCard,
  buildMeetingListItemCardData,
} from "../meetings/meeting-list-item-card.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";

export type ContactMeetingsListViewProps = {
  contactId: string;
  meetings: MeetingListItem[];
  onSelectMeeting?: (meetingId: string) => void;
  selectedMeetingId?: string | null;
  emptyMessage?: string;
  emptyHint?: string;
};

/**
 * Contact Meetings workspace tab — status-grouped list of meetings where this
 * contact is an attendee (same structure as contact tasks / letters).
 */
export function ContactMeetingsListView({
  contactId,
  meetings,
  onSelectMeeting,
  selectedMeetingId = null,
  emptyMessage = "No meetings for this contact",
  emptyHint = "Meetings this contact attends will show up here.",
}: ContactMeetingsListViewProps) {
  const scopedMeetings = useMemo(
    () =>
      meetings.filter((meeting) =>
        (meeting.attendeeContactIds ?? []).includes(contactId),
      ),
    [contactId, meetings],
  );
  const [localMeetings, setLocalMeetings] = useState(scopedMeetings);
  const [collapsed, setCollapsed] = useState<Set<TaskStatus>>(() => new Set());
  const listRef = useRef<HTMLUListElement>(null);
  const listContainerProps = useListKeyboardNavigationContainerProps(
    LIST_KEYBOARD_NAV_ZONE_MAIN,
  );

  useEffect(() => {
    setLocalMeetings(scopedMeetings);
  }, [scopedMeetings]);

  const groups = useMemo(
    () => groupMeetingsByStatus(localMeetings, { includeEmpty: true }),
    [localMeetings],
  );

  const itemIds = useMemo(
    () =>
      flattenGroupedListItemIds(
        groups.map((group) => ({ key: group.status, items: group.meetings })),
        collapsed,
        (meeting) => meeting.id,
      ),
    [collapsed, groups],
  );

  const { highlightedId } = useListKeyboardNavigation({
    containerRef: listRef,
    itemIds,
    selectedId: selectedMeetingId,
    onNavigate: (meetingId) => onSelectMeeting?.(meetingId),
    zone: LIST_KEYBOARD_NAV_ZONE_MAIN,
    enabled: itemIds.length > 0,
  });

  if (localMeetings.length === 0) {
    return (
      <div className="contact-tasks-list__empty">
        <h2 className="contact-tasks-list__empty-title">{emptyMessage}</h2>
        <p className="contact-tasks-list__empty-hint">{emptyHint}</p>
      </div>
    );
  }

  return (
    <div className="contact-tasks-list-host" aria-label="Meetings">
      <ul
        className="contact-tasks-list"
        role="list"
        ref={listRef}
        {...listContainerProps}
      >
        {groups.map((group) => {
          const isCollapsed = collapsed.has(group.status);
          return (
            <StatusGroupSection
              key={group.status}
              groupKey={group.status}
              title={group.label}
              collapsed={isCollapsed}
              icon={
                <TaskStatusIcon
                  status={group.status}
                  size={14}
                  title={group.label}
                />
              }
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(group.status)) next.delete(group.status);
                  else next.add(group.status);
                  return next;
                })
              }
            >
              {group.meetings.map((meeting) => (
                <MeetingListItemCard
                  key={meeting.id}
                  item={buildMeetingListItemCardData(meeting)}
                  itemId={meeting.id}
                  active={selectedMeetingId === meeting.id}
                  keyboardHighlighted={highlightedId === meeting.id}
                  onActivate={() => onSelectMeeting?.(meeting.id)}
                  className="contact-meetings-list__card"
                />
              ))}
            </StatusGroupSection>
          );
        })}
      </ul>
    </div>
  );
}
