import type { CSSProperties } from "react";

import {
  migrateBacksterosTaskStatus,
  type BacksterosTaskStatus,
} from "./taskStatus";

type StatusHeaderGradient = {
  readonly from: string;
  readonly to: string;
};

/** Mirrors BacksterOS desktop `STATUS_HEADER_GRADIENTS`. */
const STATUS_HEADER_GRADIENTS: Record<BacksterosTaskStatus, StatusHeaderGradient> = {
  triage: { from: "#ee7a4710", to: "#ffffff05" },
  backlog: { from: "#bfc2c705", to: "#ffffff05" },
  ready_to_start: { from: "#ffffff05", to: "#ffffff05" },
  in_progress: { from: "#e3c25910", to: "#ffffff05" },
  on_hold: { from: "#cb686110", to: "#ffffff05" },
  in_review: { from: "#67a25a10", to: "#ffffff05" },
  completed: { from: "#626ac610", to: "#ffffff05" },
  canceled: { from: "#bfc2c705", to: "#ffffff05" },
  duplicated: { from: "#bfc2c705", to: "#ffffff05" },
};

export function getBacksterosTaskStatusHeaderGradientStyle(
  status: string,
): CSSProperties {
  const gradient = STATUS_HEADER_GRADIENTS[migrateBacksterosTaskStatus(status)];
  return {
    ["--bos-status-group-gradient" as string]: `linear-gradient(90deg, ${gradient.from}, ${gradient.to})`,
  };
}
