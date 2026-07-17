import { LetterOcticon } from "@/components/letters/letter-octicon";
import { TasksNavIcon } from "@/components/shell/sidebar-nav-icons";

type InboxItemTypeIconProps = {
  kind: "task" | "letter";
  letterIcon?: string | null;
  className?: string;
  size?: number;
};

export function InboxItemTypeIcon({
  kind,
  letterIcon,
  className = "shrink-0 text-foreground/70",
  size = 12,
}: InboxItemTypeIconProps) {
  const label = kind === "letter" ? "Letter" : "Task";

  return (
    <span
      className="inline-flex shrink-0 items-center justify-center"
      title={label}
      style={{ width: size, height: size }}
    >
      {kind === "letter" ? (
        <LetterOcticon icon={letterIcon} size={size} className={className} />
      ) : (
        <TasksNavIcon className={`${className} size-full`} />
      )}
    </span>
  );
}
