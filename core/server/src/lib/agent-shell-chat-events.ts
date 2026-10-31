/**
 * In-process fan-out for shell agent DM replies + status → owner SSE streams
 * on cloud-core. Distinct from Chatwoot {@link publishChatUpdated} and
 * outbound webhook payloads.
 */

export type AgentShellChatMessageChoices = {
  prompt?: string;
  multiSelect: boolean;
  options: Array<{
    label: string;
    value: string;
    style?: "default" | "primary" | "danger";
  }>;
};

export type AgentShellChatMessageChoicesAnswer = {
  values: string[];
  answeredAt: string;
};

export type AgentShellChatMessageApprovalField = {
  label: string;
  value: string;
};

export type AgentShellChatMessageApproval = {
  title: string;
  kind: "deploy" | "invoice" | "email" | "payment" | "delete" | "generic";
  summary: string;
  fields?: AgentShellChatMessageApprovalField[];
  details?: string;
  approveLabel?: string;
  rejectLabel?: string;
  destructive: boolean;
};

export type AgentShellChatMessageApprovalAnswer = {
  decision: "approved" | "rejected";
  note?: string;
  answeredAt: string;
};

export type AgentShellChatMessageFormField = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "checkbox";
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  min?: number | string;
  max?: number | string;
};

export type AgentShellChatMessageForm = {
  title: string;
  description?: string;
  submitLabel?: string;
  fields: AgentShellChatMessageFormField[];
};

export type AgentShellChatMessageFormAnswer = {
  values: Record<string, string | number | boolean>;
  answeredAt: string;
};

export type AgentShellChatMessageAttachment = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  thumbnailUrl?: string | null;
  kind: "image" | "pdf" | "file";
};

export type AgentShellChatMessageLinkPreview = {
  url: string;
  siteName?: string | null;
  faviconUrl?: string | null;
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

export type AgentShellChatMessageProgressStep = {
  label: string;
  state: "pending" | "running" | "done" | "failed";
};

export type AgentShellChatMessageProgress = {
  title: string;
  state: "running" | "succeeded" | "failed" | "canceled";
  steps?: AgentShellChatMessageProgressStep[];
  current?: number;
  total?: number;
  detail?: string;
};

export type AgentShellChatMessageEvent = {
  workspaceId: string;
  threadId: string;
  agentId: string;
  message: {
    id: string;
    /** Truncated plain preview for the sidebar card. */
    body: string;
    /** Full markdown body so the open thread can render without refetching. */
    fullBody: string;
    createdAt: string;
    /** Last body/progress update (same as createdAt on first publish). */
    updatedAt?: string;
    /** Assistant choice buttons (when the reply includes them). */
    choices?: AgentShellChatMessageChoices;
    choicesAnswer?: AgentShellChatMessageChoicesAnswer | null;
    /** Approve/reject card (when the reply includes one). */
    approval?: AgentShellChatMessageApproval;
    approvalAnswer?: AgentShellChatMessageApprovalAnswer | null;
    /** Small form card (when the reply includes one). */
    form?: AgentShellChatMessageForm;
    formAnswer?: AgentShellChatMessageFormAnswer | null;
    /** Live progress / status card (agents PATCH to update). */
    progress?: AgentShellChatMessageProgress;
    attachments?: AgentShellChatMessageAttachment[];
    linkPreviews?: AgentShellChatMessageLinkPreview[];
  };
};

export type AgentShellChatStatusEvent = {
  workspaceId: string;
  threadId: string;
  agentId: string;
  state: "working" | "idle";
  at: string;
  pendingReplyAt: string | null;
  /** Step label while working; null when idle or unset. */
  label: string | null;
};

/** SSE event name for assistant DM pushes. */
export const AGENT_SHELL_CHAT_SSE_EVENT = "agent.chat.message" as const;

/** SSE event name for agent working/idle presence on a thread. */
export const AGENT_SHELL_CHAT_STATUS_SSE_EVENT = "agent.chat.status" as const;

type MessageListener = (event: AgentShellChatMessageEvent) => void;
type StatusListener = (event: AgentShellChatStatusEvent) => void;

const messageListenersByWorkspace = new Map<string, Set<MessageListener>>();
const statusListenersByWorkspace = new Map<string, Set<StatusListener>>();

export function previewAgentChatMessageBody(body: string, max = 96): string {
  const flat = body.replace(/\s+/g, " ").trim();
  if (!flat) return "New message";
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function subscribeAgentShellChatMessage(
  workspaceId: string,
  listener: MessageListener,
): () => void {
  const id = workspaceId.trim();
  if (!id) return () => {};
  let set = messageListenersByWorkspace.get(id);
  if (!set) {
    set = new Set();
    messageListenersByWorkspace.set(id, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) messageListenersByWorkspace.delete(id);
  };
}

export function publishAgentShellChatMessage(
  event: AgentShellChatMessageEvent,
): void {
  const set = messageListenersByWorkspace.get(event.workspaceId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (error) {
      console.error("agent.chat.message listener failed:", error);
    }
  }
}

export function subscribeAgentShellChatStatus(
  workspaceId: string,
  listener: StatusListener,
): () => void {
  const id = workspaceId.trim();
  if (!id) return () => {};
  let set = statusListenersByWorkspace.get(id);
  if (!set) {
    set = new Set();
    statusListenersByWorkspace.set(id, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) statusListenersByWorkspace.delete(id);
  };
}

export function publishAgentShellChatStatus(
  event: AgentShellChatStatusEvent,
): void {
  const set = statusListenersByWorkspace.get(event.workspaceId);
  if (!set || set.size === 0) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch (error) {
      console.error("agent.chat.status listener failed:", error);
    }
  }
}

/** Test helper — clear all subscribers. */
export function clearAgentShellChatMessageListeners(): void {
  messageListenersByWorkspace.clear();
  statusListenersByWorkspace.clear();
}
