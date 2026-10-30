"use client";

import { useCallback, useMemo, useState } from "react";
import type { ChatUiMessage } from "@backsteros/contracts";

import { buildChatUiDemoMessages } from "../../chat/chat-ui-demo-fixture.js";
import { ChatThread } from "./chat-thread.js";

/**
 * Dev-only preview for the ChatThread foundation. Used by `/dev/chat-ui`.
 * Existing Messages UI is unchanged — this is a parallel surface.
 */
export function ChatUiDevPreview() {
  const [messages, setMessages] = useState<ChatUiMessage[]>(() =>
    buildChatUiDemoMessages(),
  );

  const onSend = useCallback(async (text: string) => {
    const now = new Date().toISOString();
    const pendingId = `local-${crypto.randomUUID()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        role: "assistant",
        author: { name: "You" },
        status: "pending",
        createdAt: now,
        parts: [{ type: "text", text }],
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 350));
    setMessages((prev) =>
      prev.map((message) =>
        message.id === pendingId
          ? { ...message, status: "done" as const }
          : message,
      ),
    );
  }, []);

  const emptyState = useMemo(
    () => <p>Demo thread is empty — send a message to try the composer.</p>,
    [],
  );

  return (
    <div className="chat-ui-dev-page">
      <header className="chat-ui-dev-page__header">
        <h1>Chat UI foundation</h1>
        <p>
          assistant-ui ChatThread preview — Messages adapter + agent parts.
          Production Messages list is unchanged.
        </p>
      </header>
      <div className="chat-ui-dev-page__thread">
        <ChatThread
          messages={messages}
          onSend={onSend}
          emptyState={emptyState}
          placeholder="Try the composer…"
        />
      </div>
    </div>
  );
}
