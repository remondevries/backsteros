import { useEffect, useRef } from "react";
import type { AgentPtyConnection } from "@backsteros/contracts";

import { buildPtyWebSocketUrl } from "./agent-pty";

export type AgentAcpUiRequest = {
  kind: "permission" | "ask_question";
  requestId: string;
  title: string;
  detail: string | null;
  options: { id: string; label: string }[];
  questions?: {
    id: string;
    prompt: string;
    options: { id: string; label: string }[];
    multiSelect?: boolean;
  }[];
};

type Options = {
  connection: AgentPtyConnection | null;
  taskId: string | null;
  chatId?: string | null;
  cwd?: string | null;
  enabled?: boolean;
  onUiRequest: (request: AgentAcpUiRequest) => void;
  onUiRequestCleared: (requestId: string | null) => void;
};

/**
 * Subscribe to ACP permission / ask_question events for the focused task.
 * Closing the socket does not stop the ACP session.
 */
export function useAgentAcpUiRequests(options: Options): void {
  const {
    connection,
    taskId,
    chatId = null,
    cwd = null,
    enabled = true,
    onUiRequest,
    onUiRequestCleared,
  } = options;

  const callbacksRef = useRef({ onUiRequest, onUiRequestCleared });
  callbacksRef.current = { onUiRequest, onUiRequestCleared };

  useEffect(() => {
    const id = taskId?.trim() || "";
    if (!enabled || !connection || !id) return;

    const url = buildPtyWebSocketUrl(connection, {
      cols: 80,
      rows: 24,
      cwd: cwd?.trim() || null,
      kind: "agent",
      taskId: id,
      chatId: chatId?.trim().toLowerCase() || null,
    });

    const socket = new WebSocket(url);

    socket.onmessage = (event) => {
      let message: {
        type?: string;
        event?: string;
        requestId?: string | null;
        auto?: boolean;
        title?: string | null;
        detail?: string | null;
        options?: unknown;
        questions?: unknown;
      };
      try {
        message = JSON.parse(String(event.data)) as typeof message;
      } catch {
        return;
      }
      if (message.type !== "acp-event") return;

      if (
        (message.event === "permission" || message.event === "ask-question") &&
        typeof message.requestId === "string" &&
        message.requestId.trim() &&
        message.auto !== true
      ) {
        const optionsList = Array.isArray(message.options)
          ? message.options
              .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const item = entry as Record<string, unknown>;
                const optId =
                  typeof item.id === "string" ? item.id.trim() : "";
                const label =
                  typeof item.label === "string" ? item.label.trim() : "";
                if (!optId || !label) return null;
                return { id: optId, label };
              })
              .filter(
                (entry): entry is { id: string; label: string } => entry != null,
              )
          : [];
        const questions = Array.isArray(message.questions)
          ? message.questions
              .map((entry) => {
                if (!entry || typeof entry !== "object") return null;
                const item = entry as Record<string, unknown>;
                const qId = typeof item.id === "string" ? item.id.trim() : "";
                const prompt =
                  typeof item.prompt === "string" ? item.prompt.trim() : "";
                if (!qId || !prompt) return null;
                const qOptions = Array.isArray(item.options)
                  ? item.options
                      .map((opt) => {
                        if (!opt || typeof opt !== "object") return null;
                        const o = opt as Record<string, unknown>;
                        const oid =
                          typeof o.id === "string" ? o.id.trim() : "";
                        const label =
                          typeof o.label === "string" ? o.label.trim() : "";
                        if (!oid || !label) return null;
                        return { id: oid, label };
                      })
                      .filter(
                        (opt): opt is { id: string; label: string } =>
                          opt != null,
                      )
                  : [];
                return {
                  id: qId,
                  prompt,
                  options: qOptions,
                  ...(item.multiSelect === true ? { multiSelect: true } : {}),
                };
              })
              .filter(
                (
                  entry,
                ): entry is {
                  id: string;
                  prompt: string;
                  options: { id: string; label: string }[];
                  multiSelect?: boolean;
                } => entry != null,
              )
          : undefined;
        callbacksRef.current.onUiRequest({
          kind:
            message.event === "ask-question" ? "ask_question" : "permission",
          requestId: message.requestId.trim(),
          title:
            typeof message.title === "string" && message.title.trim()
              ? message.title.trim()
              : message.event === "ask-question"
                ? "Question"
                : "Permission required",
          detail:
            typeof message.detail === "string" && message.detail.trim()
              ? message.detail.trim()
              : null,
          options: optionsList,
          questions,
        });
        return;
      }

      if (
        message.event === "permission-timeout" ||
        message.event === "ask-question-timeout" ||
        message.event === "ui-request-cleared"
      ) {
        callbacksRef.current.onUiRequestCleared(
          typeof message.requestId === "string" ? message.requestId : null,
        );
      }
    };

    return () => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    };
  }, [chatId, connection, cwd, enabled, taskId]);
}
