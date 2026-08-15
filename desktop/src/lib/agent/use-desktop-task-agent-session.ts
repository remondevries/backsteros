import { useCallback, useRef, useState } from "react";

import { useDesktopApi } from "../api-context";
import { ensureProjectVault } from "../ensure-project-vault";
import { buildReadyToStartAgentPrompt } from "./agent-launch";
import { readAgentChatMode } from "./agent-chat-mode";
import { readAgentChatModelId } from "./agent-chat-model";
import {
  createAgentChatMessage,
  publishAgentChatTranscriptMessage,
  saveAgentChatTranscript,
  type AgentChatImageAttachment,
} from "./agent-chat-transcript";
import { useDesktopAgentStatus } from "./agent-status-context";
import {
  clearLiveAgentWorkingForTask,
  markLiveAgentWorkingForTask,
} from "./clear-live-agent-working";
import { normalizeWorkingDirectory } from "./project-workspace";
import {
  IMAGE_ONLY_BOOTSTRAP_PROMPT,
  startTaskAgentSession,
} from "./start-task-agent-session";

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
  const { client } = useDesktopApi();
  const {
    requestAttach,
    requestEnd,
    focusAgentTab,
    setTaskResearchWorking,
    setPendingBootstrapPrompt,
  } = useDesktopAgentStatus();

  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentError, setAgentError] = useState<string | null>(null);
  /** State lags one render — ref blocks concurrent Start / auto-start races. */
  const creatingAgentRef = useRef(false);

  const hasSession = Boolean(agentChatId?.trim());

  const startAgentSession = useCallback(
    async (options?: {
      prompt?: string;
      images?: readonly AgentChatImageAttachment[];
      mode?: string | null;
    }) => {
      if (creatingAgentRef.current) return;
      creatingAgentRef.current = true;
      setCreatingAgent(true);
      setAgentError(null);
      // Immediate feedback — Chat Working… + focus before vault/ensure/prompt.
      setTaskResearchWorking(taskId, true);
      markLiveAgentWorkingForTask(taskId);
      focusAgentTab();
      try {
        let workingDirectory = normalizeWorkingDirectory(
          taskSummary.workingDirectory,
        );
        // Safety: create vault project folder + .cursor skills, and adopt the
        // vault path as cwd when the project has no working directory yet.
        if (taskSummary.projectId?.trim()) {
          const ensured = await ensureProjectVault(
            client,
            taskSummary.projectId,
          );
          if (ensured?.configured) {
            workingDirectory =
              normalizeWorkingDirectory(ensured.localWorkingDirectory) ??
              normalizeWorkingDirectory(ensured.projectVaultPath) ??
              workingDirectory;
          }
        }
        if (!workingDirectory) {
          throw new Error(
            "Configure a vault folder in Settings → Storage (or set a local working directory) before starting the agent.",
          );
        }
        const imagePayload = (options?.images ?? [])
          .filter((image) => image.dataBase64)
          .map((image) => ({
            mimeType: image.mimeType,
            data: image.dataBase64!,
          }));
        const customPrompt = options?.prompt?.trim();
        const prompt =
          customPrompt ||
          (imagePayload.length > 0
            ? IMAGE_ONLY_BOOTSTRAP_PROMPT
            : buildReadyToStartAgentPrompt({
                id: taskId,
                number: taskSummary.number,
                title: taskSummary.title,
                description: taskSummary.description,
                projectKey: taskSummary.projectKey,
                workingDirectory,
              }));
        // Optimistic user bubble + Working… before ensure/prompt round-trips.
        const bootstrap = createAgentChatMessage("user", prompt, {
          images: options?.images ? [...options.images] : undefined,
        });
        setPendingBootstrapPrompt({
          taskId,
          prompt,
          messageId: bootstrap.id,
          createdAt: bootstrap.createdAt,
          images: options?.images ? [...options.images] : undefined,
        });
        const result = await startTaskAgentSession({
          taskId,
          cwd: workingDirectory,
          prompt,
          model: readAgentChatModelId(),
          mode: options?.mode ?? readAgentChatMode(),
          images: imagePayload,
        });
        if (!result.ok) {
          setPendingBootstrapPrompt(null);
          clearLiveAgentWorkingForTask(taskId);
          throw new Error(result.error);
        }
        saveAgentChatTranscript(result.chatId, [bootstrap]);
        publishAgentChatTranscriptMessage(result.chatId, bootstrap);
        requestAttach({
          taskId,
          chatId: result.chatId,
          prompt,
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
        setPendingBootstrapPrompt(null);
      } catch (err) {
        setPendingBootstrapPrompt(null);
        clearLiveAgentWorkingForTask(taskId);
        setTaskResearchWorking(taskId, false);
        setAgentError(
          err instanceof Error
            ? err.message
            : "Could not create agent session.",
        );
      } finally {
        creatingAgentRef.current = false;
        setCreatingAgent(false);
      }
    },
    [
      automateTaskStatus,
      client,
      focusAgentTab,
      patchTaskValues,
      requestAttach,
      setPendingBootstrapPrompt,
      setTaskResearchWorking,
      taskId,
      taskSummary,
    ],
  );

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
