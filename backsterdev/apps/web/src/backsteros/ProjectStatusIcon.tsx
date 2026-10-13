import { useSyncExternalStore } from "react";

import {
  getBacksterosProjectStatusLabel,
  isBacksterosProjectStatus,
  type BacksterosProjectStatus,
} from "./projectStatus";

const ICON_CENTER = 7;
const RING_RADIUS = 6;
const RING_STROKE_WIDTH = 1.5;
const PIE_RING_GAP = 1.75;
const HEX_PIE_RADIUS = RING_RADIUS - RING_STROKE_WIDTH / 2 - PIE_RING_GAP;
const BACKLOG_DASHARRAY = "3.25 2";

type ColorScheme = "light" | "dark";

type IconModel =
  | { readonly kind: "backlog"; readonly color: string }
  | { readonly kind: "completed"; readonly color: string }
  | { readonly kind: "ring"; readonly color: string; readonly fillRatio: number };

const RING_FILL_BY_STATUS: Partial<Record<BacksterosProjectStatus, number>> = {
  active: 0.48,
  on_hold: 0.34,
  canceled: 0,
};

/** Matches BacksterOS desktop task/project status colors. */
const STATUS_COLORS: Record<BacksterosProjectStatus, { light: string; dark: string }> = {
  backlog: {
    light: "oklch(0.55 0.01 258.3)",
    dark: "oklch(0.813 0.01 258.3)",
  },
  active: {
    light: "#c9a21f",
    dark: "#e9c141",
  },
  on_hold: {
    light: "#c44f4b",
    dark: "#da615d",
  },
  completed: {
    light: "#4f57b0",
    dark: "#606acc",
  },
  canceled: {
    light: "oklch(0.62 0 0)",
    dark: "oklch(0.913 0 0)",
  },
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

function subscribeColorScheme(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getColorSchemeSnapshot(): ColorScheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function computeIconModel(status: BacksterosProjectStatus, colorScheme: ColorScheme): IconModel {
  const color = STATUS_COLORS[status][colorScheme];
  if (status === "backlog") return { kind: "backlog", color };
  if (status === "completed") return { kind: "completed", color };
  return {
    kind: "ring",
    color,
    fillRatio: RING_FILL_BY_STATUS[status] ?? 0,
  };
}

function HexOutline({ dashed = false }: { dashed?: boolean }) {
  return (
    <path
      d={describeHexagonPath()}
      fill="none"
      stroke="currentColor"
      strokeWidth={RING_STROKE_WIDTH}
      strokeLinejoin="round"
      strokeDasharray={dashed ? BACKLOG_DASHARRAY : undefined}
    />
  );
}

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

export function BacksterosProjectStatusIcon(props: {
  readonly status: string;
  readonly size?: number;
  readonly className?: string | undefined;
  readonly title?: string;
}) {
  const status = isBacksterosProjectStatus(props.status) ? props.status : "backlog";
  const colorScheme = useSyncExternalStore(
    subscribeColorScheme,
    getColorSchemeSnapshot,
    () => "dark" as const,
  );
  const model = computeIconModel(status, colorScheme);
  const label = props.title ?? getBacksterosProjectStatusLabel(status);
  const size = props.size ?? 14;
  const fullWedge = describePieWedge(1);

  return (
    <svg
      className={props.className}
      style={{ color: model.color }}
      viewBox="0 0 14 14"
      width={size}
      height={size}
      aria-label={label}
      role="img"
    >
      <title>{label}</title>
      <g fill="none">
        {model.kind === "backlog" ? <HexOutline dashed /> : null}
        {model.kind === "completed" ? (
          <>
            {fullWedge ? <path d={fullWedge} fill="currentColor" /> : null}
            <HexOutline />
            <g style={{ color: colorScheme === "dark" ? "#0a0a0a" : "#ffffff" }}>
              <CompletedCheckIcon />
            </g>
          </>
        ) : null}
        {model.kind === "ring" ? (
          <>
            {describePieWedge(model.fillRatio) ? (
              <path d={describePieWedge(model.fillRatio)} fill="currentColor" />
            ) : null}
            <HexOutline />
          </>
        ) : null}
      </g>
    </svg>
  );
}
