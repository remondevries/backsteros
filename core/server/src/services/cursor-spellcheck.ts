import { tmpdir } from "node:os";

import { Agent, Cursor } from "@cursor/sdk";

import type {
  ResearchResponse,
  SpellcheckResponse,
} from "@backsteros/contracts";

import {
  cursorModelOptionsFromCatalog,
  decodeModelSelection,
} from "../lib/cursor-model-options.js";
import {
  buildResearchPrompt,
  buildSpellcheckPrompt,
  extractSpellcheckJson,
  SpellcheckError,
} from "../lib/spellcheck-parse.js";
import * as cursorSettings from "./cursor-settings.js";

export { extractSpellcheckJson, SpellcheckError } from "../lib/spellcheck-parse.js";

export async function listCursorModels(workspaceId: string): Promise<
  { id: string; displayName?: string }[]
> {
  const apiKey = await cursorSettings.getCursorApiKey(workspaceId);
  if (!apiKey) {
    throw new SpellcheckError(
      "missing_key",
      "Cursor API key is not configured.",
    );
  }
  const models = await Cursor.models.list({ apiKey });
  return cursorModelOptionsFromCatalog(models);
}

async function runCursorTaskRewrite(input: {
  apiKey: string;
  model: string;
  prompt: string;
  emptyMessage: string;
  failMessage: string;
}): Promise<SpellcheckResponse> {
  let runResult: Awaited<ReturnType<typeof Agent.prompt>>;
  try {
    runResult = await Agent.prompt(input.prompt, {
      apiKey: input.apiKey,
      model: decodeModelSelection(input.model || "auto"),
      local: { cwd: tmpdir() },
    });
  } catch (error) {
    throw new SpellcheckError(
      "upstream",
      error instanceof Error ? error.message : "Cursor SDK request failed.",
    );
  }

  if (runResult.status === "error") {
    throw new SpellcheckError(
      "upstream",
      runResult.error?.message || input.failMessage,
    );
  }

  const text = runResult.result?.trim() ?? "";
  if (!text) {
    throw new SpellcheckError("bad_response", input.emptyMessage);
  }
  return extractSpellcheckJson(text);
}

export async function spellcheckText(
  workspaceId: string,
  input: { title: string; description?: string | null },
): Promise<SpellcheckResponse> {
  const config = await cursorSettings.getCursorSpellcheckConfig(workspaceId);
  if (!config.spellcheckEnabled) {
    throw new SpellcheckError(
      "disabled",
      "Spellcheck is disabled in Settings → Cursor.",
    );
  }
  if (!config.apiKey) {
    throw new SpellcheckError(
      "missing_key",
      "Cursor API key is not configured.",
    );
  }

  const title = input.title ?? "";
  const description = input.description ?? "";
  const prompt = buildSpellcheckPrompt(
    title,
    description,
    config.spellcheckInstructions,
  );

  return runCursorTaskRewrite({
    apiKey: config.apiKey,
    model: config.spellcheckModel,
    prompt,
    emptyMessage: "Spellcheck model returned empty output.",
    failMessage: "Cursor spellcheck run failed.",
  });
}

export async function researchText(
  workspaceId: string,
  input: { title: string; description?: string | null },
): Promise<ResearchResponse> {
  const config = await cursorSettings.getCursorResearchConfig(workspaceId);
  if (!config.researchEnabled) {
    throw new SpellcheckError(
      "disabled",
      "Research is disabled in Settings → Cursor.",
    );
  }
  if (!config.apiKey) {
    throw new SpellcheckError(
      "missing_key",
      "Cursor API key is not configured.",
    );
  }

  const title = input.title ?? "";
  const description = input.description ?? "";
  const prompt = buildResearchPrompt(
    title,
    description,
    config.researchInstructions,
  );

  return runCursorTaskRewrite({
    apiKey: config.apiKey,
    model: config.researchModel,
    prompt,
    emptyMessage: "Research model returned empty output.",
    failMessage: "Cursor research run failed.",
  });
}
