import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentMailMessageDetail } from "@backsteros/contracts";

import { DesktopEmailAgentPrompt } from "./desktop-email-agent-prompt";
import { useDesktopAgentStatus } from "../lib/agent/agent-status-context";
import {
  readEmailAgentChatId,
  type EmailComposeContext,
} from "../lib/agent/email-agent-prompt";

const LAYOUT_READY_DELAY_MS = 220;

export type EmailComposeLayoutSlot = {
  agentPrompt: ReactNode;
  agentWorking: boolean;
};

export type DesktopEmailComposeLayoutProps = {
  taskId: string;
  composeContext?: EmailComposeContext | null;
  message?: AgentMailMessageDetail | null;
  children: (slot: EmailComposeLayoutSlot) => ReactNode;
  onAssistantTurnComplete?: (text: string) => void | Promise<void>;
  promptPlaceholder?: string;
  promptDisabled?: boolean;
};

/**
 * Email draft chrome — embedded agent prompt + working state for the body.
 */
export function DesktopEmailComposeLayout({
  taskId,
  composeContext = null,
  message = null,
  children,
  onAssistantTurnComplete,
  promptPlaceholder,
  promptDisabled = false,
}: DesktopEmailComposeLayoutProps) {
  const { requestAttach } = useDesktopAgentStatus();
  const [agentWorking, setAgentWorking] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const reconcileKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setLayoutReady(false);
    const timer = window.setTimeout(
      () => setLayoutReady(true),
      LAYOUT_READY_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [taskId]);

  const handleAssistantTurnComplete = useCallback(
    async (text: string) => {
      await onAssistantTurnComplete?.(text);
    },
    [onAssistantTurnComplete],
  );

  const agentPrompt = (
    <DesktopEmailAgentPrompt
      key={taskId}
      taskId={taskId}
      message={message}
      composeContext={composeContext}
      onAssistantTurnComplete={handleAssistantTurnComplete}
      onWorkingChange={setAgentWorking}
      disabled={promptDisabled}
      placeholder={promptPlaceholder}
    />
  );

  useEffect(() => {
    if (!layoutReady) return;
    const chatId = readEmailAgentChatId(taskId)?.trim();
    if (!chatId) {
      reconcileKeyRef.current = null;
      return;
    }
    const key = `${taskId}:${chatId.toLowerCase()}`;
    if (reconcileKeyRef.current === key) return;
    reconcileKeyRef.current = key;
    requestAttach({
      taskId,
      chatId,
      forceReattach: true,
      focusUi: false,
    });
  }, [agentWorking, layoutReady, requestAttach, taskId]);

  return (
    <div className="desktop-email-compose" data-content-detail>
      {children({ agentPrompt, agentWorking })}
    </div>
  );
}
