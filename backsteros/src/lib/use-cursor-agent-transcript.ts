import { useEffect, useState } from "react";
import type { ChatUiMessage } from "@backsteros/contracts";

import {
  cursorTranscriptToChatUiMessages,
  fetchCursorAgentTranscript,
} from "./cursor-agent-transcript";

const POLL_MS = 2_000;

/**
 * Poll the latest Cursor IDE agent transcript for this machine and map it to
 * ChatUiMessage[] for static terminal sync.
 */
export function useCursorAgentTranscript(options: {
  active: boolean;
  cwd?: string | null;
  conversationId?: string | null;
}): {
  messages: ChatUiMessage[];
  conversationId: string | null;
  error: string | null;
} {
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!options.active) return;

    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      const result = await fetchCursorAgentTranscript({
        cwd: options.cwd,
        conversationId: options.conversationId,
      });
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setConversationId(result.conversationId);
      setMessages(
        cursorTranscriptToChatUiMessages(
          result.messages,
          result.conversationId,
        ),
      );
    };

    void tick();
    timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [options.active, options.cwd, options.conversationId]);

  return { messages, conversationId, error };
}
