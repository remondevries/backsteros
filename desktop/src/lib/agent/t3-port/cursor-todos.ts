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

/**
 * Prefer the latest todo snapshot (T3: always take newest plan payload).
 * Same-length status updates must win; only reject a shorter incoming list
 * so a stale partial cannot wipe a richer checklist.
 */
export function preferPlanSteps(
  existing: readonly AgentChatPlanStep[] | undefined,
  incoming: readonly AgentChatPlanStep[] | undefined,
): AgentChatPlanStep[] | undefined {
  const next = incoming ?? [];
  const prev = existing ?? [];
  if (next.length === 0) {
    return prev.length > 0 ? prev.map((step) => ({ ...step })) : undefined;
  }
  if (prev.length === 0 || next.length >= prev.length) {
    return next.map((step) => ({ ...step }));
  }
  return prev.map((step) => ({ ...step }));
}

export function planStepsEqual(
  a: readonly AgentChatPlanStep[] | undefined,
  b: readonly AgentChatPlanStep[] | undefined,
): boolean {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i]?.step !== right[i]?.step || left[i]?.status !== right[i]?.status) {
      return false;
    }
  }
  return true;
}

export function planStepsWorkingSummary(
  steps: readonly AgentChatPlanStep[],
  options?: { active?: boolean },
): string | null {
  if (steps.length === 0) return null;
  const inProgress = steps.filter((s) => s.status === "inProgress").length;
  const completed = steps.filter((s) => s.status === "completed").length;
  if (inProgress > 0) {
    // Only say “Working on…” while the turn is live — settled turns with
    // leftover inProgress steps otherwise look like the agent is still busy.
    if (options?.active) {
      return `Working on ${inProgress} to-do${inProgress === 1 ? "" : "s"}`;
    }
    return `In progress · ${inProgress} to-do${inProgress === 1 ? "" : "s"}`;
  }
  if (completed === steps.length) {
    return `Completed ${completed} to-do${completed === 1 ? "" : "s"}`;
  }
  return `To-do · ${completed}/${steps.length}`;
}
