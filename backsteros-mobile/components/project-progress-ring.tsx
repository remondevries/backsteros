import Svg, { G, Path } from "react-native-svg";

import {
  computeProjectTaskProgressRatio,
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  formatProjectTaskProgressLabel,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
  type ProjectTaskProgress,
} from "../lib/project-progress-ring";
import { TASK_STATUS_COLORS } from "../lib/task-status";
import { colors } from "../lib/theme";

type Props = {
  progress: ProjectTaskProgress;
  size?: number;
};

/** Hex progress ring — same geometry/color as desktop `ProjectProgressRing`. */
export function ProjectProgressRing({ progress, size = 14 }: Props) {
  const hasTasks = progress.total > 0;
  const color = hasTasks ? TASK_STATUS_COLORS.completed : colors.muted;
  const fillRatio = computeProjectTaskProgressRatio(
    progress.completed,
    progress.total,
  );
  const wedgePath = describeProjectProgressPieWedge(fillRatio);
  const hexOutlinePath = describeProjectProgressHexagonPath();
  const label = formatProjectTaskProgressLabel(progress);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <G fill="none">
        {hasTasks && wedgePath ? (
          <Path d={wedgePath} fill={color} />
        ) : null}
        <Path
          d={hexOutlinePath}
          fill="none"
          stroke={color}
          strokeWidth={PROJECT_PROGRESS_HEX_STROKE_WIDTH}
          strokeLinejoin="round"
        />
      </G>
    </Svg>
  );
}
