/**
 * Plan / todo step checklist.
 * Adapted from pingdotgg/t3code (MIT) — apps/web/src/components/PlanSidebar.tsx steps UI
 *
 * Status glyphs:
 * - pending → ready_to_start ring only
 * - inProgress + active turn → spinning loader (T3 PlanSidebar)
 * - inProgress + settled → static in_progress ring (no fake “still working”)
 * - completed → completed
 */

import { TaskStatusIcon } from "@backsteros/ui";
import { Loader2 } from "lucide-react";

import {
  planStepsWorkingSummary,
  type AgentChatPlanStep,
} from "../../lib/agent/t3-port/cursor-todos";

function StepStatusIcon({
  status,
  active,
}: {
  status: AgentChatPlanStep["status"];
  active: boolean;
}) {
  if (status === "completed") {
    return (
      <span className="desktop-agent-chat__plan-todo-icon" aria-hidden>
        <TaskStatusIcon status="completed" size={14} />
      </span>
    );
  }
  if (status === "inProgress") {
    if (active) {
      return (
        <span
          className="desktop-agent-chat__plan-todo-icon desktop-agent-chat__plan-todo-icon--busy"
          aria-hidden
        >
          <Loader2
            className="desktop-agent-chat__plan-todo-spinner desktop-agent-chat__spin"
            size={12}
            strokeWidth={2}
          />
        </span>
      );
    }
    return (
      <span className="desktop-agent-chat__plan-todo-icon" aria-hidden>
        <TaskStatusIcon status="in_progress" size={14} />
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
  /** When true, in-progress steps spin and the summary reads as active work. */
  active = false,
}: {
  steps: readonly AgentChatPlanStep[];
  label?: string;
  active?: boolean;
}) {
  if (steps.length === 0) return null;
  const summary = planStepsWorkingSummary(steps, { active });

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
            className={`desktop-agent-chat__plan-todo is-${step.status}${
              active && step.status === "inProgress" ? " is-active" : ""
            }`}
          >
            <StepStatusIcon status={step.status} active={active} />
            <p className="desktop-agent-chat__plan-todo-text">{step.step}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
