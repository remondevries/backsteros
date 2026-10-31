import type { ProjectChannel, ProjectChannelStatus } from "@backsteros/contracts";

import type { CodebaseRequestJson } from "./codebase-request-json.js";

/** Subset of project fields returned / patched by Channel Connect. */
export type ProjectChannelConnectResult = {
  id: string;
  channel?: ProjectChannel | string | null;
  channelStatus?: ProjectChannelStatus | string | null;
  channelPendingLink?: string | null;
  channelRequestedAt?: string | null;
  updatedAt?: string;
  channelConnectWarning?: string;
};

/**
 * POST …/channel/connect — same mutation the project page Channel Connect
 * button uses. Callers own optimistic UI + applying the returned project.
 */
export async function startProjectChannelConnect(
  requestJson: CodebaseRequestJson,
  projectId: string,
): Promise<ProjectChannelConnectResult> {
  return requestJson<ProjectChannelConnectResult>(
    `/api/v1/projects/${encodeURIComponent(projectId)}/channel/connect`,
    { method: "POST" },
  );
}

/**
 * Set Lead agent, then start Channel Connect (slash picker Create flow).
 */
export async function assignLeadAndStartProjectChannelConnect(
  requestJson: CodebaseRequestJson,
  input: { projectId: string; leadAgentContactId: string },
): Promise<ProjectChannelConnectResult> {
  const leadAgentContactId = input.leadAgentContactId.trim();
  await requestJson(`/api/v1/projects/${encodeURIComponent(input.projectId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ leadAgentContactId }),
  });
  return startProjectChannelConnect(requestJson, input.projectId);
}
