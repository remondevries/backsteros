import { useCallback, useState } from "react";

import { buildReadyToStartAgentPrompt } from "./agent-launch";
import { readAgentChatModelId } from "./agent-chat-model";
import {
  createAgentChatMessage,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
} from "./agent-chat-transcript";
import { useDesktopAgentStatus } from "./agent-status-context";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "./clear-live-agent-working";
import { normalizeWorkingDirectory } from "./project-workspace";
import { startTaskAgentSession } from "./start-task-agent-session";

export type DesktopTaskAgentSessionSummary = {
  number: number;
  title: string;
  description: string | null;
  status?: string | null;
  projectKey?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  displayId?: string | null;
  workingDirectory?: string | null;
};

export type UseDesktopTaskAgentSessionOptions = {
  taskId: string;
  agentChatId?: string | null;
  taskSummary: DesktopTaskAgentSessionSummary;
  patchTaskValues: (values: Record<string, unknown>) => Promise<void>;
  /**
   * Codebase projects only: patch status to In Progress when the agent
   * session starts. Non-codebase rails leave status alone.
   */
  automateTaskStatus?: boolean;
};

/**
 * Start / Stop agent lifecycle for desktop task surfaces (terminal square +
 * chat rail). Persist binding on the task; viewers attach via status context.
 */
export function useDesktopTaskAgentSession({
  taskId,
  agentChatId = null,
  taskSummary,
  patchTaskValues,
  automateTaskStatus = false,
}: UseDesktopTaskAgentSessionOptions) {
  const { requestAttach, requestEnd, focusAgentTab, setTaskResearchWorking } =
    useDesktopAgentStatus();

  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);

  const hasSession = Boolean(agentChatId?.trim());

  const startAgentSession = useCallback(async () => {
    if (creatingAgent) return;
    setCreatingAgent(true);
    setAgentError(null);
    try {
      const workingDirectory = normalizeWorkingDirectory(
        taskSummary.workingDirectory,
      );
      if (!workingDirectory) {
        throw new Error(
          "Set a local working directory on this project before starting the agent.",
        );
      }
      const prompt = buildReadyToStartAgentPrompt({
        id: taskId,
        number: taskSummary.number,
        title: taskSummary.title,
        description: taskSummary.description,
        projectKey: taskSummary.projectKey,
        workingDirectory,
      });
      // Optimistic — list/activity pulses should light up before ACP attaches
      // (bootstrap prompt is fire-and-forget; WebSocket hooks often miss it).
      setTaskResearchWorking(taskId, true);
      markLiveAgentWorkingForTask(taskId);
      const result = await startTaskAgentSession({
        taskId,
        cwd: workingDirectory,
        prompt,
        model: readAgentChatModelId(),
      });
      if (!result.ok) {
        clearLiveAgentWorkingForTask(taskId);
        throw new Error(result.error);
      }
      const bootstrap = createAgentChatMessage("user", prompt);
      saveAgentChatTranscript(result.chatId, [bootstrap]);
      publishAgentChatTranscriptMessage(result.chatId, bootstrap);
      focusAgentTab();
      requestAttach({
        taskId,
        chatId: result.chatId,
        sessionIsNew: true,
        forceReattach: true,
        focusUi: true,
      });
      await patchTaskValues({
        ...(automateTaskStatus
          ? { status: "in_progress", activityActor: "agent" }
          : { activityActor: "agent" }),
        agentChatId: result.chatId,
      });
    } catch (err) {
      clearLiveAgentWorkingForTask(taskId);
      setAgentError(
        err instanceof Error ? err.message : "Could not create agent session.",
      );
    } finally {
      setCreatingAgent(false);
    }
  }, [
    automateTaskStatus,
    creatingAgent,
    focusAgentTab,
    patchTaskValues,
    requestAttach,
    setTaskResearchWorking,
    taskId,
    taskSummary,
  ]);

  const endAgentSession = useCallback(() => {
    const chatId = agentChatId?.trim();
    if (!chatId) return;
    clearLiveAgentWorkingForTask(taskId);
    // Keep the terminal / chat rail open so it returns to the Start agent square.
    requestEnd({ taskId, chatId });
    void patchTaskValues({ agentChatId: null, activityActor: "agent" }).catch(
      (err) => {
        setAgentError(
          err instanceof Error
            ? err.message
            : "Could not clear agent session.",
        );
      },
    );
  }, [
    agentChatId,
    patchTaskValues,
    requestEnd,
    taskId,
  ]);

  return {
    hasSession,
    creatingAgent,
    agentError,
    clearAgentError: () => setAgentError(null),
    startAgentSession,
    endAgentSession,
  };
}
