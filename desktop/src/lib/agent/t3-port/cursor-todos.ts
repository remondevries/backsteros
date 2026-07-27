/**
 * Cursor ACP extension todo/plan helpers.
 * Adapted from pingdotgg/t3code (MIT) — apps/server/src/provider/acp/CursorAcpExtension.ts
 */

export type AgentChatPlanStepStatus = "pending" | "inProgress" | "completed";

export type AgentChatPlanStep = {
  step: string;
  status: AgentChatPlanStepStatus;
};

export type CursorTodoLike = {
  id?: string;
  content?: string;
  title?: string;
  status?: string;
};

export type CursorUpdateTodosParams = {
  toolCallId?: string;
  todos?: CursorTodoLike[];
  merge?: boolean;
};

export type CursorCreatePlanParams = {
  toolCallId?: string;
  name?: string;
  overview?: string;
  plan?: string;
  todos?: CursorTodoLike[];
};

/** Map `cursor/update_todos` params → plan steps (t3 `extractTodosAsPlan`). */
export function extractTodosAsPlan(params: CursorUpdateTodosParams): {
  explanation?: string;
  plan: AgentChatPlanStep[];
} {
  const todos = Array.isArray(params.todos) ? params.todos : [];
  const plan = todos.flatMap((todo) => {
    const step = todo.content?.trim() ?? todo.title?.trim() ?? "";
    if (step === "") return [];
    const status: AgentChatPlanStepStatus =
      todo.status === "completed"
        ? "completed"
        : todo.status === "in_progress" || todo.status === "inProgress"
          ? "inProgress"
          : "pending";
    return [{ step, status }];
  });
  return { plan };
}

/** Map `cursor/create_plan` params → markdown (t3 `extractPlanMarkdown`). */
export function extractPlanMarkdown(params: CursorCreatePlanParams): string {
  if (typeof params.plan === "string" && params.plan.trim()) {
    return params.plan;
  }
  return "# Plan\n\n(Cursor did not supply plan text.)";
}

/** Merge todo updates when `merge: true` (by step text). */
export function mergePlanSteps(
  previous: readonly AgentChatPlanStep[],
  next: readonly AgentChatPlanStep[],
  merge: boolean,
): AgentChatPlanStep[] {
  if (!merge || previous.length === 0) return [...next];
  const byStep = new Map<string, AgentChatPlanStep>();
  for (const step of previous) {
    byStep.set(step.step, step);
  }
  for (const step of next) {
    byStep.set(step.step, step);
  }
  return [...byStep.values()];
}

export function planStepsWorkingSummary(
  steps: readonly AgentChatPlanStep[],
): string | null {
  if (steps.length === 0) return null;
  const inProgress = steps.filter((s) => s.status === "inProgress").length;
  const completed = steps.filter((s) => s.status === "completed").length;
  if (inProgress > 0) {
    return `Working on ${inProgress} to-do${inProgress === 1 ? "" : "s"}`;
  }
  if (completed === steps.length) {
    return `Completed ${completed} to-do${completed === 1 ? "" : "s"}`;
  }
  return `To-do · ${completed}/${steps.length}`;
}
