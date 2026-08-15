/**
 * T3-style tool activity presentation.
 * Adapted from pingdotgg/t3code (MIT) — packages/shared/src/toolActivity.ts
 * + apps/server/src/provider/acp/AcpRuntimeModel.ts (makeToolCallState /
 * shouldEmitToolCallUpdate).
 *
 * Short action verb in the heading; path / query / command in `detail`.
 */

import {
  isGenericToolTitle,
  normalizeCompactToolLabel,
  toolKindVerb,
} from "./work-entry-labels";

export type ToolActivityPresentation = {
  summary: string;
  detail?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function truncateDetail(value: string, max = 72): string {
  const oneLine = value.replace(/\s+/g, " ").trim();
  if (!oneLine) return "";
  return oneLine.length > max ? `${oneLine.slice(0, max - 3)}…` : oneLine;
}

function formatPathForDetail(filePath: string, max = 64): string {
  const normalized = filePath.replace(/\\/g, "/").trim();
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 3) {
    return truncateDetail(parts.join("/") || normalized, max);
  }
  return truncateDetail(parts.slice(-3).join("/"), max);
}

function maybePathLike(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (
    value.includes("/") ||
    value.includes("\\") ||
    value.startsWith(".") ||
    /\.(?:[a-z0-9]{1,12})$/i.test(value)
  ) {
    return value;
  }
  return undefined;
}

function stringField(
  input: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function quoteSearchQuery(query: string): string {
  const truncated = truncateDetail(query);
  if (!truncated) return "";
  return truncated.includes(" ") || truncated.includes('"')
    ? truncated
    : `"${truncated}"`;
}

function coerceRawInput(
  raw: unknown,
  toolKind?: string,
): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      if (maybePathLike(trimmed) || trimmed.includes("*")) {
        return { path: trimmed };
      }
      // Cursor sometimes sends a bare search/glob pattern as the rawInput string.
      const kind = (toolKind ?? "").toLowerCase();
      if (
        kind.includes("search") ||
        kind.includes("grep") ||
        kind.includes("glob") ||
        kind.includes("find")
      ) {
        return { pattern: trimmed };
      }
      return null;
    }
    return null;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

/**
 * T3 mergeToolCallState data merge: keep rawInput/locations/content across
 * patch frames so a later status-only update does not drop the path/query.
 * Empty `content: []` must not wipe a prior diff payload (ACP clear vs omit).
 */
export function mergeToolCallPayload(
  previous: Record<string, unknown> | undefined,
  update: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(previous ?? {}) };

  for (const key of ["toolCallId", "sessionUpdate", "title", "kind", "status"] as const) {
    const value = update[key];
    if (typeof value === "string" && value.trim()) {
      merged[key] = value.trim();
    }
  }

  for (const key of [
    "rawInput",
    "input",
    "arguments",
    "args",
    "locations",
    "rawOutput",
  ] as const) {
    if (update[key] !== undefined && update[key] !== null) {
      merged[key] = update[key];
    }
  }

  if (update.content !== undefined && update.content !== null) {
    const nextContent = update.content;
    const prevContent = merged.content;
    const nextEmpty =
      Array.isArray(nextContent) && nextContent.length === 0;
    const prevHasItems =
      Array.isArray(prevContent) && prevContent.length > 0;
    // ACP treats [] as clear; agents often send empty content on status-only
    // frames. Keep the previous diff/content when the new array is empty.
    if (!(nextEmpty && prevHasItems)) {
      merged.content = nextContent;
    }
  }

  return merged;
}

function collectPathsFromValue(
  value: unknown,
  paths: string[],
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 5 || paths.length >= 8) return;
  if (typeof value === "string") {
    const candidate = maybePathLike(value.trim());
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      paths.push(candidate);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPathsFromValue(entry, paths, seen, depth + 1);
      if (paths.length >= 8) return;
    }
    return;
  }
  const record = asRecord(value);
  if (!record) return;

  for (const key of [
    "path",
    "file_path",
    "filePath",
    "target_file",
    "targetFile",
    "relativePath",
    "filename",
    "file",
    "newPath",
    "oldPath",
    "uri",
  ]) {
    const raw = stringField(record, key);
    if (!raw) continue;
    const candidate =
      maybePathLike(raw) ??
      (key === "uri" && raw.startsWith("file:")
        ? maybePathLike(raw.replace(/^file:\/\//, ""))
        : null);
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    paths.push(candidate);
    if (paths.length >= 8) return;
  }

  for (const nestedKey of [
    "locations",
    "item",
    "input",
    "result",
    "rawInput",
    "arguments",
    "args",
    "data",
    "changes",
    "content",
  ]) {
    if (!(nestedKey in record)) continue;
    collectPathsFromValue(record[nestedKey], paths, seen, depth + 1);
    if (paths.length >= 8) return;
  }
}

const TOOL_TITLE_VERB_RE =
  /^(reading|read(?:\s+file)?|grepping|grep(?:ping)?|searching|search|glob(?:bing)?|find(?:ing)?|editing|edit(?:ing)?|writing|write|deleting|delete|moving|move|fetching|fetch|running|ran|terminal|bash|shell)\b(?:\s+|$)(.*)$/i;

/** Split Cursor titles like "Reading src/app.ts" into verb + detail. */
export function peelToolTitle(titleFromAgent: string): {
  title: string;
  detailHint?: string;
} {
  const compact = normalizeCompactToolLabel(titleFromAgent);
  if (!compact) return { title: "" };
  const match = TOOL_TITLE_VERB_RE.exec(compact);
  if (!match) return { title: compact };
  const verb = match[1] ?? compact;
  const rest = (match[2] ?? "").trim();
  if (!rest) return { title: verb };
  const unquoted = rest
    .replace(/^`([^`]+)`$/, "$1")
    .replace(/^"([^"]+)"$/, "$1")
    .replace(/^'([^']+)'$/, "$1")
    .trim();
  if (!unquoted) return { title: verb };
  const pathLike = maybePathLike(unquoted);
  return {
    title: verb,
    detailHint: pathLike
      ? formatPathForDetail(pathLike)
      : truncateDetail(unquoted),
  };
}

function extractToolContentText(content: unknown): string | undefined {
  if (typeof content === "string" && content.trim()) {
    return truncateDetail(content.trim(), 120);
  }
  if (!Array.isArray(content)) return undefined;
  const chunks: string[] = [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (e.type === "content" && e.content && typeof e.content === "object") {
      const nested = e.content as Record<string, unknown>;
      if (typeof nested.text === "string" && nested.text.trim()) {
        chunks.push(nested.text.trim());
      }
      continue;
    }
    if (typeof e.text === "string" && e.text.trim()) {
      chunks.push(e.text.trim());
    }
  }
  if (chunks.length === 0) return undefined;
  return truncateDetail(chunks.join("\n"), 120);
}

function extractCommand(
  input: Record<string, unknown> | null,
  title: string | undefined,
): string | undefined {
  if (input) {
    const direct = stringField(input, "command", "cmd");
    if (direct) return truncateDetail(direct);
    const executable = stringField(input, "executable");
    if (executable) {
      const args = input.args;
      if (Array.isArray(args)) {
        const parts = args
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean);
        return truncateDetail(
          parts.length > 0 ? `${executable} ${parts.join(" ")}` : executable,
        );
      }
      if (typeof args === "string" && args.trim()) {
        return truncateDetail(`${executable} ${args.trim()}`);
      }
      return truncateDetail(executable);
    }
  }
  if (!title) return undefined;
  const backtick = /`([^`]+)`/.exec(title);
  const cmd = backtick?.[1]?.trim();
  return cmd ? truncateDetail(cmd) : undefined;
}

/**
 * Structured detail from ACP rawInput / locations / content (T3-style).
 */
export function toolDetailFromUpdate(
  update: Record<string, unknown>,
  toolKind?: string,
): string | undefined {
  const kind = (toolKind ?? "").toLowerCase();
  const prefersSearch =
    kind.includes("search") ||
    kind.includes("grep") ||
    kind.includes("glob") ||
    kind.includes("find");

  const input =
    coerceRawInput(update.rawInput, toolKind) ??
    coerceRawInput(update.input, toolKind) ??
    coerceRawInput(update.arguments, toolKind) ??
    coerceRawInput(update.args, toolKind);

  if (input) {
    const query = stringField(
      input,
      "pattern",
      "query",
      "search",
      "searchTerm",
      "regex",
      "glob_pattern",
      "globPattern",
      "glob",
    );
    const filePath = stringField(
      input,
      "file_path",
      "filePath",
      "target_file",
      "targetFile",
      "relativePath",
      "filename",
      "file",
      "path",
      "target_directory",
      "targetDirectory",
      "directory",
      "dir",
    );
    const command = extractCommand(input, undefined);

    if (prefersSearch) {
      if (query) {
        const quoted = quoteSearchQuery(query);
        if (filePath) {
          return truncateDetail(
            `${quoted} in ${formatPathForDetail(filePath)}`,
          );
        }
        return quoted;
      }
      if (filePath) return formatPathForDetail(filePath);
    } else {
      if (filePath) return formatPathForDetail(filePath);
      if (command) return command;
      if (query) return truncateDetail(query);
    }
  }

  const nestedPaths: string[] = [];
  collectPathsFromValue(update, nestedPaths, new Set(), 0);
  if (nestedPaths[0]) return formatPathForDetail(nestedPaths[0]);

  return extractToolContentText(update.content);
}

function presentGenericTitle(
  titleFromAgent: string,
  toolKind: string | undefined,
): string {
  const kindLabel = toolKindVerb(toolKind);
  const compact = normalizeCompactToolLabel(titleFromAgent);
  if (!compact || isGenericToolTitle(compact)) return kindLabel || "Tool";
  const lower = compact.toLowerCase();
  if (
    kindLabel &&
    (lower === "write" ||
      lower === "writing" ||
      lower === "edit" ||
      lower === "editing" ||
      lower === "read" ||
      lower === "reading" ||
      lower === "read file" ||
      lower === "terminal" ||
      lower === "bash" ||
      lower === "shell" ||
      lower === "grep" ||
      lower === "grepping" ||
      lower === "find" ||
      lower === "finding" ||
      lower === "search" ||
      lower === "searching" ||
      lower === "glob" ||
      lower === "globbing" ||
      lower === "tool")
  ) {
    return kindLabel;
  }
  return compact;
}

/**
 * Derive heading + detail for one ACP tool_call frame (T3 makeToolCallState
 * + deriveToolActivityPresentation).
 *
 * Always prefers a short kind verb when known so the path can sit in `detail`
 * (avoids "Reading foo.ts" with the path duplicated / hidden).
 */
export function deriveToolActivityPresentation(input: {
  titleFromAgent: string;
  toolKind?: string;
  update: Record<string, unknown>;
  existingDetail?: string;
  diffPath?: string;
}): ToolActivityPresentation {
  const { titleFromAgent, toolKind, update, existingDetail, diffPath } = input;
  const peeled = peelToolTitle(titleFromAgent);
  const structured = toolDetailFromUpdate(update, toolKind);
  const detail =
    structured ??
    peeled.detailHint ??
    (diffPath ? formatPathForDetail(diffPath) : undefined) ??
    existingDetail;

  const kindLabel = toolKindVerb(toolKind);
  // T3 summary style: kind verb when we know the action. If we peeled a path
  // out of the Cursor title, never keep the path-bearing heading.
  const summary = kindLabel
    ? kindLabel
    : peeled.detailHint
      ? presentGenericTitle(peeled.title, toolKind)
      : presentGenericTitle(titleFromAgent, toolKind);

  return detail?.trim()
    ? { summary, detail: detail.trim() }
    : { summary };
}

/**
 * T3 shouldEmitToolCallUpdate: hold until detail exists; once visible, only
 * re-emit when title/detail change or the tool finishes (suppress status spam).
 */
export function shouldEmitToolActivity(input: {
  detail?: string;
  title?: string;
  status?: string;
  alreadyVisible: boolean;
  previousTitle?: string;
  previousDetail?: string;
}): boolean {
  if (input.status === "completed" || input.status === "failed") return true;
  if (!input.detail?.trim()) return false;
  if (!input.alreadyVisible) return true;
  return (
    (input.previousTitle ?? "") !== (input.title ?? "") ||
    (input.previousDetail ?? "") !== (input.detail ?? "")
  );
}

export { formatPathForDetail, truncateDetail };
