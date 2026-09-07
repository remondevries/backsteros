/** Side-panel toggle — filled rail when open, collapsed rail when closed.
 * Matches BacksterOS desktop `ProjectsSidePanelIcon`. */
export function SidePanelToggleIcon({
  size = 16,
  collapsed = false,
  rail = "start",
  className,
}: {
  size?: number;
  collapsed?: boolean;
  rail?: "start" | "end" | "bottom";
  className?: string;
}) {
  // Slightly chunkier than the desktop twin so the open panel reads at 16px.
  // Bottom rail needs a bit more mass — a horizontal bar reads thinner than a
  // vertical one at the same thickness.
  const railThickness = rail === "bottom" ? 3 : 2.5;
  const railLength = rail === "bottom" ? 8 : 7;
  const isBottom = rail === "bottom";
  const railX = isBottom ? 4 : rail === "end" ? 9.75 : 3.75;
  const railY = isBottom ? 9.25 : 4.5;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      role="img"
      focusable="false"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      className={className}
    >
      <g>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.25 2C2.45508 2 1 3.45508 1 5.25V10.75C1 12.5449 2.45508 14 4.25 14H11.75C13.5449 14 15 12.5449 15 10.75V5.25C15 3.45508 13.5449 2 11.75 2H4.25ZM2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H11.5C12.6046 3.5 13.5 4.39543 13.5 5.5V10.5C13.5 11.6046 12.6046 12.5 11.5 12.5H4.5C3.39543 12.5 2.5 11.6046 2.5 10.5V5.5Z"
        />
        <rect
          x={railX}
          y={railY}
          width={isBottom ? railLength : railThickness}
          height={isBottom ? railThickness : railLength}
          rx="1"
          style={{
            opacity: collapsed ? 0.35 : 1,
            transitionProperty: "opacity",
            transitionDuration: "250ms",
          }}
        />
      </g>
    </svg>
  );
}
