/**
 * Plan / todo step checklist.
 * Adapted from pingdotgg/t3code (MIT) — apps/web/src/components/PlanSidebar.tsx steps UI
 */

import { Check } from "lucide-react";

import {
  planStepsWorkingSummary,
  type AgentChatPlanStep,
} from "../../lib/agent/t3-port/cursor-todos";

/**
 * In-progress step indicator. Uses SVG `animateTransform` with an explicit
 * center (6 6) so rotation cannot drift off-axis the way CSS-spinning an
 * asymmetric Lucide Loader path can.
 */
function PlanStepSpinner() {
  return (
    <svg
      className="desktop-agent-chat__plan-todo-spinner"
      viewBox="0 0 12 12"
      width={12}
      height={12}
      fill="none"
      aria-hidden
    >
      <g>
        <circle
          cx="6"
          cy="6"
          r="4.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeDasharray="7 20"
        />
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 6 6"
          to="360 6 6"
          dur="0.9s"
          repeatCount="indefinite"
        />
      </g>
    </svg>
  );
}

function StepStatusIcon({ status }: { status: AgentChatPlanStep["status"] }) {
  if (status === "completed") {
    return (
      <span
        className="desktop-agent-chat__plan-todo-icon is-completed"
        aria-hidden
      >
        <Check
          className="desktop-agent-chat__plan-todo-lucide"
          size={12}
          strokeWidth={2.2}
        />
      </span>
    );
  }
  if (status === "inProgress") {
    return (
      <span
        className="desktop-agent-chat__plan-todo-icon is-progress"
        aria-hidden
      >
        <PlanStepSpinner />
      </span>
    );
  }
  return (
    <span
      className="desktop-agent-chat__plan-todo-icon is-pending"
      aria-hidden
    >
      <span className="desktop-agent-chat__plan-todo-dot" />
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
