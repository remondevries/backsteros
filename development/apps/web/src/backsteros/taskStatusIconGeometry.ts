import type { BacksterosTaskStatus } from "./taskStatus";

export const BACKSTEROS_TASK_STATUS_ICON_CENTER = 7;
export const BACKSTEROS_TASK_STATUS_RING_RADIUS = 6;
export const BACKSTEROS_TASK_STATUS_RING_STROKE_WIDTH = 1.5;
const PIE_RING_GAP = 1.75;
const PIE_RADIUS =
  BACKSTEROS_TASK_STATUS_RING_RADIUS -
  BACKSTEROS_TASK_STATUS_RING_STROKE_WIDTH / 2 -
  PIE_RING_GAP;

export type BacksterosColorScheme = "light" | "dark";

/** Matches BacksterOS desktop task status colors. */
export const BACKSTEROS_TASK_STATUS_COLORS: Record<
  BacksterosTaskStatus,
  { light: string; dark: string }
> = {
  triage: { light: "#c45a2e", dark: "#ee7a47" },
  backlog: { light: "oklch(0.55 0.01 258.3)", dark: "oklch(0.813 0.01 258.3)" },
  ready_to_start: { light: "oklch(0.72 0 0)", dark: "oklch(0.913 0 0)" },
  in_progress: { light: "#c9a21f", dark: "#e9c141" },
  on_hold: { light: "#c44f4b", dark: "#da615d" },
  in_review: { light: "#3f8a3d", dark: "#52a450" },
  completed: { light: "#4f57b0", dark: "#606acc" },
  canceled: { light: "oklch(0.62 0 0)", dark: "oklch(0.913 0 0)" },
  duplicated: { light: "oklch(0.55 0.08 258.3)", dark: "oklch(0.74 0.08 258.3)" },
};

export function getBacksterosTaskStatusColor(
  status: BacksterosTaskStatus,
  colorScheme: BacksterosColorScheme,
): string {
  return BACKSTEROS_TASK_STATUS_COLORS[status][colorScheme];
}

export function subscribeBacksterosColorScheme(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

export function getBacksterosColorSchemeSnapshot(): BacksterosColorScheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

export function describeBacksterosTaskStatusPieWedge(fillRatio: number): string {
  if (fillRatio <= 0) return "";
  const cx = BACKSTEROS_TASK_STATUS_ICON_CENTER;
  const cy = BACKSTEROS_TASK_STATUS_ICON_CENTER;
  const radius = PIE_RADIUS;
  if (fillRatio >= 1) {
    const top = polarToCartesian(cx, cy, radius, 0);
    return `M ${cx} ${cy} L ${top.x} ${top.y} A ${radius} ${radius} 0 1 1 ${top.x - 0.001} ${top.y} Z`;
  }
  const sweepAngle = fillRatio * 360;
  const start = polarToCartesian(cx, cy, radius, 0);
  const end = polarToCartesian(cx, cy, radius, sweepAngle);
  const largeArc = sweepAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

export function backsterosTaskStatusRingPath(): string {
  return `M13 7C13 3.686 10.314 1 7 1C3.686 1 1 3.686 1 7C1 10.314 3.686 13 7 13C10.314 13 13 10.314 13 7Z`;
}
