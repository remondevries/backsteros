import type { ReactNode } from "react";

type ProjectOverviewMetaRowProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function ProjectOverviewMetaRow({
  label,
  children,
  className = "",
}: ProjectOverviewMetaRowProps) {
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 max-md:flex-col max-md:items-start ${className}`}
    >
      <span className="w-[72px] shrink-0 text-sm leading-[18px] text-foreground/50 max-md:w-auto">
        {label}
      </span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 max-md:w-full max-md:flex-col max-md:items-start">
        {children}
      </div>
    </div>
  );
}
