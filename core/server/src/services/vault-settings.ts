import {
  assertVaultPathUsable,
  getVaultPathCache,
  isStorageConfigured,
  setVaultPathCache,
} from "../lib/storage.js";
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
  const vaultPath = readVaultPathFromSettings(settings);
  if (vaultPath) {
    setVaultPathCache(vaultPath);
  } else if (!getVaultPathCache() && process.env.BACKSTEROS_VAULT_PATH?.trim()) {
    setVaultPathCache(process.env.BACKSTEROS_VAULT_PATH.trim());
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
  const vaultPath =
    readVaultPathFromSettings(settings) ||
    getVaultPathCache() ||
    process.env.BACKSTEROS_VAULT_PATH?.trim() ||
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
  return getVaultStorageSettings(workspaceId);
}
