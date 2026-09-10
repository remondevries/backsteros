import type { BacksterosDueDateUrgency } from "./taskDueDate";

function resolveUrgencyColor(
  active: boolean,
  urgency: BacksterosDueDateUrgency | null | undefined,
): string | undefined {
  if (!active) return undefined;
  if (urgency === "overdue" || urgency === "due_today") return "#ef4444";
  if (urgency === "due_soon") return "#f59e0b";
  return undefined;
}

/** Calendar glyph matching BacksterOS desktop `TaskDueDateIcon`. */
export function BacksterosTaskDueDateIcon(props: {
  readonly active?: boolean;
  readonly urgency?: BacksterosDueDateUrgency | null;
  readonly size?: number;
  readonly className?: string | undefined;
}) {
  const active = props.active ?? false;
  const size = props.size ?? 14;
  const color = resolveUrgencyColor(active, props.urgency);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={props.className}
      style={color ? { color } : active ? undefined : { opacity: 0.55 }}
    >
      <path
        d="M11 1C13.2091 1 15 2.79086 15 5V11C15 13.2091 13.2091 15 11 15H5C2.79086 15 1 13.2091 1 11V5C1 2.79086 2.79086 1 5 1H11ZM13.5 6H2.5V11C2.5 12.3807 3.61929 13.5 5 13.5H11C12.3807 13.5 13.5 12.3807 13.5 11V6Z"
        fill="currentColor"
      />
    </svg>
  );
}
