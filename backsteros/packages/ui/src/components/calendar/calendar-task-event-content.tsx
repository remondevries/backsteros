"use client";

import type { EventContentArg } from "@fullcalendar/core";

import {
  calendarEntityFromEvent,
  calendarEventDurationMs,
  calendarEventHasExpandedContent,
} from "../../calendar/calendar-events.js";
import { MEETINGS_AVAILABILITY_MARKER_TYPE } from "../../calendar/calendar-availability-events.js";
import { isPastCompletedMeeting } from "../../meetings/meeting-status.js";
import {
  CommunicationInstagramKindIcon,
  CommunicationXKindIcon,
} from "../communication/communication-kind-icons.js";
import { DevNullIcon } from "../icons/dev-null-icon.js";
import { FacebookIcon } from "../icons/facebook-icon.js";
import { GoogleIcon } from "../icons/google-icon.js";
import { LinkedInIcon } from "../icons/linkedin-icon.js";
import { SocialImageIcon } from "../icons/social-image-icon.js";
import { DefaultProjectIcon } from "../projects/default-project-icon.js";
import { ProjectOcticon } from "../projects/project-octicon.js";
import { TaskStatusIcon } from "../tasks/task-status-icon.js";
import { BirthdayCalendarIcon } from "./birthday-calendar-icon.js";
import { MeetingCalendarStatusIcon } from "./meeting-calendar-status-icon.js";

const SOCIAL_CALENDAR_PLATFORMS = [
  "facebook",
  "instagram",
  "x",
  "linkedin",
  "dev-null",
] as const;

type SocialCalendarPlatform = (typeof SOCIAL_CALENDAR_PLATFORMS)[number];

function readSocialPlatform(
  extendedProps: Record<string, unknown>,
): SocialCalendarPlatform | null {
  const value = extendedProps.socialPlatform;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (
    SOCIAL_CALENDAR_PLATFORMS.find((platform) => platform === normalized) ??
    null
  );
}

function readSocialPlatforms(
  extendedProps: Record<string, unknown>,
): SocialCalendarPlatform[] {
  const raw = extendedProps.socialPlatforms;
  if (Array.isArray(raw)) {
    const platforms = raw
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .map(
        (entry) =>
          SOCIAL_CALENDAR_PLATFORMS.find((platform) => platform === entry) ??
          null,
      )
      .filter((entry): entry is SocialCalendarPlatform => entry != null);
    if (platforms.length > 0) return platforms;
  }
  const single = readSocialPlatform(extendedProps);
  return single ? [single] : [];
}

function SocialCalendarPlatformIcon({
  platform,
  size = 12,
}: {
  platform: SocialCalendarPlatform;
  size?: number;
}) {
  if (platform === "instagram") {
    return <CommunicationInstagramKindIcon size={size} />;
  }
  if (platform === "x") {
    return <CommunicationXKindIcon size={size} />;
  }
  if (platform === "facebook") {
    return <FacebookIcon size={size} />;
  }
  if (platform === "linkedin") {
    return <LinkedInIcon size={size} />;
  }
  return <DevNullIcon size={size} />;
}

function readMeetingFinished(
  extendedProps: Record<string, unknown>,
): boolean {
  if (extendedProps.finished === true) return true;
  if (extendedProps.finished === false) return false;
  const endAt = extendedProps.endAt;
  const status = extendedProps.status;
  if (
    (typeof endAt === "string" || endAt instanceof Date || typeof endAt === "number") &&
    (typeof status === "string" || status == null)
  ) {
    return isPastCompletedMeeting({
      endAt,
      status: typeof status === "string" ? status : null,
    });
  }
  return false;
}

function readProjectName(extendedProps: Record<string, unknown>): string | null {
  const value = extendedProps.projectName;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readHabitId(extendedProps: Record<string, unknown>): string | null {
  const value = extendedProps.habitId;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readHabitIcon(extendedProps: Record<string, unknown>): string | null {
  const value = extendedProps.habitIcon;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readSocialImageOnly(
  extendedProps: Record<string, unknown>,
): boolean {
  return extendedProps.socialImageOnly === true;
}

function readSocialMediaPreviewUrl(
  extendedProps: Record<string, unknown>,
): string | null {
  const value = extendedProps.socialMediaPreviewUrl;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function readSocialMediaKind(
  extendedProps: Record<string, unknown>,
): "image" | "video" | null {
  const value = extendedProps.socialMediaKind;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized === "video" || normalized === "image" ? normalized : null;
}

function readSocialHashtags(
  extendedProps: Record<string, unknown>,
): string[] {
  const value = extendedProps.socialHashtags;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (tag): tag is string => typeof tag === "string" && tag.trim().length > 0,
  );
}

/** Social posts are a point-in-time — always 24h start (e.g. `17:00`). */
function socialStartTimeText(arg: EventContentArg): string {
  const start = arg.event.start;
  if (!start) return "";
  const hours = String(start.getHours()).padStart(2, "0");
  const minutes = String(start.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export type CalendarTaskEventContentOptions = {
  /** Network Planned — return a scheduled post to the unscheduled tray. */
  onSocialPlanUnschedule?: (taskId: string) => void;
};

export function CalendarTaskEventContent({
  arg,
  onSocialPlanUnschedule,
}: {
  arg: EventContentArg;
  onSocialPlanUnschedule?: (taskId: string) => void;
}) {
  const entity = calendarEntityFromEvent(arg.event);
  const habitId = readHabitId(arg.event.extendedProps);
  const habitIcon = readHabitIcon(arg.event.extendedProps);
  const socialPlatforms = readSocialPlatforms(arg.event.extendedProps);
  const socialImageOnly = readSocialImageOnly(arg.event.extendedProps);
  const socialMediaPreviewUrl = readSocialMediaPreviewUrl(
    arg.event.extendedProps,
  );
  const socialMediaKind = readSocialMediaKind(arg.event.extendedProps);
  const socialHashtags = readSocialHashtags(arg.event.extendedProps);
  const isSocial = socialPlatforms.length > 0;
  const title =
    arg.event.title?.trim() ||
    (isSocial
      ? socialImageOnly
        ? ""
        : "Untitled post"
      : entity.entityType === "meeting"
        ? "Untitled meeting"
        : entity.entityType === "birthday"
          ? "Birthday"
          : entity.entityType === "external"
            ? "Calendar event"
            : habitId
              ? "Untitled habit"
              : "Untitled task");
  const projectName = isSocial
    ? null
    : readProjectName(arg.event.extendedProps);
  const durationMs = calendarEventDurationMs(arg.event.start, arg.event.end);
  // All-day chips (Google birthdays, tasks, …) are always a single icon+title
  // row — day-long FC ranges would otherwise trip the timed expanded layout.
  // Social planned posts always stack: start time, caption/hashtags, platforms.
  const expanded =
    isSocial ||
    (!arg.event.allDay && calendarEventHasExpandedContent(durationMs));
  if (isSocial) {
    const timeText = socialStartTimeText(arg);
    const taskId =
      entity.entityType === "task" ? entity.entityId : arg.event.id;
    return (
      <div className="task-calendar-event__content task-calendar-event__content--expanded social-planned-calendar-event__content">
        {onSocialPlanUnschedule && taskId ? (
          <button
            type="button"
            className="social-planned-calendar-event__unschedule"
            aria-label="Move back to planning tray"
            title="Move back to planning tray"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              // Defer so FullCalendar can finish this click before React
              // removes the event node (avoids removeChild crashes).
              const id = taskId;
              window.setTimeout(() => onSocialPlanUnschedule(id), 0);
            }}
          >
            <svg
              className="social-planned-calendar-event__unschedule-icon"
              width="8"
              height="8"
              viewBox="0 0 8 8"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M1.2 1.2l5.6 5.6M6.8 1.2L1.2 6.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
        {timeText ? (
          <div className="task-calendar-event__row">
            <span className="task-calendar-event__time">{timeText}</span>
          </div>
        ) : null}
        {title ? (
          <span className="task-calendar-event__title">{title}</span>
        ) : null}
        {socialMediaPreviewUrl ? (
          <span
            className="social-planned-calendar-event__media"
            title={socialMediaKind === "video" ? "Video" : "Image"}
            aria-label={socialMediaKind === "video" ? "Video" : "Image"}
          >
            {socialMediaKind === "video" ? (
              <video
                className="social-planned-calendar-event__media-thumb"
                src={socialMediaPreviewUrl}
                muted
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                className="social-planned-calendar-event__media-thumb"
                src={socialMediaPreviewUrl}
                alt=""
                draggable={false}
              />
            )}
          </span>
        ) : socialImageOnly ? (
          <span
            className="social-planned-calendar-event__image"
            title="Image post"
            aria-label="Image post"
          >
            <SocialImageIcon size={14} />
          </span>
        ) : null}
        {socialHashtags.length > 0 ? (
          <span className="social-planned-calendar-event__hashtags">
            {socialHashtags.join(" ")}
          </span>
        ) : null}
        <span
          className={[
            "social-planned-calendar-event__platforms",
            socialPlatforms.length > 1
              ? "social-planned-calendar-event__platforms--multi"
              : null,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-hidden="true"
        >
          {socialPlatforms.map((platform) => (
            <span
              key={platform}
              className="social-planned-calendar-event__platform-icon"
            >
              <SocialCalendarPlatformIcon platform={platform} size={12} />
            </span>
          ))}
        </span>
      </div>
    );
  }

  const meetingFinished =
    entity.entityType === "meeting" &&
    readMeetingFinished(arg.event.extendedProps);
  const meetingStatus =
    typeof arg.event.extendedProps.status === "string"
      ? arg.event.extendedProps.status
      : null;

  const statusIcon =
    entity.entityType === "birthday" ? (
      <BirthdayCalendarIcon
        size={12}
        className="task-calendar-event__status-icon birthday-calendar-event__icon"
      />
    ) : entity.entityType === "external" ? (
      <GoogleIcon
        size={12}
        className="task-calendar-event__status-icon external-calendar-event__icon"
      />
    ) : entity.entityType === "meeting" ? (
      <MeetingCalendarStatusIcon
        startAt={arg.event.start}
        endAt={
          arg.event.extendedProps.openEnded === true
            ? null
            : typeof arg.event.extendedProps.endAt === "string"
              ? arg.event.extendedProps.endAt
              : arg.event.end
        }
        status={meetingStatus}
        finished={meetingFinished}
        now={new Date()}
        size={12}
        className="task-calendar-event__status-icon"
      />
    ) : habitId ? (
      <span className="task-calendar-event__status-icon" aria-hidden="true">
        {habitIcon ? (
          <ProjectOcticon icon={habitIcon} size={12} />
        ) : (
          <DefaultProjectIcon size={12} />
        )}
      </span>
    ) : (
      <TaskStatusIcon
        status={
          typeof arg.event.extendedProps.status === "string"
            ? arg.event.extendedProps.status
            : "ready_to_start"
        }
        size={12}
        className="task-calendar-event__status-icon"
        support={Boolean(arg.event.extendedProps.support)}
        notification={Boolean(arg.event.extendedProps.notification)}
        inboxUpdatedAt={
          "inboxUpdatedAt" in arg.event.extendedProps
            ? (arg.event.extendedProps.inboxUpdatedAt as
                | number
                | Date
                | string
                | null)
            : null
        }
      />
    );

  return (
    <div
      className={`task-calendar-event__content${
        expanded ? " task-calendar-event__content--expanded" : ""
      }`}
    >
      {expanded && projectName ? (
        <span className="task-calendar-event__project">{projectName}</span>
      ) : null}
      {expanded ? (
        <>
          <div className="task-calendar-event__row">
            {statusIcon}
            {arg.timeText ? (
              <span className="task-calendar-event__time">{arg.timeText}</span>
            ) : null}
          </div>
          <span className="task-calendar-event__title">{title}</span>
        </>
      ) : (
        <div className="task-calendar-event__row">
          {statusIcon}
          <span className="task-calendar-event__title">{title}</span>
          {arg.timeText ? (
            <span className="task-calendar-event__time">{arg.timeText}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function renderCalendarTaskEventContent(
  arg: EventContentArg,
  options?: CalendarTaskEventContentOptions,
) {
  if (
    arg.event.display === "background" ||
    arg.event.extendedProps.entityType === MEETINGS_AVAILABILITY_MARKER_TYPE
  ) {
    return null;
  }
  return (
    <CalendarTaskEventContent
      arg={arg}
      onSocialPlanUnschedule={options?.onSocialPlanUnschedule}
    />
  );
}
