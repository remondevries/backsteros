import { eq } from "drizzle-orm";

import type {
  CursorSettings,
  UpdateCursorSettingsInput,
} from "@backsteros/contracts";

import {
  normalizeResearchInstructions,
  normalizeSpellcheckInstructions,
} from "../lib/spellcheck-parse.js";
import { db } from "../db/index.js";
import { workspaceIntegrationSecrets } from "../db/schema.js";
import * as circleService from "./circle-domain.js";

const DEFAULT_MODEL = "auto";

const CURSOR_SECRET_KEYS = new Set([
  "apiKey",
  "api_key",
  "cursorApiKey",
  "cursor_api_key",
]);

/** Strip accidental Cursor secrets from synced workspace settings JSON. */
export function sanitizeWorkspaceSettings(
  settings: Record<string, unknown>,
): Record<string, unknown> {
  const raw = settings.cursor;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return settings;
  }
  const cursor = { ...(raw as Record<string, unknown>) };
  let changed = false;
  for (const key of Object.keys(cursor)) {
    if (CURSOR_SECRET_KEYS.has(key)) {
      delete cursor[key];
      changed = true;
    }
  }
  return changed ? { ...settings, cursor } : settings;
}

type CursorPrefs = {
  spellcheckEnabled: boolean;
  spellcheckModel: string;
  spellcheckInstructions: string;
  researchEnabled: boolean;
  researchModel: string;
  researchInstructions: string;
};

function readModel(
  cursor: Record<string, unknown>,
  key: "spellcheckModel" | "researchModel",
): string {
  const value = cursor[key];
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_MODEL;
}

function readCursorPrefs(settings: Record<string, unknown>): CursorPrefs {
  const raw = settings.cursor;
  const cursor =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const customSpellcheck =
    typeof cursor.spellcheckInstructions === "string"
      ? cursor.spellcheckInstructions.trim()
      : "";
  const customResearch =
    typeof cursor.researchInstructions === "string"
      ? cursor.researchInstructions.trim()
      : "";
  return {
    spellcheckEnabled: cursor.spellcheckEnabled === true,
    spellcheckModel: readModel(cursor, "spellcheckModel"),
    spellcheckInstructions: normalizeSpellcheckInstructions(customSpellcheck),
    researchEnabled: cursor.researchEnabled === true,
    researchModel: readModel(cursor, "researchModel"),
    researchInstructions: normalizeResearchInstructions(customResearch),
  };
}

function readStoredInstruction(
  cursor: Record<string, unknown>,
  key: "spellcheckInstructions" | "researchInstructions",
): string | undefined {
  return typeof cursor[key] === "string" ? (cursor[key] as string) : undefined;
}

function applyInstructionPatch(
  current: string | undefined,
  patch: string | undefined,
): string | undefined {
  if (patch === undefined) return current;
  const trimmed = patch.trim();
  // Empty string clears custom instructions → built-in default.
  return trimmed.length > 0 ? trimmed : undefined;
}

export function previewCursorApiKey(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length <= 12) return "••••";
  return `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
}

export async function getCursorApiKey(
  workspaceId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ cursorApiKey: workspaceIntegrationSecrets.cursorApiKey })
    .from(workspaceIntegrationSecrets)
    .where(eq(workspaceIntegrationSecrets.workspaceId, workspaceId))
    .limit(1);
  const key = row?.cursorApiKey?.trim();
  return key || null;
}

export async function getCursorSettings(
  workspaceId: string,
): Promise<CursorSettings> {
  const [settings, apiKey] = await Promise.all([
    circleService.getSettings(workspaceId),
    getCursorApiKey(workspaceId),
  ]);
  const prefs = readCursorPrefs(settings as Record<string, unknown>);
  return {
    apiKeyConfigured: Boolean(apiKey),
    apiKeyPreview: apiKey ? previewCursorApiKey(apiKey) : null,
    spellcheckEnabled: prefs.spellcheckEnabled,
    spellcheckModel: prefs.spellcheckModel,
    spellcheckInstructions: prefs.spellcheckInstructions,
    researchEnabled: prefs.researchEnabled,
    researchModel: prefs.researchModel,
    researchInstructions: prefs.researchInstructions,
  };
}

export async function updateCursorSettings(
  workspaceId: string,
  patch: UpdateCursorSettingsInput,
): Promise<CursorSettings> {
  if (patch.apiKey !== undefined) {
    const nextKey = patch.apiKey.trim();
    await db
      .insert(workspaceIntegrationSecrets)
      .values({
        workspaceId,
        cursorApiKey: nextKey.length > 0 ? nextKey : null,
      })
      .onConflictDoUpdate({
        target: workspaceIntegrationSecrets.workspaceId,
        set: {
          cursorApiKey: nextKey.length > 0 ? nextKey : null,
          updatedAt: new Date(),
        },
      });
  }

  const touchesPrefs =
    patch.spellcheckEnabled !== undefined ||
    patch.spellcheckModel !== undefined ||
    patch.spellcheckInstructions !== undefined ||
    patch.researchEnabled !== undefined ||
    patch.researchModel !== undefined ||
    patch.researchInstructions !== undefined;

  if (touchesPrefs) {
    const current = (await circleService.getSettings(
      workspaceId,
    )) as Record<string, unknown>;
    const prefs = readCursorPrefs(current);
    const rawCursor =
      current.cursor &&
      typeof current.cursor === "object" &&
      !Array.isArray(current.cursor)
        ? { ...(current.cursor as Record<string, unknown>) }
        : {};

    const nextSpellcheckInstructions = applyInstructionPatch(
      readStoredInstruction(rawCursor, "spellcheckInstructions"),
      patch.spellcheckInstructions,
    );
    const nextResearchInstructions = applyInstructionPatch(
      readStoredInstruction(rawCursor, "researchInstructions"),
      patch.researchInstructions,
    );

    const nextCursor: Record<string, unknown> = {
      ...rawCursor,
      spellcheckEnabled:
        patch.spellcheckEnabled !== undefined
          ? patch.spellcheckEnabled
          : prefs.spellcheckEnabled,
      spellcheckModel:
        patch.spellcheckModel !== undefined
          ? patch.spellcheckModel.trim() || DEFAULT_MODEL
          : prefs.spellcheckModel,
      researchEnabled:
        patch.researchEnabled !== undefined
          ? patch.researchEnabled
          : prefs.researchEnabled,
      researchModel:
        patch.researchModel !== undefined
          ? patch.researchModel.trim() || DEFAULT_MODEL
          : prefs.researchModel,
    };

    delete nextCursor.spellcheckInstructions;
    delete nextCursor.researchInstructions;
    if (nextSpellcheckInstructions !== undefined) {
      nextCursor.spellcheckInstructions = nextSpellcheckInstructions;
    }
    if (nextResearchInstructions !== undefined) {
      nextCursor.researchInstructions = nextResearchInstructions;
    }

    await circleService.updateSettings(workspaceId, { cursor: nextCursor });
  }

  return getCursorSettings(workspaceId);
}

export async function getCursorSpellcheckConfig(workspaceId: string): Promise<{
  apiKey: string | null;
  spellcheckEnabled: boolean;
  spellcheckModel: string;
  spellcheckInstructions: string;
}> {
  const [settings, apiKey] = await Promise.all([
    circleService.getSettings(workspaceId),
    getCursorApiKey(workspaceId),
  ]);
  const prefs = readCursorPrefs(settings as Record<string, unknown>);
  return {
    apiKey,
    spellcheckEnabled: prefs.spellcheckEnabled,
    spellcheckModel: prefs.spellcheckModel,
    spellcheckInstructions: prefs.spellcheckInstructions,
  };
}

export async function getCursorResearchConfig(workspaceId: string): Promise<{
  apiKey: string | null;
  researchEnabled: boolean;
  researchModel: string;
  researchInstructions: string;
}> {
  const [settings, apiKey] = await Promise.all([
    circleService.getSettings(workspaceId),
    getCursorApiKey(workspaceId),
  ]);
  const prefs = readCursorPrefs(settings as Record<string, unknown>);
  return {
    apiKey,
    researchEnabled: prefs.researchEnabled,
    researchModel: prefs.researchModel,
    researchInstructions: prefs.researchInstructions,
  };
}
