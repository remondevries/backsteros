"use client";

import {
  useMemo,
  useSyncExternalStore,
  type ComponentType,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { formatCalendarTaskScheduleLabel } from "../../calendar/calendar-events.js";
import { sidePanelItemClass } from "../../content/side-panel-styles.js";
import { iconSvgColorStyle } from "../../entity/icon-color.js";
import { keyboardNavItemProps } from "../../list-nav/keyboard-nav-item.js";
import {
  formatMeetingDisplayId,
  resolveMeetingListIconColor,
  type MeetingListItem,
} from "../../meetings/meetings.js";
import {
  isIncomingMeetingStatus,
  isPastCompletedMeeting,
  resolveMeetingEffectiveStatus,
} from "../../meetings/meeting-status.js";
import type { InboxMeetingListItem } from "../../inbox/inbox-items.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { InboxItemTypeIcon } from "../inbox/inbox-item-type-icon.js";
import {
  ListItemMetaProperties,
  ListItemOrganizationMeta,
  ListItemProjectMeta,
} from "../list-nav/list-item-meta.js";

export type MeetingListItemCardData = {
  title: string;
  number: number;
  status: string;
  priority: number;
  projectName?: string | null;
  projectKey?: string | null;
  projectIcon?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  organizationAvatarSrc?: string | null;
  startAt?: number | Date | string | null;
  endAt?: number | Date | string | null;
  scheduleLabel?: string | null;
  inboxUpdatedAt?: number | Date | string | null;
};

export type MeetingListItemCardLinkComponent = ComponentType<{
  to: string;
  className?: string;
  "aria-current"?: "page";
  "aria-label"?: string;
  children?: ReactNode;
}>;

type MeetingListItemCardBaseProps = {
  item: MeetingListItemCardData;
  active?: boolean;
  keyboardHighlighted?: boolean;
  itemId?: string;
  className?: string;
  /** Shown after the title (e.g. tracked duration). */
  titleTrailing?: ReactNode;
};

type MeetingListItemCardLinkProps = MeetingListItemCardBaseProps & {
  href: string;
  Link: MeetingListItemCardLinkComponent;
  onActivate?: never;
};

type MeetingListItemCardButtonProps = MeetingListItemCardBaseProps & {
  onActivate: () => void;
  href?: never;
  Link?: never;
};

export type MeetingListItemCardProps =
  | MeetingListItemCardLinkProps
  | MeetingListItemCardButtonProps;

export function buildMeetingListItemCardData(
  meeting:
    | Pick<
        MeetingListItem,
        | "title"
        | "number"
        | "status"
        | "priority"
        | "projectName"
        | "projectKey"
        | "organizationName"
        | "organizationAvatarSrc"
        | "startAt"
        | "endAt"
        | "inboxUpdatedAt"
      > & {
        projectIcon?: string | null;
        scheduleLabel?: string | null;
      }
    | InboxMeetingListItem,
): MeetingListItemCardData {
  return {
    title: meeting.title.trim() || "Untitled meeting",
    number: meeting.number,
    status: meeting.status ?? "ready_to_start",
    priority: meeting.priority ?? 0,
    projectName: meeting.projectName ?? null,
    projectKey: meeting.projectKey ?? null,
    projectIcon:
      "projectIcon" in meeting ? (meeting.projectIcon ?? null) : null,
    organizationName:
      "organizationName" in meeting ? (meeting.organizationName ?? null) : null,
    organizationAvatarSrc:
      "organizationAvatarSrc" in meeting
        ? (meeting.organizationAvatarSrc ?? null)
        : null,
    startAt: meeting.startAt,
    endAt: meeting.endAt,
    scheduleLabel:
      "scheduleLabel" in meeting
        ? (meeting.scheduleLabel ?? null)
        : formatCalendarTaskScheduleLabel(meeting.startAt, meeting.endAt),
    inboxUpdatedAt:
      "inboxUpdatedAt" in meeting ? (meeting.inboxUpdatedAt ?? null) : null,
  };
}

function handleButtonKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onActivate: () => void,
) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    onActivate();
  }
}

export function MeetingListItemCard(props: MeetingListItemCardProps) {
  const {
    item,
    active = false,
    keyboardHighlighted = false,
    itemId,
    className,
    titleTrailing = null,
  } = props;
  const status = resolveMeetingEffectiveStatus({
    status: item.status,
    startAt: item.startAt ?? Date.now(),
    endAt: item.endAt ?? item.startAt ?? Date.now(),
  });
  const finished = isPastCompletedMeeting({
    status: item.status,
    endAt: item.endAt ?? item.startAt ?? Date.now(),
  });
  const scheduleLabel =
    item.scheduleLabel?.trim() ||
    formatCalendarTaskScheduleLabel(item.startAt, item.endAt);
  const projectLabel = item.projectName?.trim() || item.projectKey?.trim() || null;
  const organizationLabel = item.organizationName?.trim() || null;
  const hasTitleStack = Boolean(scheduleLabel);
  const displayId = formatMeetingDisplayId(item.number);
  const incoming = isIncomingMeetingStatus(status);
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const meetingIconStyle = useMemo(
    () => iconSvgColorStyle(resolveMeetingListIconColor(status, { colorScheme })),
    [colorScheme, status],
  );

  const cardClassName = [
    sidePanelItemClass({
      active,
      keyboardHighlighted,
      stacked: true,
    }),
    "inbox-list-item-card",
    "meeting-side-panel-card",
    finished ? "meeting-side-panel-card--finished" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <div
        className={`app-side-panel-item-row-primary inbox-list-item-card-layer${
          hasTitleStack ? " email-side-panel-primary--with-stack" : ""
        }`}
      >
        <InboxItemTypeIcon
          kind="meeting"
          size={14}
          style={meetingIconStyle}
        />
        <span
          className={[
            "inbox-list-item-title-wrap",
            hasTitleStack ? "inbox-list-item-title-wrap--stack" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <span className="inbox-list-item-title-line">
            {incoming ? (
              <>
                <span className="inbox-list-item-incoming-label">New</span>
                {" · "}
              </>
            ) : null}
            <span className="inbox-list-item-title" title={item.title}>
              {item.title}
            </span>
            {titleTrailing ? (
              <span className="inbox-list-item-title-trailing">
                {titleTrailing}
              </span>
            ) : null}
          </span>
          {scheduleLabel ? (
            <span
              className="inbox-list-item-card-subtitle"
              title={scheduleLabel}
            >
              {scheduleLabel}
            </span>
          ) : null}
        </span>
      </div>
      <ListItemMetaProperties>
          {projectLabel ? (
            <ListItemProjectMeta projectName={projectLabel} />
          ) : null}
          {organizationLabel ? (
            <ListItemOrganizationMeta
              organizationName={organizationLabel}
              organizationAvatarSrc={item.organizationAvatarSrc}
            />
          ) : null}
      </ListItemMetaProperties>
    </>
  );

  if ("Link" in props && props.Link) {
    const { href, Link } = props;
    return (
      <div className={cardClassName}>
        <Link
          to={href}
          aria-current={active ? "page" : undefined}
          aria-label={`${displayId}: ${item.title}`}
          className="inbox-list-item-hit-area"
        />
        {content}
      </div>
    );
  }

  const { onActivate } = props;
  const navProps = itemId
    ? keyboardNavItemProps(itemId)
    : ({} as HTMLAttributes<HTMLDivElement>);

  return (
    <div
      role="button"
      tabIndex={0}
      className={cardClassName}
      onClick={onActivate}
      onKeyDown={(event) => handleButtonKeyDown(event, onActivate)}
      {...navProps}
    >
      {content}
    </div>
  );
}
