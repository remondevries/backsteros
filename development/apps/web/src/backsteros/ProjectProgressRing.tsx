const ICON_CENTER = 7;
const RING_RADIUS = 6;
const RING_STROKE_WIDTH = 1.5;
const PIE_RING_GAP = 1.75;
const HEX_PIE_RADIUS = RING_RADIUS - RING_STROKE_WIDTH / 2 - PIE_RING_GAP;

/** Desktop completed-status purple used by the project progress hex. */
const COMPLETED_COLOR = "#606acc";

export type BacksterosProjectTaskProgress = {
  readonly total: number;
  readonly completed: number;
};

function polarToCartesian(cx: number, cy: number, radius: number, angleDeg: number) {
  const radians = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeHexagonPath(radius: number = RING_RADIUS): string {
  const points = Array.from({ length: 6 }, (_, index) => {
    const point = polarToCartesian(ICON_CENTER, ICON_CENTER, radius, index * 60);
    return `${point.x} ${point.y}`;
  });
  return `M ${points.join(" L ")} Z`;
}

function describePieWedge(fillRatio: number): string {
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

export function computeBacksterosProjectTaskProgressRatio(
  completed: number,
  total: number,
): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, completed / total));
}

export function formatBacksterosProjectTaskProgressPercent(
  progress: BacksterosProjectTaskProgress,
): string {
  if (progress.total <= 0) return "0%";
  const ratio = computeBacksterosProjectTaskProgressRatio(progress.completed, progress.total);
  return `${Math.round(ratio * 100)}%`;
}

function formatProgressLabel(progress: BacksterosProjectTaskProgress): string {
  if (progress.total <= 0) return "No tasks";
  return `${progress.completed} of ${progress.total} completed`;
}

/**
 * Hex progress mark matching BacksterOS desktop `ProjectProgressRing`
 * (completed purple fill wedge + hex outline).
 */
export function BacksterosProjectProgressRing(props: {
  readonly progress: BacksterosProjectTaskProgress;
  readonly size?: number;
  readonly title?: string;
  readonly className?: string | undefined;
}) {
  const size = props.size ?? 16;
  const fillRatio = computeBacksterosProjectTaskProgressRatio(
    props.progress.completed,
    props.progress.total,
  );
  const wedgePath = describePieWedge(fillRatio);
  const hexOutlinePath = describeHexagonPath();
  const label = props.title ?? formatProgressLabel(props.progress);
  const hasTasks = props.progress.total > 0;

  return (
    <svg
      className={props.className}
      style={{ color: COMPLETED_COLOR, opacity: hasTasks ? 1 : 0.45 }}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-label={label}
      role="img"
    >
      <title>{label}</title>
      <g fill="none">
        {hasTasks && wedgePath ? <path d={wedgePath} fill="currentColor" /> : null}
        <path
          d={hexOutlinePath}
          fill="none"
          stroke="currentColor"
          strokeWidth={RING_STROKE_WIDTH}
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
