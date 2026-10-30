/**
 * Sample thread for the `/dev/chat-ui` preview — mixes Messages-shaped
 * bubbles with agent parts (tool call, task card, markdown, diff).
 */
import type { ChatMessage, ChatUiMessage } from "@backsteros/contracts";

import { chatMessagesToChatUiMessages } from "./messages-chat-ui-adapter.js";

const SAMPLE_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: "cw-1",
    conversationId: "demo",
    externalId: "cw-1",
    direction: "incoming",
    content: "Hey — can you check the chat UI foundation task?",
    contentType: "text",
    senderName: "Ada",
    private: false,
    createdAt: "2026-10-30T08:01:00.000Z",
  },
  {
    id: "cw-2",
    conversationId: "demo",
    externalId: "cw-2",
    direction: "activity",
    content: "Conversation opened from WhatsApp",
    contentType: "text",
    senderName: null,
    private: false,
    createdAt: "2026-10-30T08:01:05.000Z",
  },
  {
    id: "cw-3",
    conversationId: "demo",
    externalId: "cw-3",
    direction: "outgoing",
    content: "On it — pulling the task card in.",
    contentType: "text",
    senderName: "Remon",
    private: false,
    createdAt: "2026-10-30T08:01:20.000Z",
  },
];

const AGENT_DEMO_MESSAGES: ChatUiMessage[] = [
  {
    id: "agent-1",
    role: "assistant",
    author: { name: "Cursor agent" },
    status: "done",
    createdAt: "2026-10-30T08:02:00.000Z",
    parts: [
      {
        type: "text",
        markdown: true,
        text: "Found the task. Here's a short plan:\n\n1. Shared `ChatUiMessage` format\n2. `ChatThread` on assistant-ui\n3. Messages adapter",
      },
      {
        type: "tool-call",
        id: "tc-1",
        name: "search_tasks",
        input: { query: "chat ui foundation" },
        output: { matches: 1 },
        status: "done",
      },
      {
        type: "card",
        cardType: "task",
        id: "card-task-1",
        data: {
          taskId: "00000000-0000-4000-8000-000000000001",
          displayId: "BSH-demo",
          title: "Unified chat UI foundation",
          href: "/tasks",
          status: "in_progress",
        },
      },
      {
        type: "diff",
        filename: "chat-ui.ts",
        content:
          "@@ -0,0 +1,3 @@\n+export type ChatUiMessage = {\n+  id: string;\n+};",
      },
    ],
  },
  {
    id: "agent-2",
    role: "assistant",
    author: { name: "Cursor agent" },
    status: "streaming",
    createdAt: "2026-10-30T08:02:30.000Z",
    parts: [
      {
        type: "text",
        text: "Streaming a follow-up…",
      },
    ],
  },
];

/** Demo messages used by the Chat UI foundation preview page. */
export function buildChatUiDemoMessages(): ChatUiMessage[] {
  return [
    ...chatMessagesToChatUiMessages(SAMPLE_CHAT_MESSAGES),
    ...AGENT_DEMO_MESSAGES,
  ];
}
