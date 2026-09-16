import { fetchBacksterosFileTaskCallback } from "../client";

export type FileTaskWakePayload = {
  readonly brief: string;
  readonly projectId: string;
  readonly projectKey: string | null;
  readonly assigneeId: string;
  readonly priority: number;
  readonly status: "backlog";
  readonly requestId: string;
  readonly callbackUrl: string;
};

export type FileTaskCallbackSuccess = {
  readonly ok: true;
  readonly requestId: string;
  readonly taskId?: string;
  readonly taskRef?: string;
  readonly title?: string;
  readonly projectId?: string;
  readonly summary?: string;
};

export type FileTaskCallbackFailure = {
  readonly ok: false;
  readonly requestId: string;
  readonly error: string;
};

export type FileTaskCallbackResult = FileTaskCallbackSuccess | FileTaskCallbackFailure;

export async function wakeFileTaskAgent(input: {
  readonly webhookUrl: string;
  readonly webhookKey: string;
  readonly payload: FileTaskWakePayload;
}): Promise<{ readonly requestId: string }> {
  const response = await fetch("/api/backsteros/file-task-wake", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      webhookUrl: input.webhookUrl,
      webhookKey: input.webhookKey,
      payload: input.payload,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    requestId?: string;
    error?: string;
  } | null;
  if (!response.ok || !body?.ok || !body.requestId) {
    throw new Error(body?.error?.trim() || `Could not wake agent (${response.status})`);
  }
  return { requestId: body.requestId };
}

export async function pollFileTaskCallback(
  requestId: string,
  options?: {
    readonly signal?: AbortSignal;
    readonly intervalMs?: number;
    readonly timeoutMs?: number;
  },
): Promise<FileTaskCallbackResult> {
  const intervalMs = options?.intervalMs ?? 1500;
  const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;
  const started = Date.now();

  while (true) {
    if (options?.signal?.aborted) {
      throw new Error("Cancelled");
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error("Timed out waiting for the agent callback");
    }

    let body: Awaited<ReturnType<typeof fetchBacksterosFileTaskCallback>>;
    try {
      body = await fetchBacksterosFileTaskCallback(requestId, options?.signal);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Callback poll failed";
      if (message.toLowerCase().includes("not found")) {
        throw new Error("Unknown file-task request");
      }
      throw error;
    }

    if (body.pending) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      continue;
    }
    const result = body.result;
    if (result && result.requestId === requestId) {
      if (result.ok === false) {
        return {
          ok: false,
          requestId: result.requestId,
          error: result.error?.trim() || "Agent could not file the task",
        };
      }
      return {
        ok: true,
        requestId: result.requestId,
        taskId: result.taskId,
        taskRef: result.taskRef,
        title: result.title,
        projectId: result.projectId,
        summary: result.summary,
      };
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
