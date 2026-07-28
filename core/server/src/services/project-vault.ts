import { and, eq, isNull } from "drizzle-orm";

import { db } from "../db/index.js";
import { projects } from "../db/schema.js";
import {
  ensureProjectVaultFolders,
  isStorageConfigured,
} from "../lib/storage.js";
import { warmVaultPathCache } from "./vault-settings.js";
import * as taskProjectService from "./tasks-projects.js";

export type ProjectVaultEnsureResult = {
  projectId: string;
  projectKey: string;
  projectVaultPath: string;
  localWorkingDirectory: string | null;
  /** True when we wrote `localWorkingDirectory` because it was empty. */
  assignedWorkingDirectory: boolean;
  createdSkill: boolean;
};

/**
 * Create (or refresh) on-disk vault folders + `.cursor` skills only.
 * Safe for read-scoped open paths — does not mutate the project row.
 */
export async function ensureProjectVaultFoldersOnly(
  workspaceId: string,
  projectId: string,
): Promise<{ projectVaultPath: string; createdSkill: boolean } | null> {
  await warmVaultPathCache(workspaceId);
  if (!isStorageConfigured()) {
    return null;
  }

  const project = await taskProjectService.getProjectById(
    workspaceId,
    projectId,
  );
  if (!project) {
    return null;
  }

  try {
    const ensured = await ensureProjectVaultFolders(project.key, undefined, {
      projectType: project.type,
    });
    return {
      projectVaultPath: ensured.projectVaultPath,
      createdSkill: ensured.createdSkill,
    };
  } catch {
    return null;
  }
}

/**
 * Create (or refresh) the on-disk vault folder for a project and seed `.cursor`
 * skills. When the project has no `localWorkingDirectory`, assign the vault
 * project root so agent chats always start inside that folder.
 */
export async function ensureProjectVaultWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<ProjectVaultEnsureResult | null> {
  await warmVaultPathCache(workspaceId);
  if (!isStorageConfigured()) {
    return null;
  }

  const project = await taskProjectService.getProjectById(
    workspaceId,
    projectId,
  );
  if (!project) {
    return null;
  }

  const ensured = await ensureProjectVaultFolders(project.key, undefined, {
    projectType: project.type,
  });
  const existingCwd = project.localWorkingDirectory?.trim() || null;
  let localWorkingDirectory = existingCwd;
  let assignedWorkingDirectory = false;

  if (!existingCwd) {
    const [row] = await db
      .update(projects)
      .set({
        localWorkingDirectory: ensured.projectVaultPath,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.id, projectId),
          isNull(projects.deletedAt),
        ),
      )
      .returning({
        localWorkingDirectory: projects.localWorkingDirectory,
      });
    localWorkingDirectory =
      row?.localWorkingDirectory?.trim() || ensured.projectVaultPath;
    assignedWorkingDirectory = true;
  }

  return {
    projectId: project.id,
    projectKey: project.key,
    projectVaultPath: ensured.projectVaultPath,
    localWorkingDirectory,
    assignedWorkingDirectory,
    createdSkill: ensured.createdSkill,
  };
}

/** Best-effort ensure used from open paths — never throws for missing vault. */
export async function tryEnsureProjectVaultWorkspace(
  workspaceId: string,
  projectId: string,
): Promise<ProjectVaultEnsureResult | null> {
  try {
    return await ensureProjectVaultWorkspace(workspaceId, projectId);
  } catch {
    return null;
  }
}

/** Ensure vault folders for every non-deleted project (e.g. after vault path set). */
export async function ensureAllProjectVaultWorkspaces(
  workspaceId: string,
): Promise<number> {
  await warmVaultPathCache(workspaceId);
  if (!isStorageConfigured()) {
    return 0;
  }

  const rows = await taskProjectService.listProjects(workspaceId);
  let count = 0;
  for (const row of rows) {
    try {
      await ensureProjectVaultWorkspace(workspaceId, row.id);
      count += 1;
    } catch {
      // Continue remaining projects if one key fails.
    }
  }
  return count;
}
