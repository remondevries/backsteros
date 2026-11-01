import { useEffect, useState } from "react";
import type { ChatUiMessage } from "@backsteros/contracts";

import { fetchAcpChatTranscript } from "./task-agent-acp-transcript";
import { useCursorAgentTranscript } from "./use-cursor-agent-transcript";

const POLL_MS = 2_000;

/**
 * Build Live/Log source: prefer ACP chat transcript for `builderSessionId`,
 * fall back to Cursor IDE agent-transcripts jsonl.
 */
export function useTaskAgentBuildTranscript(options: {
  active: boolean;
  cwd?: string | null;
  builderSessionId?: string | null;
}): {
  messages: ChatUiMessage[];
  error: string | null;
  source: "acp" | "cursor-ide" | null;
} {
  const builderSessionId = options.builderSessionId?.trim() || null;
  const cursorFallback = useCursorAgentTranscript({
    active: options.active && !builderSessionId,
    cwd: options.cwd,
  });
  const [acpMessages, setAcpMessages] = useState<ChatUiMessage[]>([]);
  const [acpError, setAcpError] = useState<string | null>(null);

  useEffect(() => {
    if (!options.active || !builderSessionId) {
      setAcpMessages([]);
      setAcpError(null);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      const result = await fetchAcpChatTranscript(builderSessionId);
      if (cancelled) return;
      if (!result.ok) {
        setAcpError(result.error);
        return;
      }
      setAcpError(null);
      setAcpMessages(result.messages);
    };

    void tick();
    timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    return () => {
      cancelled = true;
      if (timer != null) window.clearInterval(timer);
    };
  }, [options.active, builderSessionId]);

  if (builderSessionId) {
    return {
      messages: acpMessages,
      error: acpError,
      source: "acp",
    };
  }

  return {
    messages: cursorFallback.messages,
    error: cursorFallback.error,
    source: cursorFallback.messages.length > 0 || cursorFallback.error
      ? "cursor-ide"
      : null,
  };
}
