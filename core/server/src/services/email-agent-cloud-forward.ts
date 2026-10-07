/**
 * Local-core → cloud-core forward for Grok email-agent wakes (OS-100).
 *
 * email_agent_callbacks is cloud-only (not replicated). The public door is
 * agent.backsteros.com → cloud-core, so local must not mint callbacks or wake
 * Judith itself when hybrid peer config is present.
 */
import type {
  EmailAgentCallbackPoll,
  EmailAgentDraftStarted,
} from "@backsteros/contracts";

import { getCoreReplicationConfig } from "./core-replication/config.js";

const FORWARD_TIMEOUT_MS = 60_000;

export function shouldForwardEmailAgentWakeToCloud(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const config = getCoreReplicationConfig(env);
  return config?.role === "local";
}

export type ForwardEmailAgentDraftInput = {
  workspaceId: string;
  inboxId: string;
  messageId: string;
  prompt: string;
  intent?: "reply_draft" | "task" | "calendar" | "note" | null;
  currentDraftBody?: string | null;
};

export class EmailAgentCloudForwardError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "EmailAgentCloudForwardError";
    this.status = status;
  }
}

async function peerFetch(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const config = getCoreReplicationConfig();
  if (!config || config.role !== "local") {
    throw new EmailAgentCloudForwardError(
      "Email agent cloud forward requires CORE_REPLICATION_ROLE=local with a peer",
      500,
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    return await fetch(`${config.peerUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.secret}`,
        Accept: "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Cloud-core email agent forward timed out"
        : error instanceof Error
          ? error.message
          : "Cloud-core email agent forward failed";
    throw new EmailAgentCloudForwardError(message, 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function forwardEmailAgentDraftToCloud(
  input: ForwardEmailAgentDraftInput,
): Promise<EmailAgentDraftStarted> {
  const response = await peerFetch(
    "/internal/core-replication/email-agent-draft",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace_id: input.workspaceId,
        inbox_id: input.inboxId,
        message_id: input.messageId,
        prompt: input.prompt,
        intent: input.intent ?? null,
        current_draft_body: input.currentDraftBody,
      }),
    },
  );

  const text = await response.text().catch(() => "");
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const err =
      body &&
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : text.slice(0, 240) || `Cloud-core rejected email agent draft (${response.status})`;
    throw new EmailAgentCloudForwardError(err, response.status >= 500 ? 502 : 400);
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("requestId" in body) ||
    typeof (body as { requestId: unknown }).requestId !== "string"
  ) {
    throw new EmailAgentCloudForwardError(
      "Cloud-core returned an invalid email agent draft response",
      502,
    );
  }

  return body as EmailAgentDraftStarted;
}

export async function forwardEmailAgentCallbackPollToCloud(
  workspaceId: string,
  requestId: string,
): Promise<EmailAgentCallbackPoll | null> {
  const path =
    `/internal/core-replication/email-agent-draft-callbacks/` +
    `${encodeURIComponent(requestId)}?workspace_id=${encodeURIComponent(workspaceId)}`;

  const response = await peerFetch(path, { method: "GET" });

  if (response.status === 404) return null;
  const text = await response.text().catch(() => "");
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    const err =
      body &&
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : text.slice(0, 240) ||
          `Cloud-core rejected email agent callback poll (${response.status})`;
    throw new EmailAgentCloudForwardError(err, response.status >= 500 ? 502 : 400);
  }

  if (!body || typeof body !== "object" || !("pending" in body)) {
    throw new EmailAgentCloudForwardError(
      "Cloud-core returned an invalid email agent callback poll",
      502,
    );
  }

  return body as EmailAgentCallbackPoll;
}
