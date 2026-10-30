import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ChatUiMessage } from "@backsteros/contracts";
import {
  buildChatUiDemoMessages,
  ChatThread,
} from "@backsteros/ui";

import { navigateToHref } from "../router/navigate-href";

/**
 * Persistent shell-level ChatThread host. Mounted once outside routed content
 * so scroll, draft, and running state survive navigation. Demo fixture for now.
 */
export function ShellChatPanel() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatUiMessage[]>(() =>
    buildChatUiDemoMessages(),
  );

  const onNavigate = useCallback(
    (href: string) => {
      navigateToHref(navigate, href);
    },
    [navigate],
  );

  const onSend = useCallback(async (text: string) => {
    const now = new Date().toISOString();
    const pendingId = `local-${crypto.randomUUID()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: pendingId,
        role: "user",
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
    <ChatThread
      messages={messages}
      onSend={onSend}
      onNavigate={onNavigate}
      emptyState={emptyState}
      placeholder="Message…"
    />
  );
}
