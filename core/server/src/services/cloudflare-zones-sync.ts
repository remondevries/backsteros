import type { UpdateProjectInput } from "@backsteros/contracts";

import {
  CloudflareApiError,
  CloudflareClient,
} from "../lib/cloudflare-client.js";
import { getWorkspaceOrEnvCloudflareToken } from "./cloudflare-settings.js";
import {
  buildProjectRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "./rest-leader-write.js";
import { recordProjectRestSyncEvent } from "./sync.js";
import * as taskProjectService from "./tasks-projects.js";

export type CloudflareZoneMatchResult = {
  fetched: number;
  matched: number;
  updated: number;
  unchanged: number;
  unmatchedProjects: number;
  unmatchedZones: number;
  domains: Array<{
    name: string;
    projectId: string | null;
    zoneId: string | null;
    action: "matched" | "updated" | "unchanged" | "unmatched_project" | "unmatched_zone";
  }>;
};

async function patchProject(
  workspaceId: string,
  projectId: string,
  patch: UpdateProjectInput,
): Promise<{ id: string } | null> {
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
    return row ? { id: row.id } : null;
  }

  const row = await taskProjectService.updateProject(
    workspaceId,
    projectId,
    patch,
  );
  if (!row) return null;
  await recordProjectRestSyncEvent(workspaceId, row, "upsert");
  return { id: row.id };
}

/**
 * Match Catalog Domains (`domeinname`) to Cloudflare zones by hostname and
 * store each zone id on the project.
 */
export async function matchCloudflareZones(
  workspaceId: string,
  options?: {
    apiToken?: string | null;
  },
): Promise<CloudflareZoneMatchResult> {
  const apiToken =
    options?.apiToken?.trim() ||
    (await getWorkspaceOrEnvCloudflareToken(workspaceId));
  if (!apiToken) {
    throw new CloudflareApiError(
      400,
      "cloudflare_token_missing",
      "Cloudflare API token is not configured. Paste a token in Settings → Integrations → Cloudflare (or set CLOUDFLARE_API_TOKEN).",
    );
  }

  const client = new CloudflareClient({ apiToken });
  const zones = await client.listZones();
  const zonesByName = new Map(
    zones.map((zone) => [zone.name.trim().toLowerCase(), zone] as const),
  );

  const domainProjects = await taskProjectService.listProjects(workspaceId, {
    type: "domeinname",
  });
  const projectsByName = new Map(
    domainProjects.map(
      (project) => [project.name.trim().toLowerCase(), project] as const,
    ),
  );

  const domains: CloudflareZoneMatchResult["domains"] = [];
  let matched = 0;
  let updated = 0;
  let unchanged = 0;
  let unmatchedProjects = 0;

  for (const project of domainProjects) {
    const nameKey = project.name.trim().toLowerCase();
    const zone = zonesByName.get(nameKey);
    if (!zone) {
      unmatchedProjects += 1;
      domains.push({
        name: project.name,
        projectId: project.id,
        zoneId: project.cloudflareZoneId ?? null,
        action: "unmatched_project",
      });
      continue;
    }

    matched += 1;
    if (project.cloudflareZoneId === zone.id) {
      unchanged += 1;
      domains.push({
        name: project.name,
        projectId: project.id,
        zoneId: zone.id,
        action: "unchanged",
      });
      continue;
    }

    const patched = await patchProject(workspaceId, project.id, {
      cloudflareZoneId: zone.id,
    });
    if (patched) {
      updated += 1;
      domains.push({
        name: project.name,
        projectId: project.id,
        zoneId: zone.id,
        action: "updated",
      });
    } else {
      unmatchedProjects += 1;
      domains.push({
        name: project.name,
        projectId: project.id,
        zoneId: null,
        action: "unmatched_project",
      });
    }
  }

  let unmatchedZones = 0;
  for (const zone of zones) {
    const nameKey = zone.name.trim().toLowerCase();
    if (!projectsByName.has(nameKey)) {
      unmatchedZones += 1;
      domains.push({
        name: zone.name,
        projectId: null,
        zoneId: zone.id,
        action: "unmatched_zone",
      });
    }
  }

  return {
    fetched: zones.length,
    matched,
    updated,
    unchanged,
    unmatchedProjects,
    unmatchedZones,
    domains,
  };
}

/**
 * Ensure a domain project has `cloudflareZoneId` set by matching its hostname
 * to Cloudflare. Used when cloud lags local after a zone match.
 */
export async function ensureProjectCloudflareZone(
  workspaceId: string,
  projectId: string,
  options?: { apiToken?: string | null },
): Promise<{
  projectId: string;
  name: string;
  zoneId: string | null;
  action: "unchanged" | "updated" | "unmatched";
}> {
  const project = await taskProjectService.getProjectById(workspaceId, projectId);
  if (!project) {
    throw new CloudflareApiError(404, "not_found", "Project not found");
  }

  const existing = project.cloudflareZoneId?.trim() || null;
  if (existing) {
    return {
      projectId: project.id,
      name: project.name,
      zoneId: existing,
      action: "unchanged",
    };
  }

  const apiToken =
    options?.apiToken?.trim() ||
    (await getWorkspaceOrEnvCloudflareToken(workspaceId));
  if (!apiToken) {
    throw new CloudflareApiError(
      400,
      "cloudflare_token_missing",
      "Cloudflare API token is not configured. Paste a token in Settings → Integrations → Cloudflare (or set CLOUDFLARE_API_TOKEN).",
    );
  }

  const client = new CloudflareClient({ apiToken });
  const zones = await client.listZones();
  const nameKey = project.name.trim().toLowerCase();
  const zone = zones.find((entry) => entry.name.trim().toLowerCase() === nameKey);
  if (!zone) {
    return {
      projectId: project.id,
      name: project.name,
      zoneId: null,
      action: "unmatched",
    };
  }

  const patched = await patchProject(workspaceId, project.id, {
    cloudflareZoneId: zone.id,
  });
  if (!patched) {
    return {
      projectId: project.id,
      name: project.name,
      zoneId: null,
      action: "unmatched",
    };
  }

  return {
    projectId: project.id,
    name: project.name,
    zoneId: zone.id,
    action: "updated",
  };
}

export { CloudflareApiError };
