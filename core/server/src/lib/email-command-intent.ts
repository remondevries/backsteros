/**
 * Deterministic email-thread command classifier (OS-94).
 *
 * Fixed mailbox / create intents run in core with no Judith wake.
 * Prose (rewrite / reply / compose) and ambiguous prompts fall back to wake.
 * Keep {@link decideEmailCommand} as the sole entry so a smarter classifier
 * can replace the rules later without changing callers.
 */

import type { EmailAgentAllowedIntent } from "./email-grok-wake.js";

export const EMAIL_CORE_EXECUTABLE_INTENTS = [
  "spam",
  "trash",
  "archive",
  "mark_read",
  "mark_unread",
  "task",
  "calendar",
  "note",
] as const;

export type EmailCoreExecutableIntent =
  (typeof EMAIL_CORE_EXECUTABLE_INTENTS)[number];

export type EmailCommandDecision =
  | {
      kind: "execute";
      intent: EmailCoreExecutableIntent;
      noteMessage?: string;
    }
  | {
      kind: "wake";
      intent: EmailAgentAllowedIntent | null;
    };

function normalizeCommandText(prompt: string): string {
  return prompt
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPolite(text: string): string {
  return text
    .replace(/^(please|pls|alsjeblieft|aub)\s+/i, "")
    .replace(/\s+(please|pls|alsjeblieft|aub)$/i, "")
    .trim();
}

const COMMAND_PATTERNS: ReadonlyArray<{
  intent: EmailCoreExecutableIntent;
  pattern: RegExp;
  noteFromMatch?: (match: RegExpMatchArray) => string | undefined;
}> = [
  {
    intent: "spam",
    pattern:
      /^(mark (as )?spam|report( as)? spam|spam( this| it| deze| dit)?|this is spam|dit is spam|block( the)? sender|markeer als spam|rapporteer( als)? spam|blokkeer( de)? afzender)$/,
  },
  {
    intent: "trash",
    pattern:
      /^(delete( this| it| the (email|message|thread|mail))?|trash( this| it)?|move to trash|throw (this |it )?away|verwijder( dit| deze| het)?( (email|bericht|thread|mail))?|gooi (dit |deze |het )?weg|naar de prullenbak)$/,
  },
  {
    intent: "archive",
    pattern:
      /^(archive( this| it| the (email|message|thread|mail))?|archiveer( dit| deze| het)?( (email|bericht|thread|mail))?)$/,
  },
  {
    intent: "mark_unread",
    pattern:
      /^(mark( as)? unread|markeer als ongelezen|als ongelezen markeren|ongelezen)$/,
  },
  {
    intent: "mark_read",
    pattern:
      /^(mark( as)? read|markeer als gelezen|als gelezen markeren|gelezen)$/,
  },
  {
    intent: "task",
    pattern:
      /^(make (a |this a )?task( (of|from) (this|it))?|create (a )?task( (of|from) (this|it))?|turn (this|it) into a task|task (of|from) (this|it)|maak (hier(van)? )?(een )?taak( van( dit| deze)?)?|taak (van )?(dit|deze)|van dit een taak( maken)?)$/,
  },
  {
    intent: "calendar",
    pattern:
      /^(make (a |this a )?(meeting|calendar( event)?|agenda( item)?)( (of|from) (this|it))?|create (a )?(meeting|calendar( event)?|agenda( item)?)( (of|from) (this|it))?|schedule (a )?(meeting|call|event)|maak (hier(van)? )?(een )?(meeting|afspraak|agenda(punt)?)( van( dit| deze)?)?|plan (een )?(meeting|afspraak|call))$/,
  },
  {
    intent: "note",
    pattern:
      /^(?:add (?:a )?note|note|notitie|voeg (?:een )?notitie toe)(?:\s*[:\-–—]\s*|\s+)(.+)$/,
    noteFromMatch: (match) => match[1]?.trim() || undefined,
  },
];

function matchFixedCommand(
  normalized: string,
  originalPrompt: string,
): Extract<EmailCommandDecision, { kind: "execute" }> | null {
  for (const entry of COMMAND_PATTERNS) {
    const match = normalized.match(entry.pattern);
    if (!match) continue;
    if (entry.intent === "note") {
      // Preserve original casing for the note body (normalized is lowercased).
      const originalMatch = originalPrompt
        .trim()
        .match(
          /^(?:add (?:a )?note|note|notitie|voeg (?:een )?notitie toe)(?:\s*[:\-–—]\s*|\s+)(.+)$/i,
        );
      const noteMessage = originalMatch?.[1]?.trim();
      if (!noteMessage) return null;
      return { kind: "execute", intent: "note", noteMessage };
    }
    return { kind: "execute", intent: entry.intent };
  }
  return null;
}

export function decideEmailCommand(input: {
  prompt: string;
  explicitIntent?: EmailAgentAllowedIntent | null;
}): EmailCommandDecision {
  const explicit = input.explicitIntent ?? null;
  const normalized = stripPolite(normalizeCommandText(input.prompt));

  if (explicit === "task" || explicit === "calendar" || explicit === "note") {
    if (explicit === "note") {
      const body = input.prompt.trim();
      if (!body) return { kind: "wake", intent: "note" };
      return { kind: "execute", intent: "note", noteMessage: body };
    }
    return { kind: "execute", intent: explicit };
  }

  const fixed = normalized ? matchFixedCommand(normalized, input.prompt) : null;
  if (fixed) return fixed;

  if (
    /^(add (a )?note|note|notitie|voeg (een )?notitie toe)$/.test(normalized)
  ) {
    return {
      kind: "wake",
      intent: explicit === "reply_draft" ? "reply_draft" : null,
    };
  }

  if (explicit === "reply_draft") {
    return { kind: "wake", intent: "reply_draft" };
  }

  return { kind: "wake", intent: null };
}
