/** Email draft body helpers (greeting/sign-off stripping) — no Agent Chat. */

const GREETING_LINE =
  /^(?:hi|hello|hey|dear|aan|beste|geachte|goedemorgen|goedemiddag|goedenavond)\b[^,\n]{0,80},?\s*$/i;

const SIGN_OFF_BLOCK =
  /\n+(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards),?\s*\n[\s\S]*$/i;

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
    body = blocks[blocks.length - 1] ?? body;
  }

  return body.trim();
}

/** Prefer API `body`; fall back to extracting from stored full `text`. */
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
  const fromBody = draft.body?.trim();
  if (fromBody) {
    return extractAgentReplyBody(
      stripEmailDraftShell(draft.body ?? fromBody, shell),
    );
  }
  const rawText = draft.text?.trim();
  if (!rawText) return "";
  return extractAgentReplyBody(stripEmailDraftShell(rawText, shell));
}
