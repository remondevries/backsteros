"use client";

import { useSyncExternalStore } from "react";

import { iconSvgColorStyle, mergeIconSvgClassName } from "../icon-color.js";
import {
  describeProjectProgressHexagonPath,
  describeProjectProgressPieWedge,
  PROJECT_BACKLOG_HEX_STROKE_DASHARRAY,
  PROJECT_PROGRESS_HEX_STROKE_WIDTH,
} from "../project-progress-ring.js";
import {
  getProjectStatusLabel,
  isProjectStatus,
  type ProjectStatus,
} from "../project-status.js";
import { computeProjectStatusIconModel } from "../project-status-icon-model.js";
import {
  getPreferredColorSchemeSnapshot,
  subscribeToPreferredColorScheme,
} from "../task-status-color.js";

function CompletedCheckIcon() {
  return (
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M11.101 5.101C11.433 4.769 11.433 4.231 11.101 3.899C10.769 3.567 10.231 3.567 9.899 3.899L5.5 8.298L4.101 6.899C3.769 6.567 3.231 6.567 2.899 6.899C2.567 7.231 2.567 7.769 2.899 8.101L4.899 10.101C5.231 10.433 5.769 10.433 6.101 10.101L11.101 5.101Z"
      fill="currentColor"
    />
  );
}

function HexOutlineIcon({ dashed = false }: { dashed?: boolean }) {
  return (
    <path
      d={describeProjectProgressHexagonPath()}
      fill="none"
      stroke="currentColor"
      strokeWidth={PROJECT_PROGRESS_HEX_STROKE_WIDTH}
      strokeLinejoin="round"
      strokeDasharray={dashed ? PROJECT_BACKLOG_HEX_STROKE_DASHARRAY : undefined}
    />
  );
}

function HexProgressIcon({ fillRatio }: { fillRatio: number }) {
  const wedgePath = describeProjectProgressPieWedge(fillRatio);
  return (
    <>
      {wedgePath ? <path d={wedgePath} fill="currentColor" /> : null}
      <HexOutlineIcon />
    </>
  );
}

export type ProjectStatusIconProps = {
  status: ProjectStatus | string;
  title?: string;
  className?: string;
  size?: number;
  highlighted?: boolean;
};

export function ProjectStatusIcon({
  status,
  title,
  className,
  size = 14,
  highlighted = false,
}: ProjectStatusIconProps) {
  const normalizedStatus = isProjectStatus(status) ? status : "backlog";
  const colorScheme = useSyncExternalStore(
    subscribeToPreferredColorScheme,
    getPreferredColorSchemeSnapshot,
    () => "dark" as const,
  );
  const model = computeProjectStatusIconModel({
    status: normalizedStatus,
    colorScheme,
  });
  const label = title ?? getProjectStatusLabel(normalizedStatus);

  return (
    <svg
      className={mergeIconSvgClassName(className, { highlighted })}
      style={highlighted ? undefined : iconSvgColorStyle(model.color)}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-label={label}
      role="img"
    >
      <title>{label}</title>
      <g fill="none">
        {model.kind === "backlog" ? <HexOutlineIcon dashed /> : null}
        {model.kind === "completed" ? (
          <>
            {describeProjectProgressPieWedge(1) ? (
              <path d={describeProjectProgressPieWedge(1)} fill="currentColor" />
            ) : null}
            <HexOutlineIcon />
            <CompletedCheckIcon />
          </>
        ) : null}
        {model.kind === "ring" ? (
          <HexProgressIcon fillRatio={model.fillRatio} />
        ) : null}
      </g>
    </svg>
  );
}
