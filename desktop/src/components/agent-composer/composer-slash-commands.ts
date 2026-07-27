/**
 * Slash-command items for the desktop agent composer (/model, /ask, /plan, /build).
 */

import type { AgentChatModelOption } from "../../lib/agent/agent-chat-model";
import type { AgentChatMode } from "../../lib/agent/agent-chat-mode";

export type ComposerSlashCommandId =
  | "model"
  | "ask"
  | "plan"
  | "build"
  | "clear";

export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      relativePath: string;
      pathKind: "file" | "directory";
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommandId;
      label: string;
      description: string;
      /** When set, selecting the command switches agent mode. */
      mode?: AgentChatMode;
    }
  | {
      id: string;
      type: "model";
      modelId: string;
      label: string;
      description: string;
    };

const BUILTIN_SLASH: Array<{
  command: ComposerSlashCommandId;
  label: string;
  description: string;
  mode?: AgentChatMode;
}> = [
  {
    command: "model",
    label: "/model",
    description: "Switch the agent model",
  },
  {
    command: "build",
    label: "/build",
    description: "Switch to Build mode (full agent)",
    mode: "build",
  },
  {
    command: "plan",
    label: "/plan",
    description: "Switch to Plan mode",
    mode: "plan",
  },
  {
    command: "ask",
    label: "/ask",
    description: "Switch to Ask mode (read-only)",
    mode: "ask",
  },
  {
    command: "clear",
    label: "/clear",
    description: "Clear chat and start a fresh agent session",
  },
];

function scoreMatch(value: string, query: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const v = value.toLowerCase();
  if (v === q) return 0;
  if (v.startsWith(q)) return 1;
  if (v.includes(q)) return 2;
  return null;
}

export function searchSlashCommandItems(
  query: string,
): Extract<ComposerCommandItem, { type: "slash-command" }>[] {
  const ranked: Array<{
    item: Extract<ComposerCommandItem, { type: "slash-command" }>;
    score: number;
  }> = [];

  for (const cmd of BUILTIN_SLASH) {
    const score =
      scoreMatch(cmd.command, query) ?? scoreMatch(cmd.label, query);
    if (score === null) continue;
    ranked.push({
      score,
      item: {
        id: `slash:${cmd.command}`,
        type: "slash-command",
        command: cmd.command,
        label: cmd.label,
        description: cmd.description,
        mode: cmd.mode,
      },
    });
  }

  ranked.sort((a, b) => a.score - b.score);
  return ranked.map((r) => r.item);
}

export function searchModelCommandItems(
  models: ReadonlyArray<AgentChatModelOption>,
  query: string,
): Extract<ComposerCommandItem, { type: "model" }>[] {
  const ranked: Array<{
    item: Extract<ComposerCommandItem, { type: "model" }>;
    score: number;
  }> = [];

  for (const model of models) {
    const score =
      scoreMatch(model.id, query) ?? scoreMatch(model.displayName, query);
    if (score === null) continue;
    ranked.push({
      score,
      item: {
        id: `model:${model.id}`,
        type: "model",
        modelId: model.id,
        label: model.displayName || model.id,
        description: model.id,
      },
    });
  }

  ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.item.label.localeCompare(b.item.label, undefined, {
      sensitivity: "base",
    });
  });
  return ranked.slice(0, 50).map((r) => r.item);
}

export function pathEntriesToCommandItems(
  entries: ReadonlyArray<{
    path: string;
    relativePath: string;
    kind: "file" | "directory";
    label: string;
  }>,
): Extract<ComposerCommandItem, { type: "path" }>[] {
  return entries.map((entry) => ({
    id: `path:${entry.path}`,
    type: "path" as const,
    path: entry.path,
    relativePath: entry.relativePath,
    pathKind: entry.kind,
    label: entry.label,
    description: entry.relativePath,
  }));
}
