/**
 * Estimate markdown tables can opt into a richer display mode via an HTML
 * comment immediately above the GFM table:
 *
 * ```md
 * <!-- estimate-table: plan-comparison -->
 * | | Left plan | Right plan |
 * |---|---|---|
 * | Feature | … | … |
 * ```
 *
 * Source stays a normal markdown table (editable as text). Preview/portal
 * renderers rewrite marked tables into a structured fence for a React block.
 */

export const ESTIMATE_TABLE_DISPLAY_MODES = ["plan-comparison"] as const;

export type EstimateTableDisplayMode =
  (typeof ESTIMATE_TABLE_DISPLAY_MODES)[number];

export type EstimatePlanComparisonRow = {
  label: string;
  left: string;
  right: string;
};

export type EstimatePlanComparisonData = {
  leftLabel: string;
  rightLabel: string;
  featureHeader: string;
  rows: EstimatePlanComparisonRow[];
};

export type EstimateMarkdownTableBlock = {
  /** Inclusive start offset of the marker (or table if unmarked). */
  start: number;
  /** Exclusive end offset after the last table line (no trailing newline). */
  end: number;
  tableStart: number;
  tableEnd: number;
  tableMarkdown: string;
  mode: EstimateTableDisplayMode | null;
  markerStart: number | null;
  markerEnd: number | null;
};

const MARKER_LINE_RE =
  /^<!--\s*estimate-table:\s*([a-z0-9-]+)\s*-->\s*$/i;

export const ESTIMATE_PLAN_COMPARISON_FENCE_LANG = "estimate-plan-comparison";

export function isEstimateTableDisplayMode(
  value: string | null | undefined,
): value is EstimateTableDisplayMode {
  return (
    typeof value === "string" &&
    (ESTIMATE_TABLE_DISPLAY_MODES as readonly string[]).includes(value)
  );
}

export function isEstimatePlanComparisonFenceClassName(
  className: string | undefined | null,
): boolean {
  if (!className) return false;
  const lang = ESTIMATE_PLAN_COMPARISON_FENCE_LANG;
  return (
    className.includes(`language-${lang}`) ||
    new RegExp(`(^|\\s)${lang}(\\s|$)`).test(className)
  );
}

export function stripMarkdownCell(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function isSeparatorRow(line: string): boolean {
  const cells = splitTableRow(line);
  if (cells.length < 2) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1);
}

/** Line start offsets for `markdown.split(/\r?\n/)`. */
function lineStartOffsets(markdown: string): number[] {
  const starts = [0];
  for (let i = 0; i < markdown.length; i += 1) {
    if (markdown[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

/** Parse a GFM pipe table into a two-plan comparison matrix (3 columns). */
export function parseMarkdownTableToPlanComparison(
  tableMarkdown: string,
): EstimatePlanComparisonData | null {
  const lines = tableMarkdown
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
  if (lines.length < 2) return null;
  if (!isTableRow(lines[0]!) || !isSeparatorRow(lines[1]!)) return null;

  const header = splitTableRow(lines[0]!).map(stripMarkdownCell);
  if (header.length < 3) return null;

  const featureHeader = header[0] ?? "";
  const leftLabel = header[1] ?? "";
  const rightLabel = header[2] ?? "";
  if (!leftLabel || !rightLabel) return null;

  const rows: EstimatePlanComparisonRow[] = [];
  for (const line of lines.slice(2)) {
    if (!isTableRow(line) || isSeparatorRow(line)) break;
    const cells = splitTableRow(line).map(stripMarkdownCell);
    if (cells.length < 3) continue;
    const label = cells[0] ?? "";
    if (!label) continue;
    rows.push({
      label,
      left: cells[1] ?? "",
      right: cells[2] ?? "",
    });
  }
  if (rows.length === 0) return null;

  return { featureHeader, leftLabel, rightLabel, rows };
}

export function parseEstimatePlanComparisonFenceSource(
  source: string,
): EstimatePlanComparisonData | null {
  const trimmed = source.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as Partial<EstimatePlanComparisonData>;
    if (
      typeof parsed.leftLabel !== "string" ||
      typeof parsed.rightLabel !== "string" ||
      !Array.isArray(parsed.rows)
    ) {
      return null;
    }
    const rows = parsed.rows
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Partial<EstimatePlanComparisonRow>;
        if (
          typeof r.label !== "string" ||
          typeof r.left !== "string" ||
          typeof r.right !== "string"
        ) {
          return null;
        }
        return { label: r.label, left: r.left, right: r.right };
      })
      .filter((row): row is EstimatePlanComparisonRow => row != null);
    if (rows.length === 0) return null;
    return {
      featureHeader:
        typeof parsed.featureHeader === "string" ? parsed.featureHeader : "",
      leftLabel: parsed.leftLabel,
      rightLabel: parsed.rightLabel,
      rows,
    };
  } catch {
    return null;
  }
}

function findTableBlocks(markdown: string): EstimateMarkdownTableBlock[] {
  const lines = markdown.split(/\r?\n/);
  const starts = lineStartOffsets(markdown);
  const blocks: EstimateMarkdownTableBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    let markerMode: EstimateTableDisplayMode | null = null;
    let markerLine = -1;
    let tableLine = i;

    const markerMatch = MARKER_LINE_RE.exec(lines[i]!.trim());
    if (markerMatch) {
      const modeRaw = markerMatch[1]?.toLowerCase() ?? "";
      if (isEstimateTableDisplayMode(modeRaw)) {
        let j = i + 1;
        while (j < lines.length && lines[j]!.trim() === "") j += 1;
        if (j < lines.length && isTableRow(lines[j]!)) {
          markerMode = modeRaw;
          markerLine = i;
          tableLine = j;
        }
      }
    }

    if (!isTableRow(lines[tableLine] ?? "")) {
      i += 1;
      continue;
    }
    if (
      tableLine + 1 >= lines.length ||
      !isSeparatorRow(lines[tableLine + 1]!)
    ) {
      i = markerMode != null ? tableLine : i + 1;
      continue;
    }

    let endLine = tableLine + 1;
    while (endLine + 1 < lines.length && isTableRow(lines[endLine + 1]!)) {
      endLine += 1;
    }

    const tableStart = starts[tableLine] ?? 0;
    const tableEnd =
      (starts[endLine] ?? 0) + (lines[endLine]?.length ?? 0);
    const markerStart =
      markerLine >= 0 ? (starts[markerLine] ?? 0) : null;
    const markerEnd =
      markerLine >= 0
        ? (starts[markerLine] ?? 0) + (lines[markerLine]?.length ?? 0)
        : null;

    blocks.push({
      start: markerStart ?? tableStart,
      end: tableEnd,
      tableStart,
      tableEnd,
      tableMarkdown: lines.slice(tableLine, endLine + 1).join("\n"),
      mode: markerMode,
      markerStart,
      markerEnd,
    });

    i = endLine + 1;
  }

  return blocks;
}

export function listEstimateMarkdownTables(
  markdown: string,
): EstimateMarkdownTableBlock[] {
  return findTableBlocks(markdown);
}

/**
 * Rewrite marked plan-comparison tables into a fenced JSON block the markdown
 * preview can mount as a React component (same idea as ```mermaid).
 */
export function normalizeEstimateTableDisplayMarkdown(
  markdown: string,
): string {
  const blocks = findTableBlocks(markdown).filter(
    (block) => block.mode === "plan-comparison",
  );
  if (blocks.length === 0) return markdown;

  let result = markdown;
  for (const block of [...blocks].reverse()) {
    const data = parseMarkdownTableToPlanComparison(block.tableMarkdown);
    if (!data) continue;
    const fence = `\`\`\`${ESTIMATE_PLAN_COMPARISON_FENCE_LANG}\n${JSON.stringify(data, null, 2)}\n\`\`\``;
    result = `${result.slice(0, block.start)}${fence}${result.slice(block.end)}`;
  }
  return result;
}

export function setEstimateTableDisplayMode(
  markdown: string,
  tableBlock: EstimateMarkdownTableBlock,
  mode: EstimateTableDisplayMode | null,
): string {
  if (mode) {
    const marker = `<!-- estimate-table: ${mode} -->`;
    if (tableBlock.markerStart != null && tableBlock.markerEnd != null) {
      return (
        markdown.slice(0, tableBlock.markerStart) +
        marker +
        markdown.slice(tableBlock.markerEnd)
      );
    }
    return (
      markdown.slice(0, tableBlock.tableStart) +
      `${marker}\n` +
      markdown.slice(tableBlock.tableStart)
    );
  }

  if (tableBlock.markerStart == null || tableBlock.markerEnd == null) {
    return markdown;
  }
  let cutEnd = tableBlock.markerEnd;
  if (markdown[cutEnd] === "\n") cutEnd += 1;
  return markdown.slice(0, tableBlock.markerStart) + markdown.slice(cutEnd);
}

export function estimateTableDisplayLabel(
  mode: EstimateTableDisplayMode | null,
): string {
  if (mode === "plan-comparison") return "Plan comparison";
  return "Default table";
}
