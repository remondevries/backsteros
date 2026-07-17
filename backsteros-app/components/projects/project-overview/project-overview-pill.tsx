import type { ReactNode } from "react";

type ProjectOverviewPillProps = {
  children: ReactNode;
  className?: string;
};

export function ProjectOverviewPill({
  children,
  className = "",
}: ProjectOverviewPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-sm leading-[18px] text-foreground ${className}`}
    >
      {children}
    </span>
  );
}
