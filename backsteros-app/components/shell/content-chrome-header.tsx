import type { ReactNode } from "react";

type ContentChromeHeaderProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function ContentChromeHeader({
  children,
  actions,
  className = "",
}: ContentChromeHeaderProps) {
  return (
    <div
      className={`content-chrome-header min-w-0 gap-2 px-4 ${className}`.trim()}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions}
    </div>
  );
}
