/**
 * Work-entry label helpers.
 * Adapted from pingdotgg/t3code (MIT) — session-logic / MessagesTimeline.logic
 */

/** Strip trailing "complete(d)" suffixes Cursor sometimes appends to tool titles. */
export function normalizeCompactToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

export function capitalizePhrase(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

/** Cursor ACP sometimes sends a literal "Tool" title — treat as missing. */
export function isGenericToolTitle(value: string | undefined): boolean {
  const lower = normalizeCompactToolLabel(value ?? "").toLowerCase();
  if (!lower) return true;
  return (
    lower === "tool" ||
    lower === "tool call" ||
    lower === "tool_call" ||
    lower === "calling tool" ||
    lower === "running tool" ||
    lower === "function" ||
    lower === "function call"
  );
}

/** Short TUI-style verb for a tool kind (Read / Grepped / …). */
export function toolKindVerb(toolKind: string | undefined): string | undefined {
  if (!toolKind) return undefined;
  const lower = toolKind.toLowerCase();
  if (lower === "read") return "Read";
  if (lower === "edit" || lower === "write") return "Edited";
  if (lower === "execute" || lower === "shell") return "Ran";
  if (lower === "search" || lower === "grep" || lower === "glob") return "Grepped";
  if (lower === "delete") return "Deleted";
  if (lower === "move") return "Moved";
  if (lower === "fetch") return "Fetched";
  if (lower === "think") return "Thought";
  return capitalizePhrase(lower);
}

/** T3-style tool row heading from activity title / tool kind. */
export function toolActivityHeading(input: {
  title: string;
  toolKind?: string;
}): string {
  const fromTitle = normalizeCompactToolLabel(input.title);
  if (fromTitle && !isGenericToolTitle(fromTitle)) {
    return capitalizePhrase(fromTitle);
  }
  const verb = toolKindVerb(input.toolKind);
  if (verb) return verb;
  const kind = input.toolKind?.trim();
  if (kind) return capitalizePhrase(kind);
  return "Tool";
}
