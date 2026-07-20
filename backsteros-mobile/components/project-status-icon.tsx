import Svg, { G, Path } from "react-native-svg";

import {
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
} from "../lib/project-progress-ring";
import {
  migrateLegacyProjectStatus,
  type ProjectStatus,
} from "../lib/project-status";
import { TASK_STATUS_COLORS, type TaskStatus } from "../lib/task-status";

type Props = {
  status: string | null | undefined;
  size?: number;
};

const PROJECT_RING_FILL: Partial<Record<ProjectStatus, number>> = {
  active: 0.48,
  on_hold: 0.34,
  canceled: 0,
};

const PROJECT_BACKLOG_HEX_STROKE_DASHARRAY = "3.25 2";

function mapProjectStatusToTaskStatus(status: ProjectStatus): TaskStatus {
  switch (status) {
    case "active":
      return "in_progress";
    case "backlog":
      return "backlog";
    case "on_hold":
      return "on_hold";
    case "completed":
      return "completed";
    case "canceled":
      return "canceled";
  }
}

/** Hex status glyph — same shapes as desktop `ProjectStatusIcon`. */
export function ProjectStatusIcon({ status, size = 14 }: Props) {
  const normalized = migrateLegacyProjectStatus(status);
  const color = TASK_STATUS_COLORS[mapProjectStatusToTaskStatus(normalized)];
  const hexOutline = describeProjectProgressHexagonPath();

  return (
    <Svg width={size} height={size} viewBox="0 0 14 14" accessibilityRole="image">
      <G fill="none">
        {normalized === "backlog" ? (
          <Path
            d={hexOutline}
            fill="none"
            stroke={color}
            strokeWidth={PROJECT_PROGRESS_HEX_STROKE_WIDTH}
            strokeLinejoin="round"
            strokeDasharray={PROJECT_BACKLOG_HEX_STROKE_DASHARRAY}
          />
        ) : null}

        {normalized === "completed" ? (
          <>
            <Path d={describeProjectProgressPieWedge(1)} fill={color} />
            <Path
              d={hexOutline}
              fill="none"
              stroke={color}
              strokeWidth={PROJECT_PROGRESS_HEX_STROKE_WIDTH}
              strokeLinejoin="round"
            />
            <Path
              fillRule="evenodd"
              clipRule="evenodd"
              fill={color}
              d="M11.101 5.101C11.433 4.769 11.433 4.231 11.101 3.899C10.769 3.567 10.231 3.567 9.899 3.899L5.5 8.298L4.101 6.899C3.769 6.567 3.231 6.567 2.899 6.899C2.567 7.231 2.567 7.769 2.899 8.101L4.899 10.101C5.231 10.433 5.769 10.433 6.101 10.101L11.101 5.101Z"
            />
          </>
        ) : null}

        {normalized === "active" ||
        normalized === "on_hold" ||
        normalized === "canceled" ? (
          <>
            {(PROJECT_RING_FILL[normalized] ?? 0) > 0 ? (
              <Path
                d={describeProjectProgressPieWedge(
                  PROJECT_RING_FILL[normalized] ?? 0,
                )}
                fill={color}
              />
            ) : null}
            <Path
              d={hexOutline}
              fill="none"
              stroke={color}
              strokeWidth={PROJECT_PROGRESS_HEX_STROKE_WIDTH}
              strokeLinejoin="round"
            />
          </>
        ) : null}
      </G>
    </Svg>
  );
}
