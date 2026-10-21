/** Email draft body helpers (greeting/sign-off stripping) — no Agent Chat. */

const GREETING_LINE =
  /^(?:hi|hello|hey|dear|aan|beste|geachte|goedemorgen|goedemiddag|goedenavond)\b[^,\n]{0,80},?\s*$/i;

const SIGN_OFF_BLOCK =
  /\n+(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards),?\s*\n[\s\S]*$/i;

/** Numbered (`1.`) or bulleted (`-` / `*` / `•`) paragraph openers. */
const LIST_PARAGRAPH = /^(?:\d+[.)]\s+|[-*•]\s+)/;

export function stripEmailDraftShell(
  body: string,
  shell?: { greeting?: string | null; signOff?: string | null },
): string {
  let next = body.replace(/\r\n/g, "\n").trim();
  if (!next) return "";

  const greeting = shell?.greeting?.trim();
  if (greeting) {
    if (next === greeting) return "";
    if (next.startsWith(`${greeting}\n`)) {
      next = next.slice(greeting.length).replace(/^\s*\n+/, "");
    }
  }

  const signOff = shell?.signOff?.trim();
  if (signOff) {
    if (next === signOff) return "";
    if (next.endsWith(`\n${signOff}`)) {
      next = next.slice(0, next.length - signOff.length).replace(/\n+\s*$/, "");
    } else if (next.endsWith(signOff)) {
      next = next.slice(0, next.length - signOff.length).replace(/\n+\s*$/, "");
    }
  }

  return next.trim();
}

function isListParagraph(text: string): boolean {
  return LIST_PARAGRAPH.test(text.trim());
}

function longWords(text: string): string[] {
  return text.split(/\s+/).filter((word) => word.length > 4);
}

/**
 * Near-duplicate rewrite detection for raw agent output only.
 * Complementary paragraphs (including numbered lists) must not match.
 */
function nearDuplicateParagraphs(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  // Containment only when the shorter block is a substantial rewrite fragment.
  if (
    shorter.length >= 40 &&
    longer.includes(shorter) &&
    shorter.length / longer.length >= 0.5
  ) {
    return true;
  }
  const setA = new Set(longWords(a));
  const setB = new Set(longWords(b));
  if (setA.size === 0 || setB.size === 0) return false;
  let shared = 0;
  for (const word of setA) {
    if (setB.has(word)) shared += 1;
  }
  const overlap = shared / Math.min(setA.size, setB.size);
  const lenRatio =
    Math.min(a.length, b.length) / Math.max(a.length, b.length);
  return overlap >= 0.65 && lenRatio >= 0.45;
}

/**
 * True when earlier paragraphs look like discarded draft attempts of the last
 * one (agent iteration noise). Distinct complementary paragraphs stay.
 */
function paragraphsLookLikeAgentIterations(paragraphs: string[]): boolean {
  // Numbered / bulleted items are complementary content, never rewrite noise.
  if (paragraphs.some((paragraph) => isListParagraph(paragraph))) {
    return false;
  }

  const last = (paragraphs[paragraphs.length - 1] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!last) return true;
  for (let index = 0; index < paragraphs.length - 1; index += 1) {
    const earlier = (paragraphs[index] ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!earlier) continue;
    if (nearDuplicateParagraphs(earlier, last)) return true;
  }
  return false;
}

/**
 * Normalize raw agent reply text: strip greeting/sign-off and collapse obvious
 * rewrite iterations. Do not use this for already-saved draft bodies — use
 * {@link resolveEditableEmailDraftBody} instead.
 */
export function extractAgentReplyBody(text: string): string {
  let body = text.trim();
  if (!body) return "";

  const shellMatch = body.match(
    /^ *(?:hi|hello|hey|dear|aan|beste|geachte)\s+[^,\n]{1,80},?\s*\n+([\s\S]*?)\n+(?:best|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards|cheers|thanks|sincerely),?\s*\n[\s\S]*$/i,
  );
  if (shellMatch?.[1]) body = shellMatch[1].trim();

  const lines = body.split("\n");
  while (lines.length > 0 && GREETING_LINE.test(lines[0]?.trim() ?? "")) {
    lines.shift();
  }
  body = lines.join("\n").trim();

  body = body.replace(SIGN_OFF_BLOCK, "");
  body = body.replace(/^(?:aan|beste|geachte),?\s*\n+/i, "");

  const blocks = body
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (blocks.length > 1) {
    // Keep complementary paragraphs; only collapse obvious rewrite iterations.
    body = paragraphsLookLikeAgentIterations(blocks)
      ? (blocks[blocks.length - 1] ?? body)
      : blocks.join("\n\n");
  }

  return body.trim();
}

/**
 * Prefer API `body`; fall back to stored full `text`.
 * Saved drafts are shown as-is after greeting/sign-off strip — never run the
 * agent rewrite-collapse heuristic here (OS-117).
 */
export function resolveEditableEmailDraftBody(
  draft:
    | {
        body?: string | null;
        text?: string | null;
        greeting?: string | null;
        signOff?: string | null;
      }
    | null
    | undefined,
): string {
  if (!draft) return "";
  const shell = { greeting: draft.greeting, signOff: draft.signOff };
  const source = draft.body?.trim() || draft.text?.trim() || "";
  if (!source) return "";

  let next = stripEmailDraftShell(source, shell);
  const lines = next.split("\n");
  while (lines.length > 0 && GREETING_LINE.test(lines[0]?.trim() ?? "")) {
    lines.shift();
  }
  next = lines.join("\n").trim();
  next = next.replace(SIGN_OFF_BLOCK, "").trim();
  return next;
}
