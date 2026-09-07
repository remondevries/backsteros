import { eq } from "drizzle-orm";

import type {
  GithubSettings,
  GithubTestConnectionResult,
  UpdateGithubSettingsInput,
} from "@backsteros/contracts";

import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import { previewCursorApiKey } from "./cursor-settings.js";
import { getConfiguredGithubApiToken } from "./github-auth.js";

export function previewGithubApiToken(token: string): string {
  return previewCursorApiKey(token);
}

async function getSecretRow(
  workspaceId: string,
): Promise<{ githubApiToken: string | null } | null> {
  const [row] = await db
    .select({
      githubApiToken: workspaceIntegrationSecrets.githubApiToken,
    })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

/** Workspace-stored PAT (Settings → GitHub). */
export async function getWorkspaceGithubApiToken(
  workspaceId: string,
): Promise<string | null> {
  const row = await getSecretRow(workspaceId);
  const token = row?.githubApiToken?.trim();
  return token || null;
}

/** Workspace PAT, then `GITHUB_API_TOKEN` env fallback. */
export async function getWorkspaceOrEnvGithubToken(
  workspaceId: string,
): Promise<string | null> {
  const fromWorkspace = await getWorkspaceGithubApiToken(workspaceId);
  if (fromWorkspace) return fromWorkspace;
  return getConfiguredGithubApiToken();
}

export async function getGithubSettings(
  workspaceId: string,
): Promise<GithubSettings> {
  const apiToken = await getWorkspaceGithubApiToken(workspaceId);
  const envTokenConfigured = getConfiguredGithubApiToken() != null;
  return {
    apiTokenConfigured: Boolean(apiToken),
    apiTokenPreview: apiToken ? previewGithubApiToken(apiToken) : null,
    connected: Boolean(apiToken) || envTokenConfigured,
    envTokenConfigured,
  };
}

export async function updateGithubSettings(
  workspaceId: string,
  patch: UpdateGithubSettingsInput,
): Promise<GithubSettings> {
  const current = await getWorkspaceGithubApiToken(workspaceId);
  let nextToken = current;

  if (patch.apiToken !== undefined) {
    const trimmed = patch.apiToken.trim();
    nextToken = trimmed.length > 0 ? trimmed : null;
  }

  await db
    .insert(workspaceIntegrationSecrets)
    .values({
      workspaceId,
      githubApiToken: nextToken,
    })
    .onConflictDoUpdate({
      target: workspaceIntegrationSecrets.workspaceId,
      set: {
        githubApiToken: nextToken,
        updatedAt: new Date(),
      },
    });

  return getGithubSettings(workspaceId);
}

export async function testGithubConnection(
  workspaceId: string,
): Promise<GithubTestConnectionResult> {
  const token = await getWorkspaceOrEnvGithubToken(workspaceId);
  if (!token) {
    return {
      ok: false,
      error:
        "GitHub API token is not configured. Paste a PAT in Settings → GitHub.",
      login: null,
    };
  }

  try {
    const { getGithubConnectionStatus } = await import("./github.js");
    const status = await getGithubConnectionStatus(token);
    if (!status.connected) {
      return {
        ok: false,
        error: status.reason ?? "GitHub connection test failed.",
        login: status.login,
      };
    }
    return {
      ok: true,
      error: null,
      login: status.login,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "GitHub connection test failed.",
      login: null,
    };
  }
}
