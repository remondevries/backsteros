import { ClipboardList, FileDiff, MessageCircle } from "lucide-react";
import {
  BrowserWindowIcon,
  KnowledgeBaseNavIcon,
  TerminalConsoleIcon,
} from "@backsteros/ui";

import type { AgentSurfaceTabKind } from "../lib/agent/agent-surface-tabs";

export type AgentSurfaceTabKindIconProps = {
  kind: AgentSurfaceTabKind;
  className?: string;
  size?: number;
};

/** Shared surface-kind icon used by horizontal tabs and the collapsed strip. */
export function AgentSurfaceTabKindIcon({
  kind,
  className = "desktop-agent-surface-tab-icon",
  size = 14,
}: AgentSurfaceTabKindIconProps) {
  switch (kind) {
    case "terminal":
      return <TerminalConsoleIcon className={className} size={size} aria-hidden />;
    case "browser":
      return <BrowserWindowIcon className={className} size={size} aria-hidden />;
    case "files":
      return <KnowledgeBaseNavIcon className={className} size={size} />;
    case "plan":
      return (
        <ClipboardList
          className={className}
          size={size}
          aria-hidden
          strokeWidth={1.8}
        />
      );
    case "diff":
      return (
        <FileDiff
          className={className}
          size={size}
          aria-hidden
          strokeWidth={1.8}
        />
      );
    case "chat":
    default:
      return (
        <MessageCircle
          className={className}
          size={size}
          aria-hidden
          strokeWidth={1.8}
        />
      );
  }
}
