/** Extract bare email from `Name <user@example.com>` or plain address. */
export function parseReplyToAddress(from: string): string {
  const trimmed = from.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  if (angle?.[1]) return angle[1].trim();
  if (trimmed.includes("@")) return trimmed;
  return trimmed;
}

function capitalizePersonNameToken(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "there") return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

const ROLE_LOCAL_PARTS = new Set([
  "info", "admin", "noreply", "no-reply", "donotreply", "do-not-reply",
  "financials", "invoices", "billing", "accounts", "support", "hello",
  "team", "contact", "office", "sales", "mail", "postmaster", "webmaster",
  "help", "service", "notifications", "notify", "newsletter", "orders",
  "receipt", "booking",
]);

export function isPersonalFirstNameLocalPart(localPart: string): boolean {
  const segment = localPart.split(/[._-]/)[0]?.trim() ?? "";
  if (segment.length < 2 || segment.length > 20) return false;
  if (!/^[A-Za-z]+$/.test(segment)) return false;
  if (ROLE_LOCAL_PARTS.has(segment.toLowerCase())) return false;
  return true;
}

export function parseSenderFirstName(from: string): string {
  const trimmed = from.trim();
  if (!trimmed) return "";
  if (trimmed.includes("<")) {
    const display = trimmed.slice(0, trimmed.indexOf("<")).trim();
    const first = display.split(/\s+/).filter(Boolean)[0] ?? "";
    return capitalizePersonNameToken(first);
  }
  if (trimmed.includes("@")) {
    const local = trimmed.split("@")[0] ?? "";
    const segment = local.split(/[._-]/)[0] ?? "";
    if (!isPersonalFirstNameLocalPart(segment)) return "";
    return capitalizePersonNameToken(segment);
  }
  const first = trimmed.split(/\s+/).filter(Boolean)[0] ?? "";
  return capitalizePersonNameToken(first);
}

export const NAMELESS_EMAIL_GREETING_EN = "Hello,";
export const NAMELESS_EMAIL_GREETING_NL = "Goedendag,";

export function namelessGreetingForTemplate(greetingTemplate: string): string {
  const opener = greetingTemplate.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (opener in { aan: 1, beste: 1, geachte: 1, goedendag: 1 }) {
    return NAMELESS_EMAIL_GREETING_NL;
  }
  return NAMELESS_EMAIL_GREETING_EN;
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
  "ik",
  "aan",
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
  "zojuist",
  "begrepen",
  "boekingsregel",
  "factuurbedrag",
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
  const greeting = firstName
    ? renderEmailReplyTemplate(templates.greetingTemplate, vars)
    : namelessGreetingForTemplate(templates.greetingTemplate);
  return {
    firstName,
    greeting,
    signOff: renderEmailReplyTemplate(templates.signOffTemplate, vars),
  };
}

const GREETING_LINE =
  /^(?:hi|hello|hey|dear|aan|beste|geachte|goedendag|goedemorgen|goedemiddag|goedenavond|to)\b[^,\n]{0,80},?\s*$/i;

// Whole-line sign-offs only ("Thank you," / "Best regards,") — never
// "Thank you for your interest…" body sentences.
const SIGN_OFF_LINE =
  /^(?:best|thanks|thank you|sincerely|regards|cheers|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards),?\s*$/i;

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
  // Named greetings require a name token so bare "Beste," mid-agent iterations
  // are not mistaken for a full shelled draft.
  const named = body.match(
    /^ *(?:hi|hello|hey|dear|aan|beste|geachte|to)\s+[^,\n]{1,80},?\s*\n+([\s\S]*?)\n+(?:best|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards|cheers|thanks|sincerely),?\s*\n[\s\S]*$/i,
  );
  if (named?.[1]) return named[1].trim();
  const nameless = body.match(
    /^ *(?:hello|goedendag),?\s*\n+([\s\S]*?)\n+(?:best|groeten|met vriendelijke groet|vriendelijke groet|hartelijke groet|mvg|kind regards|best regards|cheers|thanks|sincerely),?\s*\n[\s\S]*$/i,
  );
  return nameless?.[1]?.trim() ?? body;
}

export function splitIntoSentences(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  return trimmed
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dedupeSentences(body: string): string {
  const parts = splitIntoSentences(body);
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

function lightCleanAgentReplyBody(raw: string): string {
  return stripTrailingSignOff(stripLeadingGreetingLines(raw.trim()));
}

function nonWhitespaceLength(text: string): number {
  return text.replace(/\s+/g, "").length;
}

function sanitizeLostNonShellText(raw: string, sanitized: string): boolean {
  const base = lightCleanAgentReplyBody(stripAssembledEmailShell(raw.trim()));
  if (!base) return false;
  const blocks = splitDraftIterations(base).filter((part) => part.length >= 15);
  if (blocks.length >= 2) {
    if (/^\d+[.)]\s/.test(sanitized.trim())) return true;
    return false;
  }
  const expected = dedupeSentences(base);
  const expectedChars = nonWhitespaceLength(expected);
  if (expectedChars < 8) return false;
  return nonWhitespaceLength(sanitized) < expectedChars * 0.85;
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
 * repeated draft iterations. Never returns a truncated body.
 */
export function sanitizeAgentReplyBody(raw: string): string {
  let body = raw.trim();
  if (!body) return "";

  const light = lightCleanAgentReplyBody(stripAssembledEmailShell(body));

  body = stripAssembledEmailShell(body);
  body = stripLeadingGreetingLines(body);
  body = body.replace(/(?:^|\n)(?:aan|beste|geachte|to|hello|goedendag),?\s*(?=\n|$)/gi, "\n");
  body = body.replace(/([.!?])\s*(?=Bedankt voor|Wij zijn het niet eens)/g, "$1\n\n");
  body = body.replace(/([A-Za-z])(?=Bedankt voor)/g, "$1\n\n");

  const paragraphs = splitDraftIterations(body)
    .map((part) => cleanParagraph(part))
    .filter(isSubstantiveParagraph);

  let sanitized: string;
  if (paragraphs.length === 0) {
    sanitized = cleanParagraph(body).trim();
  } else if (paragraphs.length === 1) {
    sanitized = paragraphs[0]!.trim();
  } else if (paragraphsLookLikeAgentIterations(paragraphs)) {
    sanitized = paragraphs[paragraphs.length - 1]!.trim();
  } else {
    sanitized = paragraphs.join("\n\n").trim();
  }

  if (!sanitized) return light;
  if (sanitizeLostNonShellText(raw, sanitized)) return light;
  return sanitized;
}

function paragraphsLookLikeAgentIterations(paragraphs: string[]): boolean {
  const last = normalizeWhitespace(paragraphs[paragraphs.length - 1] ?? "").toLowerCase();
  if (!last) return true;
  for (let index = 0; index < paragraphs.length - 1; index += 1) {
    const earlier = normalizeWhitespace(paragraphs[index] ?? "").toLowerCase();
    if (!earlier) continue;
    if (earlier === last || last.includes(earlier) || earlier.includes(last)) {
      return true;
    }
    const earlierWords = new Set(
      earlier.split(/\s+/).filter((word) => word.length > 4),
    );
    let sharedLongWords = 0;
    for (const word of last.split(/\s+/)) {
      if (word.length > 4 && earlierWords.has(word)) sharedLongWords += 1;
    }
    if (sharedLongWords >= 3) return true;
  }
  return false;
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
  const trimmed = fullText.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return "";

  for (const language of ["en", "nl"] as const) {
    const resolved = resolveTemplatesForLanguage(templates, language);
    const { greeting, signOff } = renderEmailReplyShell(from, resolved);
    // Template shell matched (even with an empty middle) — do not fall through
    // to sanitize, which can promote the greeting line into a fake body.
    if (trimmed.startsWith(greeting) && trimmed.endsWith(signOff)) {
      return extractReplyBodyWithTemplates(trimmed, from, resolved);
    }
    const body = extractReplyBodyWithTemplates(trimmed, from, resolved);
    if (body) return body;
  }
  return sanitizeAgentReplyBody(trimmed);
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

  for (const language of ["en", "nl"] as const) {
    const resolved = resolveTemplatesForLanguage(templates, language);
    const { greeting, signOff } = renderEmailReplyShell(from, resolved);
    if (trimmed.startsWith(greeting) && trimmed.endsWith(signOff)) {
      // Shell matched — empty middle stays empty (don't sanitize the greeting
      // line into a fake body).
      return extractReplyBodyWithTemplates(trimmed, from, resolved);
    }
  }

  const extracted = extractReplyBodyFromAssembled(trimmed, from, templates).trim();
  if (extracted) return extracted;
  return sanitizeAgentReplyBody(trimmed);
}

export type AssembledReplyEmail = {
  to: string[];
  cc: string[];
  subject: string;
  text: string;
  body: string;
  greeting: string;
  signOff: string;
};

export type AssembledComposeEmail = AssembledReplyEmail;

/**
 * Split a comma/semicolon recipient field into display strings.
 * Commas inside quotes or angle brackets are kept
 * (`"Lovelace, Ada" <a@b.com>` stays one entry).
 */
export function splitRecipientField(raw: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  let inAngle = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]!;
    if (ch === '"' && !inAngle) {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (ch === "<" && !inQuotes) {
      inAngle = true;
      current += ch;
      continue;
    }
    if (ch === ">" && !inQuotes) {
      inAngle = false;
      current += ch;
      continue;
    }
    if ((ch === "," || ch === ";") && !inQuotes && !inAngle) {
      const trimmed = current.trim();
      if (trimmed) out.push(trimmed);
      current = "";
      continue;
    }
    current += ch;
  }
  const trimmed = current.trim();
  if (trimmed) out.push(trimmed);
  return out;
}

/**
 * Normalize To/Cc into bare-address list (deduped, order preserved).
 * Accepts a single string, comma-separated string, or string array.
 */
export function normalizeComposeRecipients(
  to: string | string[] | null | undefined,
): string[] {
  if (to == null) return [];
  const list = Array.isArray(to)
    ? to.flatMap((entry) => splitRecipientField(entry))
    : splitRecipientField(to);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of list) {
    const address = parseReplyToAddress(entry);
    if (!address.includes("@")) continue;
    const key = address.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(address);
  }
  return out;
}

const EMAIL_ADDRESS_RE =
  /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** True when a header string contains CR or LF (header-injection risk). */
export function emailHeaderContainsLineBreak(value: string): boolean {
  return /[\r\n]/.test(value);
}

/**
 * Prefer a display-name form for greetings (`Ada Lovelace <a@…>` → Ada).
 * Falls back to the bare normalized address only when no display form exists.
 */
export function greetingPartyFromRecipients(
  preferred: string | string[] | null | undefined,
  normalizedAddresses: readonly string[],
  fallback = "",
): string {
  const rawList =
    preferred == null
      ? []
      : Array.isArray(preferred)
        ? preferred.flatMap((entry) => splitRecipientField(entry))
        : splitRecipientField(preferred);
  const withDisplayName = rawList.find(
    (entry) => entry.includes("<") && entry.includes("@"),
  )?.trim();
  if (withDisplayName) return withDisplayName;

  const firstRaw = rawList[0]?.trim() || "";
  const primaryAddress = (
    normalizedAddresses[0] || parseReplyToAddress(firstRaw)
  ).toLowerCase();
  // Stored drafts often keep bare To addresses; recover the display name from
  // the original From when it is the same mailbox.
  const fallbackTrimmed = fallback.trim();
  if (fallbackTrimmed.includes("<") && primaryAddress) {
    const fallbackAddress = parseReplyToAddress(fallbackTrimmed).toLowerCase();
    if (fallbackAddress === primaryAddress) return fallbackTrimmed;
  }
  if (firstRaw) return firstRaw;
  if (fallbackTrimmed) return fallbackTrimmed;
  return normalizedAddresses[0] || "";
}

/**
 * Validate draft header fields. Throws Error with a user-facing message on
 * CR/LF, empty To, or invalid address shape. Non-empty invalid entries are
 * rejected (not silently dropped).
 */
export function assertValidEmailDraftHeaders(input: {
  to?: string | string[] | null;
  cc?: string | string[] | null;
  subject?: string | null;
  /** When true, empty To is an error (create / explicit set). */
  requireTo?: boolean;
}): void {
  const checkField = (
    label: string,
    value: string | string[] | null | undefined,
    options?: { allowEmpty?: boolean },
  ) => {
    if (value == null) return;
    const parts = Array.isArray(value)
      ? value.flatMap((entry) => splitRecipientField(entry))
      : splitRecipientField(value);
    if (parts.length === 0) {
      if (options?.allowEmpty === false) {
        throw new Error(`${label} requires at least one valid email address.`);
      }
      return;
    }
    for (const part of parts) {
      if (emailHeaderContainsLineBreak(part)) {
        throw new Error(`${label} must not contain line breaks.`);
      }
      const address = parseReplyToAddress(part);
      if (!address.includes("@") || !EMAIL_ADDRESS_RE.test(address)) {
        throw new Error(`Invalid ${label} address: ${part}`);
      }
    }
  };

  if (input.subject != null && emailHeaderContainsLineBreak(input.subject)) {
    throw new Error("Subject must not contain line breaks.");
  }
  if (input.cc !== undefined) {
    checkField("Cc", input.cc, { allowEmpty: true });
  }
  if (input.to === undefined) return;
  checkField("To", input.to, {
    allowEmpty: input.requireTo === false,
  });
  if (input.requireTo !== false) {
    const to = normalizeComposeRecipients(input.to);
    if (to.length === 0) {
      throw new Error("To requires at least one valid email address.");
    }
  }
}

export function isNonReplyableEmailAddress(
  address: string | null | undefined,
): boolean {
  const addr = parseReplyToAddress(address ?? "").toLowerCase();
  if (!addr.includes("@")) return false;
  const at = addr.lastIndexOf("@");
  const local = addr.slice(0, at);
  const host = addr.slice(at + 1);
  if (/(^|\.)inkomend\.moneybird\.nl$/.test(host)) return true;
  const localHead = local.split(/[.+]/)[0] ?? local;
  return (
    localHead === "noreply" ||
    localHead === "no-reply" ||
    localHead === "donotreply" ||
    localHead === "do-not-reply"
  );
}

export function filterReplyableEmailAddresses(
  addresses: readonly string[],
): string[] {
  return addresses.filter((address) => !isNonReplyableEmailAddress(address));
}

export const NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE =
  "This thread was sent to a Moneybird import address; there is no reply recipient.";

export function assertHasReplyableConceptRecipient(
  to: readonly string[],
): void {
  if (filterReplyableEmailAddresses(to).length > 0) return;
  throw new Error(NO_REPLYABLE_CONCEPT_RECIPIENT_MESSAGE);
}

export function correctSelfOnlyTo(
  to: readonly string[],
  inboxEmail: string | null | undefined,
  externalParty: string | string[] | null | undefined,
): string[] {
  const ours = inboxEmail?.trim().toLowerCase() || null;
  if (!ours || to.length !== 1) return [...to];
  if (to[0]!.toLowerCase() !== ours) return [...to];
  const external = filterReplyableEmailAddresses(
    normalizeComposeRecipients(externalParty ?? ""),
  );
  return external.length > 0 ? external : [...to];
}

export type MergedEmailDraftHeaders = {
  to: string[];
  cc: string[];
  subject: string;
};

/**
 * Merge a PATCH onto stored draft headers.
 * - Empty subject keeps stored subject.
 * - Empty To keeps stored To (never wipe with []).
 * - Explicit `cc` (including []) replaces stored Cc; omit keeps it.
 */
export function mergeEmailDraftHeaders(input: {
  patch: {
    to?: string | string[] | null;
    cc?: string | string[] | null;
    subject?: string | null;
  };
  storedTo: readonly string[];
  storedCc: readonly string[];
  storedSubject: string;
  /** Used when both patch and stored To are empty. */
  fallbackTo?: string | string[] | null;
  inboxEmail?: string | null;
}): MergedEmailDraftHeaders {
  const storedSubject = input.storedSubject.trim();
  const patchSubject = (input.patch.subject ?? "").trim();
  const subject =
    input.patch.subject !== undefined && patchSubject
      ? patchSubject
      : storedSubject;

  let to =
    input.patch.to !== undefined
      ? normalizeComposeRecipients(input.patch.to)
      : [...input.storedTo];
  if (to.length === 0) {
    to = [...input.storedTo];
  }
  to = correctSelfOnlyTo(to, input.inboxEmail, input.fallbackTo);
  if (to.length === 0) {
    to = filterReplyableEmailAddresses(
      normalizeComposeRecipients(input.fallbackTo ?? ""),
    );
  }
  const replyableTo = filterReplyableEmailAddresses(to);
  if (replyableTo.length > 0) to = replyableTo;

  const cc =
    input.patch.cc !== undefined
      ? normalizeComposeRecipients(input.patch.cc)
      : [...input.storedCc];

  return { to, cc, subject };
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
  return renderEmailReplyShell(to, templates);
}

/**
 * Wrap agent body-only output into a sendable plain-text reply.
 * Greeting + sign-off come from workspace settings — not agent-generated.
 */
export function assembleReplyEmail(input: {
  from: string;
  subject: string;
  body: string;
  /** Override To (defaults to the reply party in `from`). */
  to?: string | string[] | null;
  cc?: string | string[] | null;
  templates?: Partial<
    EmailReplyTemplateSettings & {
      greetingTemplate?: string;
      signOffTemplate?: string;
    }
  > | null;
  languageHint?: EmailReplyLanguage;
  /** Extra text for language detection (e.g. the incoming message). */
  contextText?: string | null;
  /** When true, do not run agent sanitizer (stored user edits / send path). */
  preserveBody?: boolean;
  /**
   * When true, use `subject` as-is (user-edited). When false/omitted, prefix
   * `Re:` like a fresh reply to the parent subject.
   */
  preserveSubject?: boolean;
}): AssembledReplyEmail {
  const baseTemplates = resolveEmailReplyTemplates(input.templates);
  const language =
    input.languageHint ??
    detectEmailLanguage(input.body, input.contextText);
  const templates = resolveTemplatesForLanguage(baseTemplates, language);
  const rawBody = input.body.trim();
  const sanitized = input.preserveBody ? rawBody : sanitizeAgentReplyBody(rawBody);
  const body =
    sanitized ||
    (rawBody ? lightCleanAgentReplyBody(rawBody) : "");
  const to =
    input.to != null
      ? normalizeComposeRecipients(input.to)
      : normalizeComposeRecipients(input.from);
  const cc = normalizeComposeRecipients(input.cc).filter(
    (address) => !to.some((entry) => entry.toLowerCase() === address.toLowerCase()),
  );
  // Prefer To (or From) raw form; fall back to `from` display name when To is bare.
  const greetingParty = greetingPartyFromRecipients(
    input.to != null ? input.to : input.from,
    to,
    input.from,
  );
  const { greeting, signOff } = renderEmailReplyShell(greetingParty, templates);
  const text = [greeting, "", body, "", signOff].join("\n");
  return {
    to,
    cc,
    subject: input.preserveSubject
      ? input.subject.trim() || "(no subject)"
      : replySubject(input.subject),
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
  cc?: string | string[] | null;
  subject: string;
  body: string;
  templates?: Partial<
    EmailReplyTemplateSettings & {
      greetingTemplate?: string;
      signOffTemplate?: string;
    }
  > | null;
  languageHint?: EmailReplyLanguage;
  preserveBody?: boolean;
}): AssembledComposeEmail {
  const baseTemplates = resolveEmailReplyTemplates(input.templates);
  const language = input.languageHint ?? detectEmailLanguage(input.body);
  const templates = resolveTemplatesForLanguage(baseTemplates, language);
  const rawBody = input.body.trim();
  const sanitized = input.preserveBody ? rawBody : sanitizeAgentReplyBody(rawBody);
  const body =
    sanitized ||
    (rawBody ? lightCleanAgentReplyBody(rawBody) : "");
  const toAddresses = normalizeComposeRecipients(input.to);
  const ccAddresses = normalizeComposeRecipients(input.cc).filter(
    (address) =>
      !toAddresses.some((entry) => entry.toLowerCase() === address.toLowerCase()),
  );
  const primaryTo = greetingPartyFromRecipients(input.to, toAddresses, "");
  const { greeting, signOff } = renderEmailComposeShell(primaryTo, templates);
  const text = [greeting, "", body, "", signOff].join("\n");
  return {
    to: toAddresses,
    cc: ccAddresses,
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

function isReplyableExternalAddress(raw: string, ours: string | null): boolean {
  const addr = parseReplyToAddress(raw).toLowerCase();
  if (!addr.includes("@")) return false;
  if (ours && addr === ours) return false;
  if (isNonReplyableEmailAddress(addr)) return false;
  return true;
}

export function resolveReplyPartyFromMessage(
  message: { from: string; to?: string[] | null; cc?: string[] | null },
  inboxEmail: string | null | undefined,
  threadMessages?: readonly {
    from: string;
    to?: string[] | null;
    cc?: string[] | null;
  }[],
): string {
  const ours = inboxEmail?.trim().toLowerCase() || null;
  const fromAddr = parseReplyToAddress(message.from).toLowerCase();
  if (ours && fromAddr === ours) {
    for (const raw of message.to ?? []) {
      if (isReplyableExternalAddress(raw, ours)) return raw;
    }
    for (const raw of message.cc ?? []) {
      if (isReplyableExternalAddress(raw, ours)) return raw;
    }
    for (const entry of threadMessages ?? []) {
      if (isReplyableExternalAddress(entry.from, ours)) return entry.from;
      for (const raw of [...(entry.to ?? []), ...(entry.cc ?? [])]) {
        if (isReplyableExternalAddress(raw, ours)) return raw;
      }
    }
    return "";
  }
  if (isNonReplyableEmailAddress(message.from)) return "";
  return message.from;
}

function lineMatchesSignOffName(line: string, name: string): boolean {
  if (line === name) return true;
  // Allow a title / rest of the line after the name ("Remon de Vries").
  if (
    line.startsWith(name) &&
    line.length > name.length &&
    /\s/.test(line.charAt(name.length))
  ) {
    return true;
  }
  return false;
}

function signOffOpenerLines(options?: {
  signOffTemplateEn?: string | null;
  signOffTemplateNl?: string | null;
} | null): Set<string> {
  const openers = new Set<string>();
  for (const template of [
    options?.signOffTemplateEn?.trim() || DEFAULT_EMAIL_REPLY_SIGN_OFF_EN,
    options?.signOffTemplateNl?.trim() || DEFAULT_EMAIL_REPLY_SIGN_OFF_NL,
  ]) {
    const first =
      template.replace(/\r\n/g, "\n").split("\n")[0]?.trim() ?? "";
    if (first) openers.add(first.toLowerCase());
  }
  return openers;
}

/**
 * True when AgentMail already stores greeting/sign-off (or HTML).
 * Send must use those stored bytes and must not reassemble.
 * Empty text + non-empty HTML counts as shelled (HTML-only drafts).
 * An empty/blank signOffName never matches via substring.
 * A name line that follows a sign-off opener anywhere in the body counts
 * (trailing P.S. / title lines after the name are OK).
 */
export function draftHasStoredShell(
  text: string | null | undefined,
  html: string | null | undefined,
  signOffName: string,
  options?: {
    signOffTemplateEn?: string | null;
    signOffTemplateNl?: string | null;
  } | null,
): boolean {
  const storedText = (text ?? "").replace(/\r\n/g, "\n").trim();
  const storedHtml = (html ?? "").trim();
  if (storedHtml) return true;
  if (!storedText) return false;
  const name = signOffName.trim();
  if (!name) return false;
  // Prefer a sign-off opener + name line over a bare name mention
  // ("Remon calls you"). Trailing P.S. after the name is fine.
  const lines = storedText.split("\n").map((line) => line.trim());
  const openers = signOffOpenerLines(options);
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i] ?? "";
    if (!line || !openers.has(line.toLowerCase())) continue;
    const next = lines[i + 1] ?? "";
    if (next && lineMatchesSignOffName(next, name)) return true;
  }
  const lastNonEmpty = [...lines].reverse().find(Boolean) ?? "";
  if (lastNonEmpty === name) return true;
  if (storedText.endsWith(`\n${name}`)) return true;
  return false;
}

export type DraftSendBodyPlan =
  | {
      kind: "use_stored";
      /** Exact plain text AgentMail already holds — send unchanged. */
      text: string;
      /** Exact HTML AgentMail already holds when present. */
      html: string | null;
    }
  | { kind: "reassemble" };

/**
 * Pure send-path decision: keep stored draft bytes, or rebuild shell.
 * Callers that get `use_stored` must not rewrite text/html before sendDraft.
 */
export function planDraftSendBodies(input: {
  text: string | null | undefined;
  html: string | null | undefined;
  signOffName: string;
  signOffTemplateEn?: string | null;
  signOffTemplateNl?: string | null;
}): DraftSendBodyPlan {
  const text = (input.text ?? "").replace(/\r\n/g, "\n").trim();
  const rawHtml = input.html ?? null;
  const html = rawHtml?.trim() ? rawHtml : null;
  if (
    draftHasStoredShell(text, html, input.signOffName, {
      signOffTemplateEn: input.signOffTemplateEn,
      signOffTemplateNl: input.signOffTemplateNl,
    })
  ) {
    return { kind: "use_stored", text, html };
  }
  return { kind: "reassemble" };
}

function normalizeParagraphForLossCheck(paragraph: string): string {
  return paragraph.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * After reassembly, the shelled text must still contain the user's editable
 * body unchanged (one-word edits and deleted paragraphs are allowed).
 */
export function assertAssembledPreservesEditableBody(
  assembledText: string,
  editableBody: string,
): void {
  const body = editableBody.replace(/\r\n/g, "\n").trim();
  if (!body) return;
  const text = assembledText.replace(/\r\n/g, "\n");
  if (!text.includes(body)) {
    throw new Error(
      "Draft body would lose text when assembling for send. Edit the concept in the app and try again.",
    );
  }
}

/** Reject send/update when re-assembly would drop a large share of stored text. */
export function assertNoDraftBodyLoss(
  storedText: string,
  nextText: string,
): void {
  const stored = storedText.replace(/\r\n/g, "\n").trim();
  const next = nextText.replace(/\r\n/g, "\n").trim();
  if (!stored) return;

  const storedChars = stored.replace(/\s+/g, "").length;
  const nextChars = next.replace(/\s+/g, "").length;
  const lengthOk =
    next.length >= stored.length * 0.85 ||
    storedChars < 40 ||
    nextChars >= storedChars * 0.85;
  if (!lengthOk) {
    throw new Error(
      "Draft body would lose text when assembling for send. Edit the concept in the app and try again.",
    );
  }

  // Length can stay high when greeting/sign-off are added while a middle
  // paragraph vanishes — require multi-paragraph bodies to keep each block.
  const storedParagraphs = stored
    .split(/\n\s*\n+/)
    .map(normalizeParagraphForLossCheck)
    .filter((paragraph) => paragraph.length >= 15);
  if (storedParagraphs.length < 2) return;
  const nextNormalized = normalizeParagraphForLossCheck(next);
  if (
    storedParagraphs.every((paragraph) => nextNormalized.includes(paragraph))
  ) {
    return;
  }
  throw new Error(
    "Draft body would lose text when assembling for send. Edit the concept in the app and try again.",
  );
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
