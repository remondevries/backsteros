import type { ReactNode } from "react";
import {
  Bot,
  Check,
  CircleAlert,
  Eye,
  FilePenLine,
  FolderSearch,
  Globe,
  Hammer,
  MessageCircle,
  Search,
  SquareTerminal,
  Wrench,
  X,
  Zap,
} from "lucide-react";

import type { AgentChatActivityItem } from "./agent-acp-activity";

const ICON_CLASS = "desktop-agent-chat__activity-lucide";

/** Map ACP activity / tool kinds to Lucide icons (T3 work-entry style). */
export function activityLucideIcon(item: AgentChatActivityItem): ReactNode {
  if (item.status === "failed") {
    return <X className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (item.kind === "thought" || item.kind === "info") {
    return <Bot className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (item.kind === "plan") {
    return <Hammer className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }

  const kind = item.toolKind?.toLowerCase() ?? "";
  if (kind === "read") {
    return <Eye className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (kind === "edit" || kind === "write" || kind === "delete" || kind === "move") {
    return <FilePenLine className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (kind === "execute" || kind === "shell" || kind === "terminal") {
    return <SquareTerminal className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (kind === "search" || kind === "grep") {
    return <Search className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (kind === "glob" || kind === "list") {
    return <FolderSearch className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (kind === "fetch" || kind === "web") {
    return <Globe className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (kind.includes("mcp") || kind.includes("tool")) {
    return <Wrench className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (item.status === "completed") {
    return <Check className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  if (item.status === "pending" || item.status === "in_progress") {
    return <Zap className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
  }
  return <MessageCircle className={ICON_CLASS} aria-hidden strokeWidth={1.8} />;
}

export function activityStatusLucide(
  kind: "success" | "failed" | "pending",
): ReactNode {
  if (kind === "success") {
    return <Check className={`${ICON_CLASS} is-success`} aria-hidden strokeWidth={2} />;
  }
  if (kind === "failed") {
    return (
      <CircleAlert className={`${ICON_CLASS} is-failed`} aria-hidden strokeWidth={2} />
    );
  }
  return <Zap className={`${ICON_CLASS} is-pending`} aria-hidden strokeWidth={1.8} />;
}
