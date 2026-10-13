import { useMemo } from "react";

import { BacksterosActivityLeadingIcon, renderBacksterosActivityMessage } from "./activityMessage";
import { formatBacksterosActivityRelativeTime } from "./activityTime";
import { buildBacksterosActivityTimeline } from "./coalesceActivities";
import { BacksterosTaskStatusWorkingPulse } from "./TaskStatusWorkingPulse";
import type { BacksterosTaskActivity } from "./types";
import "./backsterosActivity.css";

const VISIBLE_ACTIVITY_LIMIT = 12;

/**
 * Newest-first activity timeline matching BacksterOS desktop `TaskActivityPanel`
 * feed chrome (rail, type markers, muted copy + strong accents, relative time).
 * Property edits coalesce; consecutive agent_worked rows group.
 * When `working`, shows a live "{name} is working/reviewing…" row at the top
 * (desktop parity).
 */
export function BacksterosTaskActivityTimeline(props: {
  readonly activities: readonly BacksterosTaskActivity[];
  readonly avatarSrcByContactId?: Readonly<Record<string, string>> | undefined;
  /** Live agent presence for this task — mirrors desktop `working` prop. */
  readonly working?: boolean;
  /**
   * Display name for the live working row (assignee, else settings agent contact).
   * Falls back to "Someone" when omitted/blank.
   */
  readonly workingActorName?: string | null;
  /** OS-96: `reviewing` while an agent reviews an in_review task. */
  readonly workingActorVerb?: "working" | "reviewing" | null;
}) {
  const timeline = useMemo(
    () => buildBacksterosActivityTimeline(props.activities),
    [props.activities],
  );

  if (timeline.length === 0 && !props.working) {
    return <p className="bos-task-activity__empty">No activity yet.</p>;
  }

  const visible = timeline.slice(0, VISIBLE_ACTIVITY_LIMIT);
  const hidden = Math.max(0, timeline.length - visible.length);
  const workingName = props.workingActorName?.trim() || "Someone";
  const workingVerb = props.workingActorVerb === "reviewing" ? "reviewing" : "working";

  return (
    <div className="bos-task-activity">
      <ul className="bos-task-activity-timeline">
        {props.working ? (
          <li
            className="bos-task-activity-event bos-task-activity-event--agent_working"
            role="status"
          >
            <span className="bos-task-activity-event__leading">
              <span className="bos-task-activity-event__rail" aria-hidden="true">
                <span className="bos-task-activity-event__marker">
                  <span className="bos-task-activity-event__loader">
                    <BacksterosTaskStatusWorkingPulse
                      size={12}
                      compact
                      aria-label={`${workingName} ${workingVerb}`}
                    />
                  </span>
                </span>
              </span>
            </span>
            <div className="bos-task-activity-event__text">
              <strong>{workingName}</strong> is {workingVerb}…
            </div>
          </li>
        ) : null}
        {visible.map((item) => {
          const { activity, count, at } = item;
          const isAvatar =
            activity.type === "assignee_changed" ||
            (activity.type !== "status_changed" &&
              activity.type !== "priority_changed" &&
              activity.type !== "due_date_changed" &&
              activity.type !== "related_contacts_changed" &&
              activity.type !== "related_organizations_changed" &&
              activity.type !== "created" &&
              activity.type !== "timer_started" &&
              activity.type !== "timer_stopped" &&
              activity.type !== "automate_completion_changed" &&
              activity.type !== "auto_review_requested");

          return (
            <li
              key={activity.id}
              className={`bos-task-activity-event bos-task-activity-event--${activity.type}`}
            >
              <span className="bos-task-activity-event__leading">
                <span className="bos-task-activity-event__rail" aria-hidden="true">
                  <span
                    className={[
                      "bos-task-activity-event__marker",
                      isAvatar ? "bos-task-activity-event__marker--avatar" : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <BacksterosActivityLeadingIcon
                      activity={activity}
                      avatarSrcByContactId={props.avatarSrcByContactId}
                    />
                  </span>
                </span>
              </span>
              <div className="bos-task-activity-event__text">
                {renderBacksterosActivityMessage(activity)}
                {count > 1 ? (
                  <span className="bos-task-activity-event__count">x{count}</span>
                ) : null}
              </div>
              <time
                className="bos-task-activity-event__time"
                dateTime={at}
                title={new Date(at).toLocaleString()}
              >
                {formatBacksterosActivityRelativeTime(at)}
              </time>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? <p className="bos-task-activity__more">+{hidden} earlier</p> : null}
    </div>
  );
}
