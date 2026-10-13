"use client";

import { EntityAvatarIcon } from "../entity/entity-avatar-icon.js";
import { ContactPersonIcon } from "../contacts/contact-person-icon.js";

export type AssigneeListMarkProps = {
  /** Display name used for the initial fallback and accessibility. */
  label: string;
  /** Uploaded avatar URL — when set, shown instead of the initial. */
  avatarSrc?: string | null;
  /** When true, show the unassigned person glyph instead of a letter. */
  unassigned?: boolean;
  size?: number;
};

/** First letter of the assignee name for list-row marks. */
export function assigneeListInitial(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return "?";
  return trimmed.charAt(0).toUpperCase();
}

/**
 * Compact assignee mark for inbox / task list rows:
 * custom avatar when present, otherwise the first letter of the name.
 * Unassigned uses the person glyph. Pair with {@link Tooltip} on the trigger.
 */
export function AssigneeListMark({
  label,
  avatarSrc,
  unassigned = false,
  size = 18,
}: AssigneeListMarkProps) {
  if (unassigned) {
    return (
      <ContactPersonIcon
        size={Math.max(12, Math.round(size * 0.78))}
        className="text-foreground/70"
      />
    );
  }

  if (avatarSrc) {
    return <EntityAvatarIcon src={avatarSrc} size={size} kind="contact" />;
  }

  return (
    <span
      className="assignee-list-mark"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, Math.round(size * 0.55)),
      }}
      aria-hidden="true"
    >
      {assigneeListInitial(label)}
    </span>
  );
}
