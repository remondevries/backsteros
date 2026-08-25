import {
  assertVaultPathUsable,
  envVaultPath,
  getVaultPathCache,
  isStorageConfigured,
  setVaultPathCache,
} from "../lib/storage.js";
import { isCloudReplicationRole } from "./core-replication/config.js";
import * as circleService from "./circle-domain.js";

export type VaultStorageSettings = {
  configured: boolean;
  provider: "local-vault";
  vaultPath: string | null;
};

function readVaultPathFromSettings(
  settings: Record<string, unknown>,
): string | null {
  const value = settings.vaultPath;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

let warmedForWorkspaceId: string | null = null;

export async function warmVaultPathCache(workspaceId: string): Promise<void> {
  if (warmedForWorkspaceId === workspaceId && isStorageConfigured()) {
    return;
  }
  const settings = (await circleService.getSettings(
    workspaceId,
  )) as Record<string, unknown>;
  const settingsVaultPath = readVaultPathFromSettings(settings);
  const envPath = envVaultPath();
  if (isCloudReplicationRole() && envPath) {
    // Replicated desktop vaultPath must not replace the Docker volume mount.
    setVaultPathCache(envPath);
  } else if (settingsVaultPath) {
    setVaultPathCache(settingsVaultPath);
  } else if (!getVaultPathCache() && envPath) {
    setVaultPathCache(envPath);
  }
  warmedForWorkspaceId = workspaceId;
}

export async function getVaultStorageSettings(
  workspaceId: string,
): Promise<VaultStorageSettings> {
  await warmVaultPathCache(workspaceId);
  const settings = (await circleService.getSettings(
    workspaceId,
  )) as Record<string, unknown>;
  const settingsVaultPath = readVaultPathFromSettings(settings);
  const envPath = envVaultPath();
  const vaultPath =
    (isCloudReplicationRole() && envPath ? envPath : null) ||
    settingsVaultPath ||
    getVaultPathCache() ||
    envPath ||
    null;
  return {
    configured: Boolean(vaultPath),
    provider: "local-vault",
    vaultPath,
  };
}

export async function updateVaultStorageSettings(
  workspaceId: string,
  vaultPath: string,
): Promise<VaultStorageSettings> {
  const trimmed = vaultPath.trim();
  if (!trimmed) {
    throw new Error("VAULT_PATH_REQUIRED");
  }
  await assertVaultPathUsable(trimmed);
  setVaultPathCache(trimmed);
  warmedForWorkspaceId = workspaceId;
  await circleService.updateSettings(workspaceId, { vaultPath: trimmed });
  // Backfill project folders + .cursor skills for every existing project.
  try {
    const { ensureAllProjectVaultWorkspaces } = await import(
      "./project-vault.js"
    );
    await ensureAllProjectVaultWorkspaces(workspaceId);
  } catch {
    // Vault path is still saved even if a project folder fails.
  }
  return getVaultStorageSettings(workspaceId);
}
