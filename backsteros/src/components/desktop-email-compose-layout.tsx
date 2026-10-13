import type { ReactNode } from "react";

export type EmailComposeLayoutSlot = {
  /** Always null — desktop Agent Chat / email ACP prompt removed (BOD-49). */
  agentPrompt: null;
  agentWorking: false;
};

export type DesktopEmailComposeLayoutProps = {
  children: (slot: EmailComposeLayoutSlot) => ReactNode;
};

/**
 * Email draft chrome. Agent prompt / ACP compose path removed from desktop.
 */
export function DesktopEmailComposeLayout({
  children,
}: DesktopEmailComposeLayoutProps) {
  return (
    <div className="desktop-email-compose" data-content-detail>
      {children({ agentPrompt: null, agentWorking: false })}
    </div>
  );
}
