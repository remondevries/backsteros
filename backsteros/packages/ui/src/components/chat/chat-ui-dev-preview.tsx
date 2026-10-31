"use client";

/**
 * DEV-only alias of {@link LiveAgentChatPanel} for `/dev/chat-ui`.
 * Production shell imports {@link LiveAgentChatPanel} directly so this module
 * stays out of the production entry graph.
 */
export {
  LiveAgentChatPanel as ChatUiDevPreview,
  chatDemoThreadKey,
  type LiveAgentChatPanelProps as ChatUiDevPreviewProps,
  type LiveAgentChatHandlers,
  AGENT_SHELL_CHAT_STATUS_WINDOW_EVENT,
  AGENT_SHELL_CHAT_MESSAGE_WINDOW_EVENT,
  SHELL_CHAT_OPEN_THREAD_WINDOW_EVENT,
} from "./live-agent-chat-panel.js";
