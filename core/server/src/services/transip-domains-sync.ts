import type { CreateProjectInput, UpdateProjectInput } from "@backsteros/contracts";

import { newId } from "../lib/crypto.js";
import {
  allocateUniqueProjectKey,
  preferredProjectKeyFromDomain,
} from "../lib/project-key.js";
import {
  TransipApiError,
  TransipClient,
  buildDomainProjectSummary,
  type TransipDomain,
} from "../lib/transip-client.js";
import { getWorkspaceOrEnvTransipToken } from "./transip-settings.js";
import {
  buildProjectRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "./rest-leader-write.js";
import { recordProjectRestSyncEvent } from "./sync.js";
import * as taskProjectService from "./tasks-projects.js";

export type TransipDomainSyncCreated = {
  id: string;
  key: string;
  name: string;
};

export type TransipDomainSyncResult = {
  fetched: number;
  created: number;
  skipped: number;
  /** Existing projects whose type was corrected to `domeinname`. */
  healed: number;
  createdProjects: TransipDomainSyncCreated[];
  healedProjectIds: string[];
  domains: Array<{
    name: string;
    status: string | null;
    renewalDate: string | null;
    action: "created" | "skipped" | "healed";
  }>;
};

export { buildDomainProjectSummary };

function shouldImportDomain(domain: TransipDomain): boolean {
  const status = domain.status?.toLowerCase() ?? "";
  // Skip clearly gone/cancelled names; import registered + unknown statuses.
  if (
    status === "cancelled" ||
    status === "canceled" ||
    status === "gone" ||
    status === "expired"
  ) {
    return false;
  }
  return true;
}

async function createDomainProject(
  workspaceId: string,
  input: CreateProjectInput,
  projectId: string,
): Promise<{ id: string; key: string; name: string }> {
  if (isRestLeaderFirstWrite()) {
    await commitRestEntityWrite({
      workspaceId,
      entity: "project",
      entityId: projectId,
      operation: "upsert",
      payload: buildProjectRestPayload(
        projectId,
        input as unknown as Record<string, unknown>,
      ),
    });
    const row = await taskProjectService.getProjectById(workspaceId, projectId);
    if (!row) {
      throw new Error("PROJECT_CREATE_FAILED");
    }
    return { id: row.id, key: row.key, name: row.name };
  }

  const row = await taskProjectService.createProject(
    workspaceId,
    input,
    projectId,
  );
  await recordProjectRestSyncEvent(workspaceId, row, "upsert");
  return { id: row.id, key: row.key, name: row.name };
}

async function patchDomainProject(
  workspaceId: string,
  projectId: string,
  patch: UpdateProjectInput,
): Promise<{ id: string; key: string; name: string } | null> {
  if (isRestLeaderFirstWrite()) {
    await commitRestEntityWrite({
      workspaceId,
      entity: "project",
      entityId: projectId,
      operation: "patch",
      payload: buildProjectRestPayload(
        projectId,
        patch as unknown as Record<string, unknown>,
      ),
    });
    const row = await taskProjectService.getProjectById(workspaceId, projectId);
    return row ? { id: row.id, key: row.key, name: row.name } : null;
  }

  const row = await taskProjectService.updateProject(
    workspaceId,
    projectId,
    patch,
  );
  if (!row) return null;
  await recordProjectRestSyncEvent(workspaceId, row, "upsert");
  return { id: row.id, key: row.key, name: row.name };
}

export async function syncTransipDomains(
  workspaceId: string,
  options?: {
    accessToken?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<TransipDomainSyncResult> {
  const accessToken =
    options?.accessToken?.trim() ||
    (await getWorkspaceOrEnvTransipToken(workspaceId));
  if (!accessToken) {
    throw new TransipApiError(
      400,
      "transip_token_missing",
      "TransIP access token is not configured. Paste a token in Settings → TransIP (or set TRANSIP_ACCESS_TOKEN).",
    );
  }

  const client = new TransipClient({
    accessToken,
    fetchImpl: options?.fetchImpl,
  });
  const remote = await client.listDomains();
  const importable = remote.filter(shouldImportDomain);

  const allProjects = await taskProjectService.listProjects(workspaceId);
  // Match by name across all types — older syncs may have stored domains as
  // `general` when leader-first create omitted `type`.
  const existingByName = new Map(
    allProjects.map((project) => [
      project.name.trim().toLowerCase(),
      project,
    ] as const),
  );

  const usedKeys = allProjects.map((project) => project.key);

  const createdProjects: TransipDomainSyncCreated[] = [];
  const healedProjectIds: string[] = [];
  const domains: TransipDomainSyncResult["domains"] = [];
  let skipped = 0;
  let healed = 0;

  for (const domain of importable) {
    const nameKey = domain.name.trim().toLowerCase();
    const existing = existingByName.get(nameKey);
    if (existing) {
      const needsType = existing.type !== "domeinname";
      const needsProvider = existing.provider !== "transip";
      const iconValue = existing.icon?.trim() ?? "";
      const needsIcon =
        !iconValue || iconValue === "default" || needsProvider;
      if (needsType || needsProvider || needsIcon) {
        const updated = await patchDomainProject(workspaceId, existing.id, {
          ...(needsType ? { type: "domeinname" as const } : {}),
          ...(needsProvider ? { provider: "transip" as const } : {}),
          ...(needsIcon ? { icon: "transip" } : {}),
          summary: buildDomainProjectSummary(domain),
        });
        if (updated) {
          healed += 1;
          healedProjectIds.push(updated.id);
          existing.type = "domeinname";
          existing.provider = "transip";
          existing.icon = needsIcon ? "transip" : existing.icon;
          domains.push({
            name: domain.name,
            status: domain.status,
            renewalDate: domain.renewalDate,
            action: "healed",
          });
          continue;
        }
      }
      skipped += 1;
      domains.push({
        name: domain.name,
        status: domain.status,
        renewalDate: domain.renewalDate,
        action: "skipped",
      });
      continue;
    }

    const preferred = preferredProjectKeyFromDomain(domain.name);
    const key = allocateUniqueProjectKey(preferred, usedKeys);
    usedKeys.push(key);

    const projectId = newId();
    const input: CreateProjectInput = {
      key,
      name: domain.name,
      summary: buildDomainProjectSummary(domain),
      type: "domeinname",
      provider: "transip",
      icon: "transip",
      status: "backlog",
      sortOrder: -Date.now(),
    };

    const created = await createDomainProject(workspaceId, input, projectId);
    createdProjects.push(created);
    existingByName.set(nameKey, {
      id: created.id,
      key: created.key,
      name: created.name,
      type: "domeinname",
      provider: "transip",
      icon: "transip",
    } as (typeof allProjects)[number]);
    domains.push({
      name: domain.name,
      status: domain.status,
      renewalDate: domain.renewalDate,
      action: "created",
    });
  }

  return {
    fetched: remote.length,
    created: createdProjects.length,
    skipped,
    healed,
    createdProjects,
    healedProjectIds,
    domains,
  };
}

export { TransipApiError };
