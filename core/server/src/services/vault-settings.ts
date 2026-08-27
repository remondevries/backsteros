import {
  assertVaultPathUsable,
  getVaultPathCache,
  isCloudCoreVaultHost,
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
  if (isCloudCoreVaultHost()) {
    const envPath = process.env.BACKSTEROS_VAULT_PATH?.trim();
    if (envPath) {
      setVaultPathCache(envPath);
    }
    // Scrub any leftover Mac path that landed in cloud settings.
    try {
      await scrubCloudMachineLocalSettings(workspaceId);
    } catch {
      // Non-fatal — env vault still works.
    }
    warmedForWorkspaceId = workspaceId;
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
  if (isCloudCoreVaultHost()) {
    const vaultPath =
      process.env.BACKSTEROS_VAULT_PATH?.trim() || getVaultPathCache() || null;
    return {
      configured: Boolean(vaultPath),
      provider: "local-vault",
      vaultPath,
    };
  }
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
  if (isCloudCoreVaultHost()) {
    throw new Error("VAULT_PATH_CLOUD_FORBIDDEN");
  }
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

/** Strip leftover Mac vaultPath from cloud workspace_settings rows. */
export async function scrubCloudMachineLocalSettings(
  workspaceId: string,
): Promise<boolean> {
  if (!isCloudCoreVaultHost()) return false;
  const settings = (await circleService.getSettings(
    workspaceId,
  )) as Record<string, unknown>;
  if (!("vaultPath" in settings)) return false;
  const next = { ...settings };
  delete next.vaultPath;
  await circleService.replaceSettings(workspaceId, next);
  return true;
}
