import { useEffect, useState, type ReactNode } from "react";
import { type TaskAgentCandidate } from "@backsteros/ui";

import { useTaskAgentRun } from "../lib/use-task-agent-run";
import { useTaskAgentRunOrchestrator } from "../lib/use-task-agent-run-orchestrator";
import { TaskAgentRunAccordion } from "./task-agent-run-accordion";

export type TaskShellWorkspaceAgentsApi = {
  /** Start a factory run and wake the selected Grok conductor. */
  onSelectAgent: (candidate: TaskAgentCandidate) => void;
  /** True after an agent card has been activated / a run exists. */
  agentStarted: boolean;
  starting?: boolean;
  error?: string | null;
};

export type TaskShellWorkspaceProps = {
  /** When false, inactive panes tear down heavy views (PTY / chat). */
  active: boolean;
  taskId: string;
  cwd: string | null;
  /** Task assignee — shown on user lines in Build/Verify Log. */
  assigneeName?: string | null;
  /** Agents picker; receives kickoff helpers for the card click. */
  agentsPane: (api: TaskShellWorkspaceAgentsApi) => ReactNode;
};

/**
 * Agent tab body: picker first; after an agent card is clicked, creates a
 * persisted task agent run, wakes Grok into Brief, and shows the factory
 * accordion. Desktop orchestrator kicks local Cursor ACP on build/record.
 */
export function TaskShellWorkspace({
  active,
  taskId,
  cwd,
  assigneeName = null,
  agentsPane,
}: TaskShellWorkspaceProps) {
  const {
    run,
    briefMessages,
    error,
    starting,
    startRun,
    sendBriefMessage,
    answerBriefChoices,
    answerBriefApproval,
    answerBriefForm,
    answerBriefEmailDraft,
    requestJson,
  } = useTaskAgentRun({ active, taskId });
  const [selectedAgent, setSelectedAgent] = useState<TaskAgentCandidate | null>(
    null,
  );
  const [localError, setLocalError] = useState<string | null>(null);
  const [recordHeadSha, setRecordHeadSha] = useState<string | null>(null);

  useTaskAgentRunOrchestrator({
    active,
    taskId,
    cwd,
    run,
    requestJson,
    onError: setLocalError,
    onRecordHydrated: (info) => {
      setRecordHeadSha(info.headSha);
    },
  });

  useEffect(() => {
    setSelectedAgent(null);
    setLocalError(null);
    setRecordHeadSha(null);
  }, [taskId]);

  useEffect(() => {
    setRecordHeadSha(null);
  }, [run?.id, run?.cycle]);

  const agentStarted = Boolean(run && run.status === "active");
  const combinedError = localError || error;

  const onSelectAgent = (candidate: TaskAgentCandidate) => {
    setSelectedAgent(candidate);
    void startRun({
      conductorAgentId: candidate.agentId,
      replaceActive: true,
      wakeConductor: true,
    }).catch(() => undefined);
  };

  return (
    <div
      className={[
        "task-shell-workspace",
        agentStarted ? null : "is-agents-only",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!agentStarted ? (
        <div className="task-shell-workspace__pane task-shell-workspace__pane--agents">
          {agentsPane({
            onSelectAgent,
            agentStarted,
            starting,
            error: combinedError,
          })}
          {combinedError ? (
            <p className="task-shell-workspace__error" role="alert">
              {combinedError}
            </p>
          ) : null}
          {starting ? (
            <p className="task-shell-workspace__status" role="status">
              Waking conductor…
            </p>
          ) : null}
        </div>
      ) : (
        <div className="task-shell-workspace__pane task-shell-workspace__pane--run">
          <TaskAgentRunAccordion
            active={active}
            taskId={taskId}
            cwd={cwd}
            agentName={selectedAgent?.name ?? null}
            agentAvatarSrc={selectedAgent?.avatarSrc ?? null}
            assigneeName={assigneeName}
            run={run}
            briefMessages={briefMessages}
            onSendBriefMessage={(text) => {
              void sendBriefMessage(text);
            }}
            onAnswerBriefChoices={(messageId, values) =>
              answerBriefChoices(messageId, values)
            }
            onAnswerBriefApproval={(messageId, decision, note) =>
              answerBriefApproval(messageId, decision, note)
            }
            onAnswerBriefForm={(messageId, values) =>
              answerBriefForm(messageId, values)
            }
            onAnswerBriefEmailDraft={(messageId, emailAction, edits) =>
              answerBriefEmailDraft(messageId, emailAction, edits)
            }
            orchestratorError={combinedError}
            recordHeadSha={recordHeadSha}
          />
        </div>
      )}
    </div>
  );
}
