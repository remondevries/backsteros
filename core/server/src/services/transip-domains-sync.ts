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
  buildTransipDomainProjectIcon,
  isTransipDomainCancelledLike,
  parseTransipDomainTagsFromIcon,
  projectDateToYmd,
  tagsEqual,
  transipYmdToIso,
  type TransipDomain,
  type TransipWhoisContact,
} from "../lib/transip-client.js";
import { getWorkspaceOrEnvTransipToken } from "./transip-settings.js";
import {
  buildProjectRestPayload,
  commitRestEntityWrite,
  isRestLeaderFirstWrite,
} from "./rest-leader-write.js";
import { recordProjectRestSyncEvent } from "./sync.js";
import * as taskProjectService from "./tasks-projects.js";

/** @deprecated Prefer {@link buildTransipDomainProjectIcon}. */
export const TRANSIP_DOMAIN_PROJECT_ICON = buildTransipDomainProjectIcon();

function isTransipDomainIcon(icon: string | null | undefined): boolean {
  const value = icon?.trim() ?? "";
  if (!value) return false;
  if (!value.startsWith("{")) return false;
  try {
    const parsed = JSON.parse(value) as {
      t?: unknown;
      k?: unknown;
      c?: unknown;
    };
    return (
      parsed.t === "i" &&
      parsed.k === "transip" &&
      typeof parsed.c === "string" &&
      parsed.c.toLowerCase() === "#408fce"
    );
  } catch {
    return false;
  }
}

export type TransipDomainSyncCreated = {
  id: string;
  key: string;
  name: string;
};

export type TransipDomainSyncResult = {
  fetched: number;
  created: number;
  skipped: number;
  /** Existing projects whose type/provider/dates/tags/status were corrected. */
  healed: number;
  createdProjects: TransipDomainSyncCreated[];
  healedProjectIds: string[];
  domains: Array<{
    name: string;
    status: string | null;
    registrationDate: string | null;
    renewalDate: string | null;
    action: "created" | "skipped" | "healed";
  }>;
};

export { buildDomainProjectSummary };

type ProjectRow = Awaited<
  ReturnType<typeof taskProjectService.listProjects>
>[number];

/** Group Catalog Domains by lowercase name (duplicates can exist). */
function groupDomainProjectsByName(
  projects: ProjectRow[],
): Map<string, ProjectRow[]> {
  const byName = new Map<string, ProjectRow[]>();
  for (const project of projects) {
    if (project.type !== "domeinname") continue;
    const nameKey = project.name.trim().toLowerCase();
    const list = byName.get(nameKey);
    if (list) list.push(project);
    else byName.set(nameKey, [project]);
  }
  return byName;
}

function domainProjectHealPatch(
  existing: ProjectRow,
  domain: TransipDomain,
  startDateIso: string | null,
  dueDateIso: string | null,
  cancelledLike: boolean,
  desiredIcon: string,
): UpdateProjectInput | null {
  const needsProvider = existing.provider !== "transip";
  const iconValue = existing.icon?.trim() ?? "";
  const existingTags = parseTransipDomainTagsFromIcon(iconValue);
  const needsTags = !tagsEqual(existingTags, domain.tags);
  const needsIcon =
    needsTags ||
    (!isTransipDomainIcon(iconValue) &&
      (needsProvider ||
        !iconValue ||
        iconValue === "default" ||
        iconValue === "transip"));
  const needsStartDate =
    startDateIso != null &&
    projectDateToYmd(existing.startDate) !== domain.registrationDate;
  const needsDueDate =
    dueDateIso != null &&
    projectDateToYmd(existing.dueDate) !== domain.renewalDate;
  const needsOnHold = cancelledLike && existing.status !== "on_hold";
  if (
    !needsProvider &&
    !needsIcon &&
    !needsStartDate &&
    !needsDueDate &&
    !needsOnHold
  ) {
    return null;
  }
  return {
    ...(needsProvider ? { provider: "transip" as const } : {}),
    ...(needsIcon ? { icon: desiredIcon } : {}),
    ...(needsStartDate ? { startDate: startDateIso } : {}),
    ...(needsDueDate ? { dueDate: dueDateIso } : {}),
    ...(needsOnHold ? { status: "on_hold" as const } : {}),
    summary: buildDomainProjectSummary(domain),
  };
}

function applyHealToLocalRow(
  existing: ProjectRow,
  patch: UpdateProjectInput,
  startDateIso: string | null,
  dueDateIso: string | null,
  desiredIcon: string,
): void {
  if (patch.provider) existing.provider = patch.provider;
  if (patch.icon) existing.icon = desiredIcon;
  if (patch.status) existing.status = patch.status;
  if (patch.startDate !== undefined) {
    existing.startDate = startDateIso ? new Date(startDateIso) : null;
  }
  if (patch.dueDate !== undefined) {
    existing.dueDate = dueDateIso ? new Date(dueDateIso) : null;
  }
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
      "TransIP access token is not configured. Add login + private key in Settings → TransIP (or set TRANSIP_ACCESS_TOKEN).",
    );
  }

  const client = new TransipClient({
    accessToken,
    fetchImpl: options?.fetchImpl,
  });
  const remote = await client.listDomains();

  const allProjects = await taskProjectService.listProjects(workspaceId);
  // Only match Catalog Domains. Codebase (and other) projects often share the
  // same hostname as their title — never reuse those rows for TransIP sync.
  // Heal every Domains row with that name (duplicates from earlier syncs).
  const existingByName = groupDomainProjectsByName(allProjects);

  const usedKeys = allProjects.map((project) => project.key);

  const createdProjects: TransipDomainSyncCreated[] = [];
  const healedProjectIds: string[] = [];
  const domains: TransipDomainSyncResult["domains"] = [];
  let skipped = 0;
  let healed = 0;

  for (const domain of remote) {
    const nameKey = domain.name.trim().toLowerCase();
    const startDateIso = transipYmdToIso(domain.registrationDate);
    const dueDateIso = transipYmdToIso(domain.renewalDate);
    const cancelledLike = isTransipDomainCancelledLike(domain);
    const desiredIcon = buildTransipDomainProjectIcon(domain.tags);
    const matches = existingByName.get(nameKey) ?? [];

    if (matches.length > 0) {
      let healedAny = false;
      for (const existing of matches) {
        const patch = domainProjectHealPatch(
          existing,
          domain,
          startDateIso,
          dueDateIso,
          cancelledLike,
          desiredIcon,
        );
        if (!patch) continue;
        const updated = await patchDomainProject(
          workspaceId,
          existing.id,
          patch,
        );
        if (!updated) continue;
        healedAny = true;
        healedProjectIds.push(updated.id);
        applyHealToLocalRow(
          existing,
          patch,
          startDateIso,
          dueDateIso,
          desiredIcon,
        );
      }
      if (healedAny) {
        healed += 1;
        domains.push({
          name: domain.name,
          status: domain.status,
          registrationDate: domain.registrationDate,
          renewalDate: domain.renewalDate,
          action: "healed",
        });
        continue;
      }
      skipped += 1;
      domains.push({
        name: domain.name,
        status: domain.status,
        registrationDate: domain.registrationDate,
        renewalDate: domain.renewalDate,
        action: "skipped",
      });
      continue;
    }

    // Do not create brand-new projects for fully gone names.
    if ((domain.status?.toLowerCase() ?? "") === "gone") {
      skipped += 1;
      domains.push({
        name: domain.name,
        status: domain.status,
        registrationDate: domain.registrationDate,
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
      icon: desiredIcon,
      status: cancelledLike ? "on_hold" : "backlog",
      sortOrder: -Date.now(),
      ...(startDateIso ? { startDate: startDateIso } : {}),
      ...(dueDateIso ? { dueDate: dueDateIso } : {}),
    };

    const created = await createDomainProject(workspaceId, input, projectId);
    createdProjects.push(created);
    const createdRow = {
      id: created.id,
      key: created.key,
      name: created.name,
      type: "domeinname",
      provider: "transip",
      icon: desiredIcon,
      status: cancelledLike ? "on_hold" : "backlog",
      startDate: startDateIso ? new Date(startDateIso) : null,
      dueDate: dueDateIso ? new Date(dueDateIso) : null,
    } as ProjectRow;
    const createdList = existingByName.get(nameKey);
    if (createdList) createdList.push(createdRow);
    else existingByName.set(nameKey, [createdRow]);
    domains.push({
      name: domain.name,
      status: domain.status,
      registrationDate: domain.registrationDate,
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

export async function getTransipDomainDetail(
  workspaceId: string,
  domainName: string,
  options?: {
    accessToken?: string | null;
    fetchImpl?: typeof fetch;
  },
) {
  const accessToken =
    options?.accessToken?.trim() ||
    (await getWorkspaceOrEnvTransipToken(workspaceId));
  if (!accessToken) {
    throw new TransipApiError(
      400,
      "transip_token_missing",
      "TransIP access token is not configured. Add login + private key in Settings → TransIP (or set TRANSIP_ACCESS_TOKEN).",
    );
  }
  const client = new TransipClient({
    accessToken,
    fetchImpl: options?.fetchImpl,
  });
  return client.getDomainDetail(domainName);
}

export async function updateTransipDomainTags(
  workspaceId: string,
  domainName: string,
  tags: string[],
  options?: {
    accessToken?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<{ tags: string[]; projectId: string | null }> {
  const accessToken =
    options?.accessToken?.trim() ||
    (await getWorkspaceOrEnvTransipToken(workspaceId));
  if (!accessToken) {
    throw new TransipApiError(
      400,
      "transip_token_missing",
      "TransIP access token is not configured. Add login + private key in Settings → TransIP (or set TRANSIP_ACCESS_TOKEN).",
    );
  }
  const client = new TransipClient({
    accessToken,
    fetchImpl: options?.fetchImpl,
  });
  const nextTags = await client.updateDomainTags(domainName, tags);
  const nameKey = domainName.trim().toLowerCase();
  const allProjects = await taskProjectService.listProjects(workspaceId);
  const matches = allProjects.filter(
    (project) =>
      project.type === "domeinname" &&
      project.name.trim().toLowerCase() === nameKey,
  );
  if (matches.length === 0) {
    return { tags: nextTags, projectId: null };
  }
  const desiredIcon = buildTransipDomainProjectIcon(nextTags);
  let lastProjectId: string | null = null;
  for (const existing of matches) {
    const updated = await patchDomainProject(workspaceId, existing.id, {
      icon: desiredIcon,
    });
    lastProjectId = updated?.id ?? existing.id;
  }
  return { tags: nextTags, projectId: lastProjectId };
}

export async function updateTransipDomainContacts(
  workspaceId: string,
  domainName: string,
  contacts: TransipWhoisContact[],
  options?: {
    accessToken?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<{ contacts: TransipWhoisContact[] }> {
  const accessToken =
    options?.accessToken?.trim() ||
    (await getWorkspaceOrEnvTransipToken(workspaceId));
  if (!accessToken) {
    throw new TransipApiError(
      400,
      "transip_token_missing",
      "TransIP access token is not configured. Add login + private key in Settings → TransIP (or set TRANSIP_ACCESS_TOKEN).",
    );
  }
  const client = new TransipClient({
    accessToken,
    fetchImpl: options?.fetchImpl,
  });
  const nextContacts = await client.updateDomainContacts(domainName, contacts);
  return { contacts: nextContacts };
}

export { TransipApiError };
