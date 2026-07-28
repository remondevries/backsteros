/**
 * Plan / todo step checklist.
 * Adapted from pingdotgg/t3code (MIT) — apps/web/src/components/PlanSidebar.tsx steps UI
 *
 * Status glyphs match the system TaskStatusIcon set:
 * pending → ready_to_start ring only, inProgress → working pulse,
 * completed → completed.
 */

import { TaskStatusIcon } from "@backsteros/ui";

import {
  planStepsWorkingSummary,
  type AgentChatPlanStep,
} from "../../lib/agent/t3-port/cursor-todos";

function StepStatusIcon({ status }: { status: AgentChatPlanStep["status"] }) {
  if (status === "completed") {
    return (
      <span className="desktop-agent-chat__plan-todo-icon" aria-hidden>
        <TaskStatusIcon status="completed" size={14} />
      </span>
    );
  }
  if (status === "inProgress") {
    return (
      <span className="desktop-agent-chat__plan-todo-icon" aria-hidden>
        <TaskStatusIcon status="in_progress" working size={14} />
      </span>
    );
  }
  return (
    <span className="desktop-agent-chat__plan-todo-icon" aria-hidden>
      <TaskStatusIcon status="ready_to_start" ringOnly size={14} />
    </span>
  );
}

export function PlanTodoList({
  steps,
  label = "To-dos",
}: {
  steps: readonly AgentChatPlanStep[];
  label?: string;
}) {
  if (steps.length === 0) return null;
  const summary = planStepsWorkingSummary(steps);

  return (
    <section className="desktop-agent-chat__plan-todos" aria-label={label}>
      {summary ? (
        <p className="desktop-agent-chat__plan-todos-summary">{summary}</p>
      ) : null}
      <p className="desktop-agent-chat__plan-todos-heading">Steps</p>
      <ul className="desktop-agent-chat__plan-todos-list">
        {steps.map((step) => (
          <li
            key={`${step.status}:${step.step}`}
            className={`desktop-agent-chat__plan-todo is-${step.status}`}
          >
            <StepStatusIcon status={step.status} />
            <p className="desktop-agent-chat__plan-todo-text">{step.step}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
