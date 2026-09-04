"use client";

import type { ReactNode } from "react";

import { ContactPersonIcon } from "../contacts/contact-person-icon.js";
import { EntityListAvatar } from "../entity/entity-list-avatar.js";
import type { SearchableDropdownOption } from "../dropdowns/searchable-dropdown.js";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../shared/hover-card.js";

export type MeetingAttendeeLabelsDensity = "comfortable" | "compact";

export type MeetingAttendeeLabelsProps = {
  attendeeContactIds: string[];
  attendeeOptions: SearchableDropdownOption<string>[];
  emptyLabel?: string;
  /**
   * `comfortable` — one pill per person when there are multiple.
   * `compact` — "N attendees" with a hover popover listing the pills
   * (narrow meeting panel / inline chips).
   */
  density?: MeetingAttendeeLabelsDensity;
};

function resolveAttendeeOptions(
  attendeeContactIds: string[],
  attendeeOptions: SearchableDropdownOption<string>[],
): SearchableDropdownOption<string>[] {
  return attendeeContactIds
    .map((id) => attendeeOptions.find((option) => option.value === id))
    .filter(
      (option): option is SearchableDropdownOption<string> => Boolean(option),
    );
}

/** Plain joined names for aria-labels / fallbacks. */
export function formatAttendeeNames(
  attendeeContactIds: string[],
  attendeeOptions: SearchableDropdownOption<string>[],
  emptyLabel = "No attendees",
): string {
  const names = resolveAttendeeOptions(attendeeContactIds, attendeeOptions)
    .map((option) => option.label?.trim())
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return emptyLabel;
  return names.join(", ");
}

function AttendeeLabelPills({
  options,
}: {
  options: SearchableDropdownOption<string>[];
}): ReactNode {
  return (
    <span className="meeting-attendee-labels">
      {options.map((option) => (
        <span key={option.value} className="meeting-attendee-label">
          <span className="meeting-attendee-label__icon" aria-hidden="true">
            {option.avatarSrc ? (
              <EntityListAvatar src={option.avatarSrc} size={14} />
            ) : (
              <ContactPersonIcon size={12} />
            )}
          </span>
          <span className="meeting-attendee-label__name">
            {option.label?.trim() || "Attendee"}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Attendees trigger content: one compact label per person when there are
 * multiple; a single name (or empty copy) otherwise. Narrow layouts can use
 * `density="compact"` to collapse to "N attendees" + hover popover.
 */
export function MeetingAttendeeLabels({
  attendeeContactIds,
  attendeeOptions,
  emptyLabel = "No attendees",
  density = "comfortable",
}: MeetingAttendeeLabelsProps): ReactNode {
  const selected = resolveAttendeeOptions(
    attendeeContactIds,
    attendeeOptions,
  );

  if (selected.length === 0) {
    return emptyLabel;
  }

  if (selected.length === 1) {
    return selected[0]!.label?.trim() || emptyLabel;
  }

  const pills = <AttendeeLabelPills options={selected} />;

  if (density !== "compact") {
    return pills;
  }

  const countLabel = `${selected.length} attendees`;

  return (
    <HoverCard openDelay={120} closeDelay={100}>
      <HoverCardTrigger className="meeting-attendee-summary">
        {countLabel}
      </HoverCardTrigger>
      <HoverCardContent
        className="bos-hover-card meeting-attendee-hover-card"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <div className="meeting-attendee-hover-card__title">Attendees</div>
        {pills}
      </HoverCardContent>
    </HoverCard>
  );
}
