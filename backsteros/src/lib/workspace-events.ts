/**
 * Authenticated SSE subscriber for workspace entity updates.
 * Desktop uses this to refresh REST snapshots and invalidate Tier D caches
 * when agents write via the API before PowerSync catches up.
 *
 * Kinds match core `SyncEntity` (except task_comment is remapped to task).
 */

export const WORKSPACE_UPDATED_KIND_VALUES = [
  "project",
  "task",
  "document",
  "area",
  "organization",
  "contact",
  "letter",
  "workspace_setting",
  "bank_account",
  "financial_category",
  "financial_goal",
  "financial_recurring",
  "cashflow_planner_entry",
  "financial_transaction",
  "habit",
  "meeting",
  "contact_relationship",
  "crm_relationship_label",
  "crm_group",
  "crm_group_member",
  "crm_activity",
  "task_activity",
  "email_thread",
  "email_thread_comment",
  "recurring_task",
  "mention",
] as const;

export type WorkspaceUpdatedKind = (typeof WORKSPACE_UPDATED_KIND_VALUES)[number];

export type WorkspaceUpdatedOperation = "upsert" | "delete";

export type WorkspaceUpdatedPayload = {
  kind: WorkspaceUpdatedKind;
  entityId: string;
  projectId: string | null;
  reason: "comment" | "patch" | null;
  contentVersion: number | null;
  operation: WorkspaceUpdatedOperation;
};

export type WorkspaceDocumentUpdatedDetail = {
  documentId: string;
  contentVersion: number | null;
  operation: WorkspaceUpdatedOperation;
};

/** Fired when workspace SSE reports a document write (body and/or metadata). */
export const WORKSPACE_DOCUMENT_UPDATED_EVENT =
  "backsteros-workspace-document-updated";

export type WorkspaceProjectUpdatedDetail = {
  projectId: string;
  operation: WorkspaceUpdatedOperation;
};

/** Fired when workspace SSE reports a project create/update/delete. */
export const WORKSPACE_PROJECT_UPDATED_EVENT =
  "backsteros-workspace-project-updated";

export type WorkspaceTaskUpdatedDetail = {
  taskId: string;
  reason: "comment" | "patch" | null;
  operation: WorkspaceUpdatedOperation;
};

/** Fired when workspace SSE reports a task (or task-comment) write. */
export const WORKSPACE_TASK_UPDATED_EVENT =
  "backsteros-workspace-task-updated";

export type WorkspaceMeetingUpdatedDetail = {
  meetingId: string;
  operation: WorkspaceUpdatedOperation;
};

/** Fired when workspace SSE reports a meeting create/update/delete. */
export const WORKSPACE_MEETING_UPDATED_EVENT =
  "backsteros-workspace-meeting-updated";

export type WorkspaceContactUpdatedDetail = {
  contactId: string;
  operation: WorkspaceUpdatedOperation;
};

/** Fired when workspace SSE reports a contact create/update/delete. */
export const WORKSPACE_CONTACT_UPDATED_EVENT =
  "backsteros-workspace-contact-updated";

export type WorkspaceOrganizationUpdatedDetail = {
  organizationId: string;
  operation: WorkspaceUpdatedOperation;
};

/** Fired when workspace SSE reports an organization create/update/delete. */
export const WORKSPACE_ORGANIZATION_UPDATED_EVENT =
  "backsteros-workspace-organization-updated";

export type WorkspaceAreaUpdatedDetail = {
  areaId: string;
  operation: WorkspaceUpdatedOperation;
};

export const WORKSPACE_AREA_UPDATED_EVENT =
  "backsteros-workspace-area-updated";

export type WorkspaceHabitUpdatedDetail = {
  habitId: string;
  operation: WorkspaceUpdatedOperation;
};

export const WORKSPACE_HABIT_UPDATED_EVENT =
  "backsteros-workspace-habit-updated";

export type WorkspaceLetterUpdatedDetail = {
  letterId: string;
  operation: WorkspaceUpdatedOperation;
};

export const WORKSPACE_LETTER_UPDATED_EVENT =
  "backsteros-workspace-letter-updated";

/**
 * Fired when workspace SSE reports a CRM group or membership change.
 * Listeners should refetch Clients filters / group chips (REST or PowerSync).
 */
export const WORKSPACE_CRM_GROUPS_UPDATED_EVENT =
  "backsteros-workspace-crm-groups-updated";

/**
 * Fired for CRM activity / relationship / label writes (subject-detail panels).
 */
export const WORKSPACE_CRM_DATA_UPDATED_EVENT =
  "backsteros-workspace-crm-data-updated";

/** Fired for bank accounts / categories / goals / recurrings / transactions. */
export const WORKSPACE_FINANCE_UPDATED_EVENT =
  "backsteros-workspace-finance-updated";

/** Fired for email thread sync entities (AgentMail may also push separately). */
export const WORKSPACE_EMAIL_UPDATED_EVENT =
  "backsteros-workspace-email-updated";

/**
 * Catch-all for remaining entities (workspace_setting, mention, task_activity,
 * recurring_task, cashflow_planner_entry, …) when no dedicated handler exists.
 */
export const WORKSPACE_ENTITY_UPDATED_EVENT =
  "backsteros-workspace-entity-updated";

export type WorkspaceEntityUpdatedDetail = {
  kind: WorkspaceUpdatedKind;
  entityId: string;
  operation: WorkspaceUpdatedOperation;
};

export type WorkspaceEventsClient = {
  requestStream: (path: string, init?: RequestInit) => Promise<Response>;
};

const WORKSPACE_UPDATED_KINDS = new Set<string>(WORKSPACE_UPDATED_KIND_VALUES);

const FINANCE_KINDS = new Set<WorkspaceUpdatedKind>([
  "bank_account",
  "financial_category",
  "financial_goal",
  "financial_recurring",
  "financial_transaction",
  "cashflow_planner_entry",
]);

const CRM_DATA_KINDS = new Set<WorkspaceUpdatedKind>([
  "contact_relationship",
  "crm_relationship_label",
  "crm_activity",
]);

const EMAIL_KINDS = new Set<WorkspaceUpdatedKind>([
  "email_thread",
  "email_thread_comment",
]);

export function isFinanceWorkspaceKind(
  kind: WorkspaceUpdatedKind,
): boolean {
  return FINANCE_KINDS.has(kind);
}

export function isCrmDataWorkspaceKind(
  kind: WorkspaceUpdatedKind,
): boolean {
  return CRM_DATA_KINDS.has(kind);
}

export function isEmailWorkspaceKind(kind: WorkspaceUpdatedKind): boolean {
  return EMAIL_KINDS.has(kind);
}

function parseWorkspaceUpdatedKind(value: unknown): WorkspaceUpdatedKind | null {
  if (typeof value !== "string") return null;
  return WORKSPACE_UPDATED_KINDS.has(value)
    ? (value as WorkspaceUpdatedKind)
    : null;
}

function parseContentVersion(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseOperation(value: unknown): WorkspaceUpdatedOperation {
  return value === "delete" ? "delete" : "upsert";
}

function parseSseChunk(
  chunk: string,
  onEvent: (event: string, data: string) => void,
): void {
  const blocks = chunk.split("\n\n");
  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trimStart());
      }
    }
    if (dataLines.length === 0) continue;
    onEvent(event, dataLines.join("\n"));
  }
}

export async function subscribeWorkspaceEvents(input: {
  client: WorkspaceEventsClient;
  signal: AbortSignal;
  onUpdated: (payload: WorkspaceUpdatedPayload) => void;
  onError?: (error: unknown) => void;
}): Promise<void> {
  const response = await new Promise<Response>((resolve, reject) => {
    const timeoutMs = 15_000;
    const timer = setTimeout(() => {
      reject(new Error("Workspace events connect timed out"));
    }, timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (input.signal.aborted) {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    input.signal.addEventListener("abort", onAbort, { once: true });
    void input.client
      .requestStream("/api/v1/workspace/events", {
        method: "GET",
        signal: input.signal,
      })
      .then((res) => {
        clearTimeout(timer);
        input.signal.removeEventListener("abort", onAbort);
        resolve(res);
      })
      .catch((error) => {
        clearTimeout(timer);
        input.signal.removeEventListener("abort", onAbort);
        reject(error);
      });
  });
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Workspace events stream has no body");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  const idleMs = 45_000;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      void reader.cancel().catch(() => {});
    }, idleMs);
  };
  armIdle();
  const onParentAbort = () => {
    if (idleTimer) clearTimeout(idleTimer);
    void reader.cancel().catch(() => {});
  };
  if (input.signal.aborted) {
    onParentAbort();
  } else {
    input.signal.addEventListener("abort", onParentAbort, { once: true });
  }
  try {
    while (!input.signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        parseSseChunk(part, (event, data) => {
          if (event !== "workspace.updated") return;
          try {
            const parsed = JSON.parse(data) as {
              kind?: unknown;
              entityId?: unknown;
              projectId?: unknown;
              reason?: unknown;
              contentVersion?: unknown;
              operation?: unknown;
            };
            const entityId =
              typeof parsed.entityId === "string" ? parsed.entityId.trim() : "";
            if (!entityId) return;
            const kind = parseWorkspaceUpdatedKind(parsed.kind);
            if (!kind) return;
            input.onUpdated({
              kind,
              entityId,
              projectId:
                typeof parsed.projectId === "string"
                  ? parsed.projectId
                  : null,
              reason:
                parsed.reason === "comment" || parsed.reason === "patch"
                  ? parsed.reason
                  : null,
              contentVersion: parseContentVersion(parsed.contentVersion),
              operation: parseOperation(parsed.operation),
            });
          } catch {
            // Ignore malformed event payloads.
          }
        });
      }
    }
  } catch (error) {
    if (input.signal.aborted) return;
    input.onError?.(error);
    throw error;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    input.signal.removeEventListener("abort", onParentAbort);
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

/** Keep reconnecting with exponential backoff until aborted. */
export function startWorkspaceEventsLoop(input: {
  client: WorkspaceEventsClient;
  signal: AbortSignal;
  onUpdated: (payload: WorkspaceUpdatedPayload) => void;
  enabled?: boolean;
}): void {
  if (input.enabled === false) return;
  let attempt = 0;
  const run = async () => {
    while (!input.signal.aborted) {
      try {
        await subscribeWorkspaceEvents({
          client: input.client,
          signal: input.signal,
          onUpdated: input.onUpdated,
        });
        attempt = 0;
      } catch {
        if (input.signal.aborted) return;
        attempt += 1;
        const delay = Math.min(8_000, 500 * 2 ** Math.min(attempt, 4));
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, delay);
          input.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }
    }
  };
  void run();
}
