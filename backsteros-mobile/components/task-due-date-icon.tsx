import Svg, { Path } from "react-native-svg";

import type { TaskDueDateUrgency } from "../lib/task-due-date";
import { TASK_STATUS_COLORS } from "../lib/task-status";
import { colors } from "../lib/theme";

type Props = {
  active?: boolean;
  urgency?: TaskDueDateUrgency | null;
  size?: number;
};

function resolveColor(
  active: boolean,
  urgency: TaskDueDateUrgency | null | undefined,
): string {
  if (!active) return colors.muted;
  if (urgency === "due_today") return TASK_STATUS_COLORS.on_hold;
  if (urgency === "due_soon") return TASK_STATUS_COLORS.triage;
  return colors.muted;
}

export function TaskDueDateIcon({
  active = false,
  urgency = null,
  size = 12,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <Path
        d="M11 1C13.2091 1 15 2.79086 15 5V11C15 13.2091 13.2091 15 11 15H5C2.79086 15 1 13.2091 1 11V5C1 2.79086 2.79086 1 5 1H11ZM13.5 6H2.5V11C2.5 12.3807 3.61929 13.5 5 13.5H11C12.3807 13.5 13.5 12.3807 13.5 11V6Z"
        fill={resolveColor(active, urgency)}
      />
    </Svg>
  );
}
