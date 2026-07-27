import { z } from "zod";

import type { SpellcheckResponse } from "@backsteros/contracts";

const spellcheckResultSchema = z.object({
  title: z.string(),
  description: z.string(),
});

export class SpellcheckError extends Error {
  readonly code: "disabled" | "missing_key" | "bad_response" | "upstream";

  constructor(code: SpellcheckError["code"], message: string) {
    super(message);
    this.name = "SpellcheckError";
    this.code = code;
  }
}

/** Extract JSON object from model output (raw or fenced). */
export function extractSpellcheckJson(text: string): SpellcheckResponse {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fence?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new SpellcheckError(
      "bad_response",
      "Spellcheck model did not return JSON.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new SpellcheckError(
      "bad_response",
      "Spellcheck model returned invalid JSON.",
    );
  }
  const result = spellcheckResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new SpellcheckError(
      "bad_response",
      "Spellcheck model returned unexpected JSON shape.",
    );
  }
  return {
    title: result.data.title.trim(),
    description: result.data.description,
  };
}

export const DEFAULT_SPELLCHECK_INSTRUCTIONS = [
  "You are a careful copy editor.",
  "Fix spelling, grammar, and light formatting only.",
  "Preserve meaning, tone, markdown structure, and proper nouns.",
  "Do not add or remove content. Do not use tools or read files.",
  'Respond with ONLY a JSON object: {"title":"...","description":"..."}.',
].join("\n");

export const DEFAULT_RESEARCH_INSTRUCTIONS = [
  "You are a research assistant helping plan a task.",
  "Research the topic in the title and description.",
  "Enrich the description with clear findings, context, open questions, and suggested next steps.",
  "Keep useful existing content; improve structure with markdown.",
  "Keep the title concise; put research notes in the description.",
  "You may use tools when available to look things up.",
  'Respond with ONLY a JSON object: {"title":"...","description":"..."}.',
].join("\n");

export function normalizeSpellcheckInstructions(
  value: string | null | undefined,
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || DEFAULT_SPELLCHECK_INSTRUCTIONS;
}

export function normalizeResearchInstructions(
  value: string | null | undefined,
): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || DEFAULT_RESEARCH_INSTRUCTIONS;
}

/**
 * Build the agent prompt. `instructions` is the editable preamble from settings;
 * title/description content is always appended afterward.
 */
export function buildSpellcheckPrompt(
  title: string,
  description: string,
  instructions?: string | null,
): string {
  return [
    normalizeSpellcheckInstructions(instructions),
    "",
    "Title:",
    title,
    "",
    "Description:",
    description,
  ].join("\n");
}

export function buildResearchPrompt(
  title: string,
  description: string,
  instructions?: string | null,
): string {
  return [
    normalizeResearchInstructions(instructions),
    "",
    "Title:",
    title,
    "",
    "Description:",
    description,
  ].join("\n");
}

