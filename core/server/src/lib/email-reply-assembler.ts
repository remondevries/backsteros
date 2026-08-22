/** Extract bare email from `Name <user@example.com>` or plain address. */
export function parseReplyToAddress(from: string): string {
  const trimmed = from.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  if (trimmed.includes("@")) return trimmed;
  return trimmed;
}

/** First name for greeting — `Ada Lovelace <ada@…>` → `Ada`. */
export function parseSenderFirstName(from: string): string {
  const trimmed = from.trim();
  const display = trimmed.includes("<")
    ? trimmed.slice(0, trimmed.indexOf("<")).trim()
    : trimmed.includes("@")
      ? trimmed.split("@")[0] ?? trimmed
      : trimmed;
  const first = display.split(/\s+/).filter(Boolean)[0];
  return first || "there";
}

export function replySubject(originalSubject: string): string {
  const subject = originalSubject.trim() || "(no subject)";
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

export const DEFAULT_EMAIL_REPLY_GREETING_EN = "Hi {firstName},";
export const DEFAULT_EMAIL_REPLY_GREETING_NL = "Beste {firstName},";
/** @deprecated Use {@link DEFAULT_EMAIL_REPLY_GREETING_EN}. */
export const DEFAULT_EMAIL_REPLY_GREETING = DEFAULT_EMAIL_REPLY_GREETING_EN;
export const DEFAULT_EMAIL_REPLY_SIGN_OFF_EN = "Best,\n{name}";
export const DEFAULT_EMAIL_REPLY_SIGN_OFF_NL = "Met vriendelijke groet,\n{name}";
/** @deprecated Use {@link DEFAULT_EMAIL_REPLY_SIGN_OFF_EN}. */
export const DEFAULT_EMAIL_REPLY_SIGN_OFF = DEFAULT_EMAIL_REPLY_SIGN_OFF_EN;
export const DEFAULT_EMAIL_REPLY_SIGN_OFF_NAME = "Remon";

export type EmailReplyLanguage = "en" | "nl";
/** @deprecated Use {@link EmailReplyLanguage}. */
export type EmailReplySignOffLanguage = EmailReplyLanguage;

export type EmailReplyTemplateSettings = {
  greetingTemplateEn: string;
  greetingTemplateNl: string;
  signOffTemplateEn: string;
  signOffTemplateNl: string;
  signOffName: string;
};

export type ResolvedEmailReplyTemplates = EmailReplyTemplateSettings & {
  greetingTemplate: string;
  signOffTemplate: string;
};

export function resolveEmailReplyTemplates(
  settings?: Partial<
    EmailReplyTemplateSettings & {
      greetingTemplate?: string;
      signOffTemplate?: string;
    }
  > | null,
): EmailReplyTemplateSettings {
  const legacyGreeting = settings?.greetingTemplate?.trim();
  const legacySignOff = settings?.signOffTemplate?.trim();
  return {
    greetingTemplateEn:
      settings?.greetingTemplateEn?.trim() ||
      legacyGreeting ||
      DEFAULT_EMAIL_REPLY_GREETING_EN,
    greetingTemplateNl:
      settings?.greetingTemplateNl?.trim() || DEFAULT_EMAIL_REPLY_GREETING_NL,
    signOffTemplateEn:
      settings?.signOffTemplateEn?.trim() ||
      legacySignOff ||
      DEFAULT_EMAIL_REPLY_SIGN_OFF_EN,
    signOffTemplateNl:
      settings?.signOffTemplateNl?.trim() || DEFAULT_EMAIL_REPLY_SIGN_OFF_NL,
    signOffName:
      settings?.signOffName?.trim() || DEFAULT_EMAIL_REPLY_SIGN_OFF_NAME,
  };
}

export function greetingTemplateForLanguage(
  templates: Pick<
    EmailReplyTemplateSettings,
    "greetingTemplateEn" | "greetingTemplateNl"
  >,
  language: EmailReplyLanguage,
): string {
  return language === "nl"
    ? templates.greetingTemplateNl
    : templates.greetingTemplateEn;
}

export function signOffTemplateForLanguage(
  templates: Pick<
    EmailReplyTemplateSettings,
    "signOffTemplateEn" | "signOffTemplateNl"
  >,
  language: EmailReplyLanguage,
): string {
  return language === "nl"
    ? templates.signOffTemplateNl
    : templates.signOffTemplateEn;
}

export function resolveTemplatesForLanguage(
  templates: EmailReplyTemplateSettings,
  language: EmailReplyLanguage,
): ResolvedEmailReplyTemplates {
  return {
    ...templates,
    greetingTemplate: greetingTemplateForLanguage(templates, language),
    signOffTemplate: signOffTemplateForLanguage(templates, language),
  };
}

const DUTCH_LANGUAGE_MARKERS = new Set([
  "de",
  "het",
  "een",
  "en",
  "van",
  "voor",
  "met",
  "zijn",
  "niet",
  "ook",
  "graag",
  "bedankt",
  "groet",
  "groeten",
  "vriendelijke",
  "beste",
  "geachte",
  "wij",
  "uw",
  "ons",
  "onze",
  "deze",
  "dit",
  "dat",
  "naar",
  "bij",
  "wordt",
  "worden",
  "hebben",
  "heeft",
  "kunnen",
  "moeten",
  "zullen",
  "factuur",
  "bericht",
  "vraag",
  "antwoord",
  "hartelijk",
]);

const ENGLISH_LANGUAGE_MARKERS = new Set([
  "the",
  "and",
  "for",
  "with",
  "this",
  "that",
  "you",
  "your",
  "our",
  "we",
  "will",
  "have",
  "has",
  "please",
  "thank",
  "thanks",
  "regards",
  "hello",
  "hi",
  "dear",
  "invoice",
  "message",
  "question",
  "answer",
  "sincerely",
  "cheers",
]);

/** Pick English vs Dutch greeting/sign-off from email body text. */
export function detectEmailLanguage(
  ...sources: (string | null | undefined)[]
): EmailReplyLanguage {
  const text = sources
    .map((source) => source?.trim())
    .filter(Boolean)
    .join("\n\n");
  if (!text) return "en";

  const normalized = text.toLowerCase();
  const words = normalized.match(/\b[\p{L}']+\b/gu) ?? [];
  let dutchScore = 0;
  let englishScore = 0;

  for (const word of words) {
    if (DUTCH_LANGUAGE_MARKERS.has(word)) dutchScore += 1;
    if (ENGLISH_LANGUAGE_MARKERS.has(word)) englishScore += 1;
  }

  if (
    /\b(met vriendelijke groet|vriendelijke groet|hartelijke groet|geachte heer|geachte mevrouw)\b/i.test(
      normalized,
    )
  ) {
    dutchScore += 4;
  }
  if (/\b(kind regards|best regards|thank you|sincerely|cheers)\b/i.test(normalized)) {
    englishScore += 4;
  }
  if (/\b(bedankt|bedanken|ontvangen|verwerken|toelichting)\b/i.test(normalized)) {
    dutchScore += 2;
  }

  return dutchScore > englishScore ? "nl" : "en";
}

export function renderEmailReplyTemplate(
  template: string,
  vars: { firstName: string; name: string },
): string {
  return template
    .replaceAll("{firstName}", vars.firstName)
    .replaceAll("{name}", vars.name);
}

export function renderEmailReplyShell(
  from: string,
  templates: Pick<
    ResolvedEmailReplyTemplates,
    "greetingTemplate" | "signOffTemplate" | "signOffName"
  >,
): { greeting: string; signOff: string; firstName: string } {
  const firstName = parseSenderFirstName(from);
  const vars = { firstName, name: templates.signOffName };
  return {
    firstName,
    greeting: renderEmailReplyTemplate(templates.greetingTemplate, vars),
    signOff: renderEmailReplyTemplate(templates.signOffTemplate, vars),
  };
}

const GREETING_LINE =
  /^(?:hi|hello|hey|dear|aan|beste|geachte|goedemorgen|goedemiddag|goedenavond)\b[^,\n]{0,80},?\s*$/i;

const SIGN_OFF_LINE =
  /^(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards)(?:,|\s|$)/i;

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripLeadingGreetingLines(body: string): string {
  const lines = body.split("\n");
  while (lines.length > 0 && GREETING_LINE.test(lines[0]?.trim() ?? "")) {
    lines.shift();
  }
  return lines.join("\n").trim();
}

function stripTrailingSignOff(body: string): string {
  let text = body.trim();
  if (!text) return "";

  const blockMatch = text.match(
    /\n+(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards),?\s*\n[\s\S]*$/i,
  );
  if (blockMatch?.index != null) {
    text = text.slice(0, blockMatch.index).trim();
  }

  const inlineSignOff = text.match(
    /(?:^|\n)(?:best|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards|cheers|thanks|sincerely),?\s*\n[\s\S]*$/i,
  );
  if (inlineSignOff?.index != null) {
    text = text.slice(0, inlineSignOff.index).trim();
  }

  const lines = text.split("\n");
  while (lines.length > 0) {
    const line = lines[lines.length - 1]?.trim() ?? "";
    if (!line) {
      lines.pop();
      continue;
    }
    if (SIGN_OFF_LINE.test(line)) {
      lines.pop();
      continue;
    }
    break;
  }
  return lines.join("\n").trim();
}

function stripAssembledEmailShell(body: string): string {
  const match = body.match(
    /^ *(?:hi|hello|hey|dear|aan|beste|geachte)\s+[^,\n]{1,80},?\s*\n+([\s\S]*?)\n+(?:best|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards|cheers|thanks|sincerely),?\s*\n[\s\S]*$/i,
  );
  return match?.[1]?.trim() ?? body;
}

function dedupeSentences(body: string): string {
  const parts =
    body.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g)?.map((part) => part.trim()) ??
    [body.trim()];
  const seen = new Set<string>();
  const kept: string[] = [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index]?.trim();
    if (!part) continue;
    const key = normalizeWhitespace(part).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.unshift(part);
  }

  return kept.join(" ").trim();
}

function isSubstantiveParagraph(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 15) return false;
  if (SIGN_OFF_LINE.test(trimmed)) return false;
  if (GREETING_LINE.test(trimmed)) return false;
  return true;
}

function splitDraftIterations(body: string): string[] {
  return body
    .split(/\n\s*\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanParagraph(block: string): string {
  let text = block.trim();
  if (!text) return "";
  text = stripLeadingGreetingLines(text);
  text = stripTrailingSignOff(text);
  text = text.replace(/^(?:beste|geachte),?\s*\n+/i, "");
  return dedupeSentences(text);
}

/**
 * Normalize agent output to body-only content: no greeting, sign-off, or
 * repeated draft iterations.
 */
export function sanitizeAgentReplyBody(raw: string): string {
  let body = raw.trim();
  if (!body) return "";

  body = stripAssembledEmailShell(body);
  body = stripLeadingGreetingLines(body);
  body = body.replace(/(?:^|\n)(?:aan|beste|geachte),?\s*(?=\n|$)/gi, "\n");
  body = body.replace(/([.!?])\s*(?=Bedankt voor|Wij zijn het niet eens)/g, "$1\n\n");
  body = body.replace(/([A-Za-z])(?=Bedankt voor)/g, "$1\n\n");

  const paragraphs = splitDraftIterations(body)
    .map((part) => cleanParagraph(part))
    .filter(isSubstantiveParagraph);

  const candidate =
    paragraphs.length > 0
      ? paragraphs[paragraphs.length - 1]!
      : cleanParagraph(body);

  return candidate.trim();
}

function extractReplyBodyWithTemplates(
  fullText: string,
  from: string,
  templates: ResolvedEmailReplyTemplates,
): string {
  const trimmed = fullText.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";

  const { greeting, signOff } = renderEmailReplyShell(from, templates);
  let body = trimmed;

  if (body.startsWith(greeting)) {
    body = body.slice(greeting.length).replace(/^\s*\n+/, "");
  }
  if (body.endsWith(signOff)) {
    body = body.slice(0, body.length - signOff.length).replace(/\n+\s*$/, "");
  }

  body = stripTrailingSignOff(body.trim());
  return body.trim();
}

/**
 * Pull editable body text out of a stored draft that includes greeting/sign-off.
 */
export function extractReplyBodyFromAssembled(
  fullText: string,
  from: string,
  templates: EmailReplyTemplateSettings,
): string {
  for (const language of ["en", "nl"] as const) {
    const resolved = resolveTemplatesForLanguage(templates, language);
    const body = extractReplyBodyWithTemplates(fullText, from, resolved);
    if (body) return body;
  }
  return sanitizeAgentReplyBody(fullText.replace(/\r\n/g, "\n").trim());
}

/**
 * Resolve the editable middle of a stored draft, even when template shells drift
 * (e.g. sign-off name changed after the draft was saved).
 */
export function resolveEditableDraftBody(
  fullText: string,
  from: string,
  templates: EmailReplyTemplateSettings,
): string {
  const trimmed = fullText.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";
  const extracted = extractReplyBodyFromAssembled(trimmed, from, templates).trim();
  if (extracted) return extracted;
  return sanitizeAgentReplyBody(trimmed);
}

export type AssembledReplyEmail = {
  to: string[];
  subject: string;
  text: string;
  body: string;
  greeting: string;
  signOff: string;
};

export type AssembledComposeEmail = AssembledReplyEmail;

function normalizeComposeRecipients(to: string | string[]): string[] {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((entry) => parseReplyToAddress(entry))
    .filter((address) => address.includes("@"));
}

/** First name for greeting — uses the primary recipient. */
export function parseRecipientFirstName(to: string): string {
  return parseSenderFirstName(to);
}

export function renderEmailComposeShell(
  to: string,
  templates: Pick<
    ResolvedEmailReplyTemplates,
    "greetingTemplate" | "signOffTemplate" | "signOffName"
  >,
): { greeting: string; signOff: string; firstName: string } {
  const firstName = parseRecipientFirstName(to);
  const vars = { firstName, name: templates.signOffName };
  return {
    firstName,
    greeting: renderEmailReplyTemplate(templates.greetingTemplate, vars),
    signOff: renderEmailReplyTemplate(templates.signOffTemplate, vars),
  };
}

/**
 * Wrap agent body-only output into a sendable plain-text reply.
 * Greeting + sign-off come from workspace settings — not agent-generated.
 */
export function assembleReplyEmail(input: {
  from: string;
  subject: string;
  body: string;
  templates?: Partial<
    EmailReplyTemplateSettings & {
      greetingTemplate?: string;
      signOffTemplate?: string;
    }
  > | null;
  languageHint?: EmailReplyLanguage;
  /** Extra text for language detection (e.g. the incoming message). */
  contextText?: string | null;
}): AssembledReplyEmail {
  const baseTemplates = resolveEmailReplyTemplates(input.templates);
  const language =
    input.languageHint ??
    detectEmailLanguage(input.body, input.contextText);
  const templates = resolveTemplatesForLanguage(baseTemplates, language);
  const body = sanitizeAgentReplyBody(input.body);
  const { greeting, signOff } = renderEmailReplyShell(input.from, templates);
  const text = [greeting, "", body, "", signOff].join("\n");
  return {
    to: [parseReplyToAddress(input.from)],
    subject: replySubject(input.subject),
    text,
    body,
    greeting,
    signOff,
  };
}

/**
 * Wrap agent body-only output into a sendable plain-text new email.
 * Greeting + sign-off come from workspace settings — not agent-generated.
 */
export function assembleComposeEmail(input: {
  to: string | string[];
  subject: string;
  body: string;
  templates?: Partial<
    EmailReplyTemplateSettings & {
      greetingTemplate?: string;
      signOffTemplate?: string;
    }
  > | null;
  languageHint?: EmailReplyLanguage;
}): AssembledComposeEmail {
  const baseTemplates = resolveEmailReplyTemplates(input.templates);
  const language = input.languageHint ?? detectEmailLanguage(input.body);
  const templates = resolveTemplatesForLanguage(baseTemplates, language);
  const body = sanitizeAgentReplyBody(input.body);
  const toAddresses = normalizeComposeRecipients(input.to);
  const primaryTo = Array.isArray(input.to)
    ? (input.to[0]?.trim() ?? "")
    : input.to.trim();
  const { greeting, signOff } = renderEmailComposeShell(primaryTo, templates);
  const text = [greeting, "", body, "", signOff].join("\n");
  return {
    to: toAddresses,
    subject: input.subject.trim() || "(no subject)",
    text,
    body,
    greeting,
    signOff,
  };
}

/** Escape plain text for a multipart HTML alternative that preserves line breaks. */
export function plainTextEmailToHtml(text: string): string {
  return escapeEmailHtml(text).replace(/\n/g, "<br>\n");
}

function escapeEmailHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Content-ID for the inbox contact avatar shown beside the sign-off. */
export const EMAIL_SIGN_OFF_AVATAR_CID = "backsteros-signoff-avatar";

/**
 * HTML alternative matching the compose UI: greeting + body, then a
 * sign-off footer with optional circular avatar to the left of the text.
 */
export function assembleEmailHtml(
  assembled: Pick<AssembledReplyEmail, "greeting" | "body" | "signOff">,
  options?: { signOffAvatarCid?: string | null },
): string {
  const greetingHtml = escapeEmailHtml(assembled.greeting).replace(
    /\n/g,
    "<br>\n",
  );
  const bodyHtml = escapeEmailHtml(assembled.body).replace(/\n/g, "<br>\n");
  const signOffHtml = escapeEmailHtml(assembled.signOff).replace(/\n/g, "<br>\n");
  const cid = options?.signOffAvatarCid?.trim() || null;

  const footer = cid
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:middle;padding-right:16px">
      <img src="cid:${cid}" width="96" height="96" alt="" style="display:block;border:1px solid #dddddd;border-radius:9999px;width:96px;height:96px;object-fit:cover" />
    </td>
    <td style="vertical-align:middle;font-size:14px;line-height:1.55;color:#444444">${signOffHtml}</td>
  </tr>
</table>`
    : `<div style="margin-top:4px;font-size:14px;line-height:1.55;color:#444444">${signOffHtml}</div>`;

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px;line-height:1.55;color:#222222">${greetingHtml}<br>\n<br>\n${bodyHtml}<br>\n<br>\n${footer}</div>`;
}
