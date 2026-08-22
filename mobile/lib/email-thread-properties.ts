import type {
  AgentMailMessage,
  AgentMailMessageDetail,
} from "@backsteros/contracts";

import { formatEmailDisplayId } from "./email-display-id";
import type { EmailListItem } from "./email-list";
import { migrateLegacyTaskStatus, type TaskStatus } from "./task-status";

export type ResolvedEmailThreadProperties = {
  status: TaskStatus;
  priority: number;
  dueDate: string | null;
  organizationId: string | null;
  organizationName: string | null;
  contactId: string | null;
  contactName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  projectId: string | null;
  projectName: string | null;
  projectKey: string | null;
  number: number | null;
  displayId: string | null;
};

type PropertySource = {
  status?: string | null;
  priority?: number | null;
  dueDate?: string | null;
  organizationId?: string | null;
  organizationName?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  assigneeId?: string | null;
  assigneeName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  projectKey?: string | null;
  number?: number | null;
  displayId?: string | null;
};

function asTaskStatus(value: string | null | undefined): TaskStatus {
  if (!value) return "triage";
  return migrateLegacyTaskStatus(value) as TaskStatus;
}

function pick<T>(
  ...values: readonly (T | null | undefined)[]
): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function mergeSources(
  ...sources: readonly (PropertySource | null | undefined)[]
): ResolvedEmailThreadProperties {
  const fields = sources.filter(
    (source): source is PropertySource => source != null,
  );
  const number =
    pick(...fields.map((source) => source.number)) ?? null;
  const displayId =
    pick(...fields.map((source) => source.displayId)) ??
    (number != null ? formatEmailDisplayId(number) : null);
  return {
    status: asTaskStatus(pick(...fields.map((source) => source.status)) ?? "triage"),
    priority: pick(...fields.map((source) => source.priority)) ?? 0,
    dueDate: pick(...fields.map((source) => source.dueDate)),
    organizationId: pick(...fields.map((source) => source.organizationId)),
    organizationName: pick(...fields.map((source) => source.organizationName)),
    contactId: pick(...fields.map((source) => source.contactId)),
    contactName: pick(...fields.map((source) => source.contactName)),
    assigneeId: pick(...fields.map((source) => source.assigneeId)),
    assigneeName: pick(...fields.map((source) => source.assigneeName)),
    projectId: pick(...fields.map((source) => source.projectId)),
    projectName: pick(...fields.map((source) => source.projectName)),
    projectKey: pick(...fields.map((source) => source.projectKey)),
    number,
    displayId,
  };
}

/** List rows expose metadata on the message object (REST list enrichment). */
export function resolveEmailThreadPropertiesFromListItem(
  item: EmailListItem | AgentMailMessage | null | undefined,
): ResolvedEmailThreadProperties {
  return mergeSources(item ?? undefined);
}

/**
 * Detail responses store workspace metadata on `threadMetadata` (desktop parity).
 * Top-level fields are kept as a fallback for older payloads / list merges.
 */
export function resolveEmailThreadPropertiesFromDetail(
  detail: AgentMailMessageDetail | null | undefined,
  listItem?: EmailListItem | AgentMailMessage | null,
): ResolvedEmailThreadProperties {
  return mergeSources(listItem ?? undefined, detail?.threadMetadata, detail);
}
