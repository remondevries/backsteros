import type { AskQuestionItem } from "../../lib/agent/agent-chat-ask";
import type {
  AgentChatImageAttachment,
  AgentChatMessage,
} from "../../lib/agent/agent-chat-transcript";
import { AGENT_CHAT_COMPOSER_FOCUS_ATTR } from "../desktop-agent-chat-composer";

export type AgentChatUiRequest = {
  kind: "permission" | "ask_question";
  requestId: string;
  title: string;
  detail: string | null;
  options: { id: string; label: string }[];
  questions?: AskQuestionItem[];
};

/** Unsent mid-turn steer — Retry/Discard, never auto-flushed after settle. */
export type FailedSteerDraft = {
  id: string;
  text: string;
  images: AgentChatImageAttachment[];
  error: string;
};

/** T3 ComposerPendingApprovalPanel summary labels. */
export function permissionApprovalCopy(
  title: string,
  detail: string | null,
): { summary: string; detailLabel: string } {
  const hay = `${title} ${detail ?? ""}`.toLowerCase();
  if (
    /\bmcp\b|moneybird_|1password|dynamic.?tool|external.?tool|plugin-|project-0-/i.test(
      hay,
    )
  ) {
    return {
      summary: "MCP tool approval requested",
      detailLabel: "MCP tool",
    };
  }
  if (/\b(exec|shell|command|bash|terminal|run)\b/.test(hay)) {
    return {
      summary: "Command approval requested",
      detailLabel: "Command",
    };
  }
  if (/\b(read|search|grep|glob|list_dir|list.?files)\b/.test(hay)) {
    return {
      summary: "File-read approval requested",
      detailLabel: "File to read",
    };
  }
  return {
    summary: "File-change approval requested",
    detailLabel: "File change",
  };
}

export function permissionOptionLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized === "allow once" || normalized === "approve once") {
    return "Approve once";
  }
  if (
    normalized === "always allow" ||
    normalized === "always allow this session" ||
    normalized === "allow for session"
  ) {
    return "Always allow this session";
  }
  if (normalized === "reject" || normalized === "decline" || normalized === "deny") {
    return "Decline";
  }
  if (normalized === "cancel" || normalized === "cancel turn") {
    return "Cancel turn";
  }
  return label;
}

export function isEditableFocusTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (
    target.closest(
      ".cm-editor, .cm-content, [data-document-editor-root='codemirror']",
    )
  ) {
    return true;
  }
  return false;
}

export function isAgentChatComposer(el: EventTarget | null): boolean {
  return (
    el instanceof HTMLElement &&
    el.getAttribute(AGENT_CHAT_COMPOSER_FOCUS_ATTR) === "composer"
  );
}

export function isInsideAgentChatComposer(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (isAgentChatComposer(el)) return true;
  return Boolean(el.closest(".desktop-agent-chat__composer"));
}

/** CreatedAt of the user message immediately before an assistant row. */
export function findPairedUserCreatedAt(
  messages: readonly AgentChatMessage[],
  assistantId: string,
): number | null {
  for (let i = 0; i < messages.length; i += 1) {
    if (messages[i]?.id !== assistantId) continue;
    const prev = messages[i - 1];
    if (prev?.role === "user" && Number.isFinite(prev.createdAt)) {
      return prev.createdAt;
    }
    return null;
  }
  return null;
}
