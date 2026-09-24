import type { CSSProperties } from "react";
import { LetterIcon } from "../letters/letter-icon.js";
import { CalendarIcon } from "../icons/calendar-icon.js";
import { EmailNavIcon, TasksNavIcon } from "../shell/sidebar-nav-icons.js";

export type InboxItemTypeIconProps = {
  kind: "task" | "letter" | "email" | "meeting";
  className?: string;
  size?: number;
  style?: CSSProperties;
  /** Orange corner dot for unread AgentMail messages. */
  unread?: boolean;
};

export function InboxItemTypeIcon({
  kind,
  className = "",
  size = 12,
  style,
  unread = false,
}: InboxItemTypeIconProps) {
  const label =
    kind === "letter"
      ? "Letter"
      : kind === "email"
        ? unread
          ? "Unread e-mail"
          : "E-mail"
        : kind === "meeting"
          ? "Meeting"
          : "Task";

  return (
    <span
      className={[
        "inbox-item-type-icon",
        unread && kind === "email" ? "inbox-item-type-icon--unread" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={label}
      style={{ width: size, height: size, ...style }}
      aria-hidden="true"
    >
      {kind === "letter" ? (
        <LetterIcon size={size} />
      ) : kind === "email" ? (
        <EmailNavIcon className="size-full" size={size} />
      ) : kind === "meeting" ? (
        // Inherit parent `style.color` (schedule-week tone on the meetings rail).
        <CalendarIcon size={size} />
      ) : (
        <TasksNavIcon className="size-full" />
      )}
      {unread && kind === "email" ? (
        <span className="inbox-item-type-icon__unread-dot" />
      ) : null}
    </span>
  );
}
