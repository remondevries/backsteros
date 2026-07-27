export type TextRange = {
  start: number;
  end: number;
};

export type SpellcheckSegment = {
  id: string;
  kind: "equal" | "change";
  before: string;
  after: string;
  /**
   * For `change` segments: true shows the spellchecked `after` (orange),
   * false shows the original `before` (grey). Ignored for `equal`.
   */
  active: boolean;
};

export type SpellcheckMarkRange = TextRange & {
  active: boolean;
};

function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

type DiffOp =
  | { type: "eq"; token: string }
  | { type: "del"; token: string }
  | { type: "ins"; token: string };

function buildDiffOps(before: string, after: string): DiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const n = a.length;
  const m = b.length;

  const dp: Uint16Array[] = Array.from(
    { length: n + 1 },
    () => new Uint16Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i]![j] =
        a[i] === b[j]
          ? dp[i + 1]![j + 1]! + 1
          : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "eq", token: a[i]! });
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      ops.push({ type: "del", token: a[i]! });
      i += 1;
    } else {
      ops.push({ type: "ins", token: b[j]! });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ type: "del", token: a[i]! });
    i += 1;
  }
  while (j < m) {
    ops.push({ type: "ins", token: b[j]! });
    j += 1;
  }
  return ops;
}

/** Build toggleable spellcheck segments from before/after text. */
export function buildSpellcheckSegments(
  before: string,
  after: string,
): SpellcheckSegment[] {
  if (before === after) {
    return before
      ? [{ id: "e0", kind: "equal", before, after, active: true }]
      : [];
  }

  const ops = buildDiffOps(before, after);
  const segments: SpellcheckSegment[] = [];
  let index = 0;
  let cursor = 0;

  while (cursor < ops.length) {
    const op = ops[cursor]!;
    if (op.type === "eq") {
      let text = "";
      while (cursor < ops.length && ops[cursor]!.type === "eq") {
        text += ops[cursor]!.token;
        cursor += 1;
      }
      segments.push({
        id: `e${index++}`,
        kind: "equal",
        before: text,
        after: text,
        active: true,
      });
      continue;
    }

    let beforeText = "";
    let afterText = "";
    while (cursor < ops.length && ops[cursor]!.type !== "eq") {
      const next = ops[cursor]!;
      if (next.type === "del") beforeText += next.token;
      else afterText += next.token;
      cursor += 1;
    }
    if (beforeText === afterText) {
      segments.push({
        id: `e${index++}`,
        kind: "equal",
        before: beforeText,
        after: afterText,
        active: true,
      });
    } else {
      segments.push({
        id: `c${index++}`,
        kind: "change",
        before: beforeText,
        after: afterText,
        active: true,
      });
    }
  }

  return segments;
}

export function composeSpellcheckText(
  segments: readonly SpellcheckSegment[],
): string {
  let out = "";
  for (const segment of segments) {
    if (segment.kind === "equal") {
      out += segment.after;
    } else {
      out += segment.active ? segment.after : segment.before;
    }
  }
  return out;
}

export function spellcheckHasChanges(
  segments: readonly SpellcheckSegment[],
): boolean {
  return segments.some((segment) => segment.kind === "change");
}

export function toggleSpellcheckSegment(
  segments: readonly SpellcheckSegment[],
  segmentId: string,
): SpellcheckSegment[] {
  return segments.map((segment) =>
    segment.id === segmentId && segment.kind === "change"
      ? { ...segment, active: !segment.active }
      : segment,
  );
}

/** Mark ranges in the currently composed text (for CodeMirror). */
export function spellcheckMarkRanges(
  segments: readonly SpellcheckSegment[],
): SpellcheckMarkRange[] {
  const ranges: SpellcheckMarkRange[] = [];
  let offset = 0;
  for (const segment of segments) {
    const text =
      segment.kind === "equal"
        ? segment.after
        : segment.active
          ? segment.after
          : segment.before;
    if (segment.kind === "change" && text.length > 0) {
      ranges.push({
        start: offset,
        end: offset + text.length,
        active: segment.active,
      });
    }
    offset += text.length;
  }
  return ranges;
}

/**
 * Word-level ranges in `after` that are insertions or replacements vs `before`.
 * Kept for simple highlight use cases.
 */
export function diffHighlightRanges(
  before: string,
  after: string,
): TextRange[] {
  return spellcheckMarkRanges(buildSpellcheckSegments(before, after)).map(
    ({ start, end }) => ({ start, end }),
  );
}
