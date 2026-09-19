"use client";

import {
  formatTimetrackingHumanDuration,
  sumBreakdownSeconds,
  type TimetrackingBreakdownSlice,
} from "../../calendar/calendar-timetracking-breakdown.js";
import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";

export type TimetrackingContactBreakdownProps = {
  slices: readonly TimetrackingBreakdownSlice[];
  /** Contact id → avatar image URL. */
  avatarSrcByContactId?:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>;
  className?: string;
  emptyMessage?: string;
};

function resolveAvatarSrc(
  map:
    | ReadonlyMap<string, string | null>
    | Record<string, string | null | undefined>
    | undefined,
  contactId: string,
): string | null {
  if (!map) return null;
  if (map instanceof Map) return map.get(contactId) ?? null;
  return (map as Record<string, string | null | undefined>)[contactId] ?? null;
}

/**
 * Segmented bar + legend: tracked time attributed to Related contacts /
 * meeting attendees for the selected period.
 */
export function TimetrackingContactBreakdown({
  slices,
  avatarSrcByContactId,
  className,
  emptyMessage = "No related contacts with tracked time in this period.",
}: TimetrackingContactBreakdownProps) {
  const totalSeconds = sumBreakdownSeconds(slices);
  const visible = slices.filter((slice) => slice.seconds > 0);

  const sectionClass = [
    "calendar-timetracking-contact-breakdown",
    "calendar-timetracking-breakdown",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (visible.length === 0 || totalSeconds <= 0) {
    return (
      <section
        className={sectionClass}
        aria-label="Tracked time by related contact"
      >
        <header className="calendar-timetracking-breakdown__header">
          <h2 className="calendar-timetracking-breakdown__title">
            Related contacts
          </h2>
        </header>
        <p className="calendar-timetracking-breakdown__empty">{emptyMessage}</p>
      </section>
    );
  }

  return (
    <section
      className={sectionClass}
      aria-label="Tracked time by related contact"
    >
      <header className="calendar-timetracking-breakdown__header">
        <h2 className="calendar-timetracking-breakdown__title">
          Related contacts
        </h2>
        <p className="calendar-timetracking-breakdown__total">
          Total: {formatTimetrackingHumanDuration(totalSeconds)}
        </p>
      </header>

      <div
        className="calendar-timetracking-breakdown__bar"
        role="img"
        aria-label="Contact time share"
      >
        {visible.map((slice) => (
          <span
            key={slice.id}
            className="calendar-timetracking-breakdown__bar-segment"
            style={{
              flex: `${slice.seconds} 1 0`,
              background: slice.color,
            }}
            title={`${slice.label}: ${formatTimetrackingHumanDuration(slice.seconds)}`}
          />
        ))}
      </div>

      <ul className="calendar-timetracking-breakdown__legend" role="list">
        {visible.map((slice) => (
          <li
            key={slice.id}
            className="calendar-timetracking-breakdown__legend-item"
          >
            <span
              className="calendar-timetracking-breakdown__avatar"
              style={{ borderColor: slice.color }}
              aria-hidden
            >
              <EntityAvatarIcon
                src={resolveAvatarSrc(avatarSrcByContactId, slice.id)}
                size={20}
                kind="contact"
              />
            </span>
            <span className="calendar-timetracking-breakdown__legend-copy">
              <span className="calendar-timetracking-breakdown__legend-label">
                {slice.label}
              </span>
              <span className="calendar-timetracking-breakdown__legend-value">
                {formatTimetrackingHumanDuration(slice.seconds)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
