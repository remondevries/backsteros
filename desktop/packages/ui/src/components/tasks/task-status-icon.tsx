"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "../../entity/icon-color.js";
import {
  getTaskStatusLabel,
  isTaskStatus,
  type TaskStatus,
} from "../../tasks/task-status.js";
import {
  computeTaskStatusIconModel,
  describeTaskStatusPieWedge,
  taskStatusRingPath,
  TASK_STATUS_RING_STROKE_WIDTH,
} from "../../tasks/task-status-icon-model.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../../tasks/task-status-color.js";
import { TaskStatusWorkingPulse } from "./task-status-working-pulse.js";
import { IconWithInboxUpdateIndicator } from "../shared/icon-with-inbox-update-indicator.js";

function TriageIcon() {
  return (
    <path
      fill="currentColor"
      d="M7 14C10.866 14 14 10.866 14 7C14 3.13403 10.866 0 7 0C3.134 0 0 3.13403 0 7C0 10.866 3.134 14 7 14ZM8.0126 9.50781V7.98224H5.9874V9.50787C5.9874 9.92908 5.4767 10.1549 5.14897 9.8786L2.17419 7.37073C1.94194 7.17493 1.94194 6.82513 2.17419 6.62933L5.14897 4.12146C5.4767 3.84515 5.9874 4.07098 5.9874 4.49219V6.01764H8.0126V4.49213C8.0126 4.07092 8.5233 3.84509 8.85103 4.1214L11.8258 6.62927C12.0581 6.82507 12.0581 7.17487 11.8258 7.37067L8.85103 9.87854C8.5233 10.1548 8.0126 9.92902 8.0126 9.50781Z"
    />
  );
}

function BacklogIcon() {
  return (
    <path d="M13.941 7.914L11.958 7.656C11.986 7.442 12 7.223 12 7C12 6.777 11.986 6.558 11.958 6.344L13.941 6.086C13.98 6.385 14 6.69 14 7C14 7.31 13.98 7.615 13.941 7.914ZM13.469 4.32C13.233 3.751 12.924 3.22 12.554 2.739L10.968 3.957C11.233 4.302 11.453 4.681 11.621 5.087L13.469 4.32ZM11.261 1.446L10.043 3.032C9.698 2.767 9.319 2.547 8.913 2.379L9.68 0.531C10.249 0.767 10.78 1.076 11.261 1.446ZM7.914 0.059L7.656 2.042C7.442 2.014 7.223 2 7 2C6.777 2 6.558 2.014 6.344 2.042L6.086 0.059C6.385 0.02 6.69 0 7 0C7.31 0 7.615 0.02 7.914 0.059ZM4.32 0.531L5.087 2.379C4.681 2.547 4.302 2.767 3.957 3.032L2.739 1.446C3.22 1.076 3.751 0.767 4.32 0.531ZM1.446 2.739L3.032 3.957C2.767 4.302 2.547 4.681 2.379 5.087L0.531 4.32C0.767 3.751 1.076 3.22 1.446 2.739ZM0.059 6.086C0.02 6.385 0 6.69 0 7C0 7.31 0.02 7.615 0.059 7.914L2.042 7.656C2.014 7.442 2 7.223 2 7C2 6.777 2.014 6.558 2.042 6.344L0.059 6.086ZM0.531 9.68L2.379 8.913C2.547 9.319 2.767 9.698 3.032 10.043L1.446 11.261C1.076 10.78 0.767 10.249 0.531 9.68ZM2.739 12.554L3.957 10.968C4.302 11.233 4.681 11.453 5.087 11.621L4.32 13.469C3.751 13.233 3.22 12.924 2.739 12.554ZM6.086 13.941L6.344 11.958C6.558 11.986 6.777 12 7 12C7.223 12 7.442 11.986 7.656 11.958L7.914 13.941C7.615 13.98 7.31 14 7 14C6.69 14 6.385 13.98 6.086 13.941ZM9.68 13.469L8.913 11.621C9.319 11.453 9.698 11.233 10.043 10.968L11.261 12.554C10.78 12.924 10.249 13.233 9.68 13.469ZM12.554 11.261L10.968 10.043C11.233 9.698 11.453 9.319 11.621 8.913L13.469 9.68C13.233 10.249 12.924 10.78 12.554 11.261Z" />
  );
}

function CompletedIcon() {
  return (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M7 0C3.134 0 0 3.134 0 7C0 10.866 3.134 14 7 14C10.866 14 14 10.866 14 7C14 3.134 10.866 0 7 0ZM11.101 5.101C11.433 4.769 11.433 4.231 11.101 3.899C10.769 3.567 10.231 3.567 9.899 3.899L5.5 8.298L4.101 6.899C3.769 6.567 3.231 6.567 2.899 6.899C2.567 7.231 2.567 7.769 2.899 8.101L4.899 10.101C5.231 10.433 5.769 10.433 6.101 10.101L11.101 5.101Z"
      fill="currentColor"
    />
  );
}

function DuplicatedIcon() {
  return (
    <>
      <rect
        x="2.5"
        y="4"
        width="7"
        height="7"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <rect
        x="5.5"
        y="2"
        width="7"
        height="7"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
      />
    </>
  );
}

function ProgressRingIcon({ fillRatio }: { fillRatio: number }) {
  const wedgePath = describeTaskStatusPieWedge(fillRatio);

  return (
    <>
      {wedgePath ? <path d={wedgePath} fill="currentColor" /> : null}
      <path
        d={taskStatusRingPath()}
        fill="none"
        stroke="currentColor"
        strokeWidth={TASK_STATUS_RING_STROKE_WIDTH}
      />
    </>
  );
}

function NotificationBellIcon() {
  return (
    <path
      fill="currentColor"
      d="M15.737 17.75c-.07.813-.27 1.654-.696 2.36-.592.98-1.588 1.64-3.042 1.64s-2.449-.66-3.04-1.64c-.427-.706-.627-1.547-.697-2.36H5.366c-.596 0-1.129-.148-1.526-.497-.403-.356-.566-.831-.588-1.28-.04-.846.405-1.742.976-2.309.68-.676.985-1.602 1.138-2.749.076-.571.111-1.169.146-1.796l.004-.066c.034-.596.069-1.22.144-1.822.156-1.241.5-2.536 1.508-3.5C8.182 2.758 9.73 2.25 11.999 2.25s3.818.509 4.832 1.48c1.008.965 1.352 2.26 1.508 3.501.075.602.11 1.226.144 1.822l.003.066c.036.627.07 1.225.147 1.796.153 1.147.458 2.073 1.138 2.75.588.584 1.028 1.485.975 2.334-.028.448-.2.916-.603 1.263-.396.342-.923.488-1.51.488z"
    />
  );
}

/** Support-ring glyph for client support tickets (status color preserved). */
function SupportTicketIcon() {
  return (
    <path
      fill="currentColor"
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.348 4.45055L10.1504 6.2827C10.2578 6.75577 10.2578 7.24689 10.1504 7.72001L12.348 9.55072C12.7265 8.75404 12.923 7.88305 12.923 7.00098C12.923 6.11893 12.7265 5.24723 12.348 4.45055ZM9.55022 12.3492L7.71807 10.1509C7.24496 10.2583 6.75384 10.2583 6.28076 10.1509L4.45005 12.3485C5.24673 12.727 6.11771 12.9234 6.99976 12.9234C7.88183 12.9234 8.75282 12.727 9.5495 12.3485L9.55022 12.3492ZM1.65157 9.55072L3.84986 7.71857C3.74243 7.24546 3.74243 6.75433 3.84986 6.28126L1.65229 4.45199C1.27372 5.24867 1.07731 6.11965 1.07731 7.0017C1.07731 7.88377 1.27372 8.75476 1.65229 9.55144L1.65157 9.55072ZM4.45005 1.65207L6.2822 3.85036C6.75527 3.74292 7.24639 3.74292 7.71951 3.85036L9.55022 1.65279C8.75354 1.27423 7.88255 1.07782 7.00048 1.07782C6.11843 1.07782 5.24745 1.27423 4.45076 1.65279L4.45005 1.65207ZM10.6652 1.03465C11.1317 1.32195 11.563 1.6629 11.9502 2.05052C12.3375 2.43735 12.6782 2.86816 12.9654 3.33417C13.6419 4.43706 14 5.70568 14 6.99955C14 8.29342 13.6419 9.56206 12.9654 10.6649C12.6781 11.1315 12.3371 11.5628 11.9495 11.95C11.5626 12.3373 11.1319 12.678 10.6659 12.9652C9.56285 13.6418 8.29413 14 7.00012 14C5.70612 14 4.43736 13.6418 3.33439 12.9652C2.86835 12.6778 2.43753 12.3369 2.05074 11.9493C1.66321 11.5625 1.32226 11.1317 1.03487 10.6657C0.358182 9.56264 0 8.29392 0 6.99991C0 5.70589 0.358182 4.43714 1.03487 3.33417C1.32226 2.86812 1.66319 2.4373 2.05074 2.05052C2.43753 1.66298 2.86834 1.32203 3.33439 1.03465C4.43728 0.358103 5.7059 0 6.99976 0C8.29363 0 9.56228 0.358103 10.6652 1.03465ZM8.52287 5.47862C8.29808 5.25303 8.02585 5.08036 7.72597 4.9732C7.25652 4.8061 6.74376 4.8061 6.2743 4.9732C5.97441 5.08036 5.70218 5.25303 5.4774 5.47862C5.24336 5.71195 5.07536 5.98476 4.97198 6.27552C4.80489 6.74497 4.80489 7.25774 4.97198 7.72719C5.07536 8.01795 5.24336 8.29076 5.4774 8.52409C5.71073 8.75813 5.98354 8.92613 6.2743 9.02951C6.74239 9.19678 7.25788 9.19678 7.72597 9.02951C8.02585 8.92232 8.29808 8.74966 8.52287 8.52409C8.75691 8.29076 8.9249 8.01795 9.02829 7.72719C9.19528 7.25766 9.19528 6.74499 9.02829 6.27552C8.9211 5.97563 8.74844 5.7034 8.52287 5.47862Z"
    />
  );
}

export type TaskStatusIconProps = {
  status: TaskStatus | string;
  title?: string;
  className?: string;
  size?: number;
  highlighted?: boolean;
  /**
   * When true, replace the static status glyph with the working-pulse
   * animation (agent actively working on this task).
   */
  working?: boolean;
  /**
   * For ring statuses (ready_to_start, in_progress, …), draw only the outer
   * circle — no pie wedge fill. Same ring geometry/color as the status.
   */
  ringOnly?: boolean;
  /**
   * Support tickets use a support-ring glyph instead of the status shape,
   * while keeping the status color.
   */
  support?: boolean;
  /**
   * Notification-style tasks use a bell glyph instead of the status shape,
   * while keeping the status color.
   */
  notification?: boolean;
  /** When set, shows the green Updated indicator on the icon. */
  inboxUpdatedAt?: Date | string | number | null;
};

export function TaskStatusIcon({
  status,
  title,
  className,
  size = 14,
  highlighted = false,
  working = false,
  ringOnly = false,
  support = false,
  notification = false,
  inboxUpdatedAt,
}: TaskStatusIconProps) {
  const normalizedStatus = isTaskStatus(status) ? status : "backlog";
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const model = computeTaskStatusIconModel({
    status: normalizedStatus,
    colorScheme,
  });
  const label = title ?? getTaskStatusLabel(normalizedStatus);

  if (working) {
    return (
      <IconWithInboxUpdateIndicator inboxUpdatedAt={inboxUpdatedAt}>
        <TaskStatusWorkingPulse
          className={className}
          size={size}
          aria-label={title ?? "Agent working"}
        />
      </IconWithInboxUpdateIndicator>
    );
  }

  if (support) {
    return (
      <IconWithInboxUpdateIndicator inboxUpdatedAt={inboxUpdatedAt}>
        <svg
          className={mergeIconSvgClassName(className, { highlighted })}
          style={highlighted ? undefined : iconSvgColorStyle(model.color)}
          viewBox="0 0 14 14"
          width={size}
          height={size}
          fill="none"
          aria-hidden={title ? undefined : true}
          aria-label={title ? undefined : label}
          role={title ? "img" : undefined}
        >
          {title ? <title>{title}</title> : null}
          <SupportTicketIcon />
        </svg>
      </IconWithInboxUpdateIndicator>
    );
  }

  if (notification) {
    return (
      <IconWithInboxUpdateIndicator inboxUpdatedAt={inboxUpdatedAt}>
        <svg
          className={mergeIconSvgClassName(className, { highlighted })}
          style={highlighted ? undefined : iconSvgColorStyle(model.color)}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          aria-hidden={title ? undefined : true}
          aria-label={title ? undefined : label}
          role={title ? "img" : undefined}
        >
          {title ? <title>{title}</title> : null}
          <NotificationBellIcon />
        </svg>
      </IconWithInboxUpdateIndicator>
    );
  }

  return (
    <IconWithInboxUpdateIndicator inboxUpdatedAt={inboxUpdatedAt}>
      <svg
        className={mergeIconSvgClassName(className, { highlighted })}
        style={highlighted ? undefined : iconSvgColorStyle(model.color)}
        viewBox="0 0 14 14"
        width={size}
        height={size}
        aria-hidden={title ? undefined : true}
        aria-label={title ? undefined : label}
        role={title ? "img" : undefined}
      >
        {title ? <title>{title}</title> : null}
        <g fill="none">
          {model.kind === "triage" ? <TriageIcon /> : null}
          {model.kind === "backlog" ? (
            <g fill="currentColor">
              <BacklogIcon />
            </g>
          ) : null}
          {model.kind === "completed" ? <CompletedIcon /> : null}
          {model.kind === "duplicated" ? <DuplicatedIcon /> : null}
          {model.kind === "ring" ? (
            <ProgressRingIcon fillRatio={ringOnly ? 0 : model.fillRatio} />
          ) : null}
        </g>
      </svg>
    </IconWithInboxUpdateIndicator>
  );
}
