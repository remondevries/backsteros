"use client";

import { PROJECT_AREA_LABELS, type ProjectArea } from "../project-areas.js";

type ProjectAreaBadgeProps = {
  area: ProjectArea | null;
};

/**
 * Compact area glyph for property triggers — matches Next.js ProjectAreaBadge.
 */
export function ProjectAreaBadge({ area }: ProjectAreaBadgeProps) {
  const label = area ? PROJECT_AREA_LABELS[area].charAt(0) : "—";

  return (
    <span
      className={
        area
          ? "project-area-badge project-area-badge--set"
          : "project-area-badge project-area-badge--empty"
      }
      aria-hidden="true"
    >
      {label}
    </span>
  );
}
