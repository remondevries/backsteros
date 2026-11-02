import { useEffect, useState } from "react";
import type { ChatUiMessage } from "@backsteros/contracts";

import { fetchAcpChatTranscript } from "./task-agent-acp-transcript";
import { useCursorAgentTranscript } from "./use-cursor-agent-transcript";

const POLL_MS = 2_000;

/**
 * Build Live/Log source: prefer ACP chat transcript for `builderSessionId`,
 * fall back to Cursor IDE agent-transcripts jsonl when ACP is empty or offline.
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
  const [acpMessages, setAcpMessages] = useState<ChatUiMessage[]>([]);
  const [acpError, setAcpError] = useState<string | null>(null);
  const [acpReady, setAcpReady] = useState(false);

  const preferCursorFallback =
    !builderSessionId || (acpReady && acpMessages.length === 0);

  const cursorFallback = useCursorAgentTranscript({
    active: options.active && preferCursorFallback,
    cwd: options.cwd,
  });

  useEffect(() => {
    if (!options.active || !builderSessionId) {
      setAcpMessages([]);
      setAcpError(null);
      setAcpReady(false);
      return;
    }
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      const result = await fetchAcpChatTranscript(builderSessionId);
      if (cancelled) return;
      setAcpReady(true);
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

  if (builderSessionId && acpMessages.length > 0) {
    return {
      messages: acpMessages,
      error: null,
      source: "acp",
    };
  }

  if (cursorFallback.messages.length > 0) {
    return {
      messages: cursorFallback.messages,
      error: null,
      source: "cursor-ide",
    };
  }

  if (builderSessionId) {
    return {
      messages: [],
      error: acpError || cursorFallback.error,
      source: acpError ? "acp" : cursorFallback.error ? "cursor-ide" : "acp",
    };
  }

  return {
    messages: cursorFallback.messages,
    error: cursorFallback.error,
    source:
      cursorFallback.messages.length > 0 || cursorFallback.error
        ? "cursor-ide"
        : null,
  };
}
