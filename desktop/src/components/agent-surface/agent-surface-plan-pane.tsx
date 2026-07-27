import { ClipboardList } from "lucide-react";

import { ProposedPlanCard } from "../agent-chat/proposed-plan-card";
import { PlanTodoList } from "../agent-chat/plan-todo-list";
import type { AgentChatPlanStep } from "../../lib/agent/agent-acp-activity";

export type AgentSurfacePlanPaneProps = {
  proposedPlanMarkdown?: string | null;
  planSteps?: readonly AgentChatPlanStep[];
};

export function AgentSurfacePlanPane({
  proposedPlanMarkdown = null,
  planSteps = [],
}: AgentSurfacePlanPaneProps) {
  const hasPlan = Boolean(proposedPlanMarkdown?.trim());
  const hasSteps = planSteps.length > 0;

  if (!hasPlan && !hasSteps) {
    return (
      <div className="agent-surface-pane agent-surface-pane--plan">
        <div className="agent-surface-empty agent-surface-empty--centered">
          <ClipboardList size={20} aria-hidden strokeWidth={1.6} />
          <h3>No plan yet</h3>
          <p>When the agent proposes a plan, it will show up here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-surface-pane agent-surface-pane--plan">
      <div className="agent-surface-plan-body">
        {hasPlan && proposedPlanMarkdown ? (
          <ProposedPlanCard planMarkdown={proposedPlanMarkdown} />
        ) : null}
        {hasSteps ? <PlanTodoList steps={planSteps} /> : null}
      </div>
    </div>
  );
}
