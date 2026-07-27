import {
  TASK_STATUS_RING_RADIUS,
  TASK_STATUS_RING_STROKE_WIDTH,
} from "@/lib/task-status-icon";

const ICON_CENTER = 7;
const PIE_RING_GAP = 1.75;
const HEX_PIE_RADIUS =
  TASK_STATUS_RING_RADIUS - TASK_STATUS_RING_STROKE_WIDTH / 2 - PIE_RING_GAP;

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

export function describeProjectProgressHexagonPath(
  radius: number = TASK_STATUS_RING_RADIUS,
): string {
  const points = Array.from({ length: 6 }, (_, index) => {
    const point = polarToCartesian(ICON_CENTER, ICON_CENTER, radius, index * 60);
    return `${point.x} ${point.y}`;
  });
  return `M ${points.join(" L ")} Z`;
}

export function describeProjectProgressPieWedge(fillRatio: number): string {
  if (fillRatio <= 0) return "";

  const cx = ICON_CENTER;
  const cy = ICON_CENTER;
  const radius = HEX_PIE_RADIUS;

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

export const PROJECT_PROGRESS_HEX_STROKE_WIDTH = TASK_STATUS_RING_STROKE_WIDTH;
/** Dash and gap lengths for the backlog hex outline (SVG strokeDasharray). */
export const PROJECT_BACKLOG_HEX_STROKE_DASHARRAY = "3.25 2";
