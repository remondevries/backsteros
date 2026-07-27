export function SettingsIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8.7 1.5h-1.4l-.25 1.55a4.6 4.6 0 0 0-1.2.5L4.6 2.8l-.99.99 1.25 1.25c-.22.37-.39.77-.5 1.2L2.8 6.5v1.4l1.55.25c.11.43.28.83.5 1.2L3.6 10.6l.99.99 1.25-1.25c.37.22.77.39 1.2.5l.25 1.55h1.4l.25-1.55c.43-.11.83-.28 1.2-.5l1.25 1.25.99-.99-1.25-1.25c.22-.37.39-.77.5-1.2l1.55-.25v-1.4l-1.55-.25a4.6 4.6 0 0 0-.5-1.2L13.2 3.8l-.99-.99-1.25 1.25a4.6 4.6 0 0 0-1.2-.5L8.7 1.5Z"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.15" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M10 3.5 5.5 8 10 12.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PanelLeftCollapseIcon({ size = 14 }: { size?: number }) {
  return <ProjectsSidePanelIcon size={size} collapsed={false} />;
}

export function PanelLeftExpandIcon({ size = 14 }: { size?: number }) {
  return <ProjectsSidePanelIcon size={size} collapsed />;
}

/** Side-panel toggle — filled rail when open, collapsed rail when closed. */
export function ProjectsSidePanelIcon({
  size = 16,
  collapsed = false,
  /** Which side of the panel glyph the rail sits on. */
  rail = "start",
}: {
  size?: number;
  collapsed?: boolean;
  rail?: "start" | "end";
}) {
  // Inner content is x=3.5…12.5; rail hugs the start or end edge.
  const railX = rail === "end" ? 10.5 : 4;
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
    >
      <g>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M4.25 2C2.45508 2 1 3.45508 1 5.25V10.75C1 12.5449 2.45508 14 4.25 14H11.75C13.5449 14 15 12.5449 15 10.75V5.25C15 3.45508 13.5449 2 11.75 2H4.25ZM2.5 5.5C2.5 4.39543 3.39543 3.5 4.5 3.5H11.5C12.6046 3.5 13.5 4.39543 13.5 5.5V10.5C13.5 11.6046 12.6046 12.5 11.5 12.5H4.5C3.39543 12.5 2.5 11.6046 2.5 10.5V5.5Z"
        />
        <rect
          x={railX}
          y="5"
          width={collapsed ? 0 : 1.5}
          height="6"
          rx="0.75"
          style={{
            transitionProperty: "width",
            transitionDuration: "250ms",
          }}
        />
      </g>
    </svg>
  );
}

/** Play-in-circle — run / launch application. */
export function RunApplicationIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215Z" />
    </svg>
  );
}

/** Stop-in-circle — shut down a running application. */
export function StopApplicationIcon({
  size = 14,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 16A8 8 0 1 1 8 0a8 8 0 0 1 0 16Zm0-1.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13Z" />
      <path d="M5 5.75A.75.75 0 0 1 5.75 5h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75Z" />
    </svg>
  );
}

export function PanelRightCollapseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M10.5 2.5v11" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M7.25 5.75 4.75 8l2.5 2.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PanelRightExpandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <rect
        x="1.5"
        y="2.5"
        width="13"
        height="11"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.25"
      />
      <path d="M10.5 2.5v11" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M4.75 5.75 7.25 8l-2.5 2.25"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export { TerminalConsoleIcon as TerminalHeaderIcon } from "@backsteros/ui";

/** Robot / hubot mark used for agent activity rows and task-list badges. */
export { AgentActivityIcon } from "@backsteros/ui";
/** Cursor brand cube mark (mono). */
export function CursorAgentIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 49 56"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M48.0226 13.2547L25.6601 0.311786C24.942 -0.103929 24.0559 -0.103929 23.3378 0.311786L0.976347 13.2547C0.372691 13.6041 0 14.2503 0 14.9502V41.0498C0 41.7496 0.372691 42.3958 0.976347 42.7453L23.3389 55.6882C24.057 56.1039 24.943 56.1039 25.6611 55.6882L48.0237 42.7453C48.6273 42.3958 49 41.7496 49 41.0498V14.9502C49 14.2503 48.6273 13.6041 48.0237 13.2547H48.0226ZM46.6179 15.9964L25.0302 53.4802C24.8842 53.7328 24.4989 53.6296 24.4989 53.337V28.793C24.4989 28.3026 24.2375 27.849 23.8134 27.6027L2.61094 15.3312C2.35898 15.1849 2.46186 14.7987 2.75372 14.7987H45.9292C46.5423 14.7987 46.9255 15.4649 46.619 15.9974L46.6179 15.9964Z" />
    </svg>
  );
}
