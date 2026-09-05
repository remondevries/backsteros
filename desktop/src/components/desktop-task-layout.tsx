import type { ReactNode } from "react";

export type DesktopTaskLayoutProps = {
  children: ReactNode;
};

/**
 * Task detail host. Agent Chat rail was removed from desktop (BOD-49) —
 * coding agents live in Grok / BacksterOS development (T3 Code) instead.
 */
export function DesktopTaskLayout({ children }: DesktopTaskLayoutProps) {
  return (
    <div
      className="desktop-task-layout desktop-task-layout--detail-only"
      data-content-detail
      data-agent-panel="off"
    >
      <div className="desktop-task-layout__detail">
        <div className="desktop-task-layout__detail-body">{children}</div>
      </div>
    </div>
  );
}
