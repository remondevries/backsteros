import { LetterIcon } from "./letter-icon.js";
import { TasksNavIcon } from "./sidebar-nav-icons.js";

export type InboxItemTypeIconProps = {
  kind: "task" | "letter";
  className?: string;
  size?: number;
};

export function InboxItemTypeIcon({
  kind,
  className = "",
  size = 12,
}: InboxItemTypeIconProps) {
  const label = kind === "letter" ? "Letter" : "Task";

  return (
    <span
      className={`inbox-item-type-icon ${className}`.trim()}
      title={label}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {kind === "letter" ? (
        <LetterIcon size={size} />
      ) : (
        <TasksNavIcon className="size-full" />
      )}
    </span>
  );
}
