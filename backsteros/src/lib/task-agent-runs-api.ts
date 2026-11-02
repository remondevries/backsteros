import type {
  CreateTaskAgentRunCheckInput,
  CreateTaskAgentRunInput,
  TaskAgentRun,
  TaskAgentRunCheck,
  UpdateTaskAgentRunCheckInput,
  UpdateTaskAgentRunInput,
} from "@backsteros/contracts";

export type TaskAgentRunsRequestJson = <T>(
  path: string,
  init?: RequestInit,
) => Promise<T>;

export async function startTaskAgentRun(
  requestJson: TaskAgentRunsRequestJson,
  taskId: string,
  input: CreateTaskAgentRunInput,
): Promise<TaskAgentRun> {
  return requestJson<TaskAgentRun>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-runs`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function fetchActiveTaskAgentRun(
  requestJson: TaskAgentRunsRequestJson,
  taskId: string,
): Promise<TaskAgentRun | null> {
  try {
    return await requestJson<TaskAgentRun>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-runs/active`,
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function fetchTaskAgentRun(
  requestJson: TaskAgentRunsRequestJson,
  taskId: string,
  runId: string,
): Promise<TaskAgentRun | null> {
  try {
    return await requestJson<TaskAgentRun>(
      `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-runs/${encodeURIComponent(runId)}`,
    );
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function patchTaskAgentRun(
  requestJson: TaskAgentRunsRequestJson,
  taskId: string,
  runId: string,
  input: UpdateTaskAgentRunInput,
): Promise<TaskAgentRun> {
  return requestJson<TaskAgentRun>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-runs/${encodeURIComponent(runId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function createTaskAgentRunCheck(
  requestJson: TaskAgentRunsRequestJson,
  taskId: string,
  runId: string,
  input: CreateTaskAgentRunCheckInput,
): Promise<TaskAgentRunCheck> {
  return requestJson<TaskAgentRunCheck>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-runs/${encodeURIComponent(runId)}/checks`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function patchTaskAgentRunCheck(
  requestJson: TaskAgentRunsRequestJson,
  taskId: string,
  runId: string,
  checkId: string,
  input: UpdateTaskAgentRunCheckInput,
): Promise<TaskAgentRunCheck> {
  return requestJson<TaskAgentRunCheck>(
    `/api/v1/tasks/${encodeURIComponent(taskId)}/agent-runs/${encodeURIComponent(runId)}/checks/${encodeURIComponent(checkId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  const code = (error as { code?: unknown }).code;
  if (status === 404 || code === "not_found") return true;
  // cloudCoreRequestJson embeds status in the message: "404 {…}"
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /^404\b/.test(message.trim());
}
