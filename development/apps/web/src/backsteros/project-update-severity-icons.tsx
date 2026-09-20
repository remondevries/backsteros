import {
  PROJECT_UPDATE_SEVERITY_COLORS,
  type BacksterosProjectUpdateSeverity,
} from "./projectUpdates";

type ProjectUpdateSeverityDotProps = {
  severity: BacksterosProjectUpdateSeverity;
  className?: string;
  size?: number;
};

export { PROJECT_UPDATE_SEVERITY_COLORS };

/** Colored priority dot for incident severity. */
export function ProjectUpdateSeverityDot({
  severity,
  className,
  size = 14,
}: ProjectUpdateSeverityDotProps) {
  const color = PROJECT_UPDATE_SEVERITY_COLORS[severity];
  const needsStroke = severity === "low_risk";
  const radius = 4;
  const center = 8;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill={color}
        stroke={needsStroke ? "rgba(0,0,0,0.18)" : undefined}
        strokeWidth={needsStroke ? 1 : undefined}
      />
    </svg>
  );
}
