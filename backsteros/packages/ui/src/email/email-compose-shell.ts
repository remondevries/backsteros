/**
 * Client-side letter shell for new-email compose — greeting + sign-off from
 * workspace templates, without waiting for a server draft.
 */

export type EmailComposeShellLanguage = "en" | "nl";

export type EmailComposeReplyTemplates = {
  greetingTemplateEn: string;
  greetingTemplateNl: string;
  signOffTemplateEn: string;
  signOffTemplateNl: string;
};

export const DEFAULT_COMPOSE_GREETING_EN = "To {firstName},";
export const DEFAULT_COMPOSE_GREETING_NL = "Aan {firstName},";
export const DEFAULT_COMPOSE_SIGN_OFF_EN = "Best,\n{name}";
export const DEFAULT_COMPOSE_SIGN_OFF_NL = "Met vriendelijke groet,\n{name}";
export const DEFAULT_COMPOSE_SIGN_OFF_NAME = "Remon";
/** Placeholder until the To party is linked to a contact or organization. */
export const COMPOSE_UNKNOWN_FIRST_NAME = "Unknown";

function languageFromCodes(
  codes?: readonly string[] | null,
): EmailComposeShellLanguage | null {
  for (const raw of codes ?? []) {
    const code = raw.trim().toLowerCase();
    if (code === "nl" || code.startsWith("nl-") || code.startsWith("nl_")) {
      return "nl";
    }
    if (code === "en" || code.startsWith("en-") || code.startsWith("en_")) {
      return "en";
    }
  }
  return null;
}

/**
 * Default language from the From mailbox: `.nl` → Dutch, otherwise English
 * (including `.com`).
 */
export function languageFromMailboxEmail(
  fromEmailAddress?: string | null,
): EmailComposeShellLanguage {
  const email = fromEmailAddress?.trim().toLowerCase() ?? "";
  const at = email.lastIndexOf("@");
  const host = at >= 0 ? email.slice(at + 1) : email;
  if (host === "nl" || host.endsWith(".nl")) return "nl";
  return "en";
}

export type PickComposeShellLanguageInput = {
  /** To-contact preferred languages — first matching `nl`/`en` wins. */
  contactLanguages?: readonly string[] | null;
  /**
   * To-organization preferred languages when no contact language is set.
   * Organizations do not store languages yet; pass when available.
   */
  organizationLanguages?: readonly string[] | null;
  /** From mailbox address — `.nl` → Dutch, else English. */
  fromEmailAddress?: string | null;
};

/**
 * Compose shell language:
 * 1. Contact languages (first preferred item that is nl/en)
 * 2. Else organization languages (same)
 * 3. Else From mailbox TLD (`.nl` → nl, otherwise en)
 *
 * Also accepts a bare language-code array (legacy) — treated as contact languages.
 */
export function pickComposeShellLanguage(
  input?: PickComposeShellLanguageInput | readonly string[] | null,
): EmailComposeShellLanguage {
  if (input == null) {
    return languageFromMailboxEmail(null);
  }
  if (Array.isArray(input)) {
    return languageFromCodes(input) ?? "en";
  }
  if (
    typeof input === "object" &&
    ("contactLanguages" in input ||
      "organizationLanguages" in input ||
      "fromEmailAddress" in input)
  ) {
    return (
      languageFromCodes(input.contactLanguages) ??
      languageFromCodes(input.organizationLanguages) ??
      languageFromMailboxEmail(input.fromEmailAddress)
    );
  }
  return "en";
}

export function resolveComposeReplyTemplates(
  settings?: Partial<EmailComposeReplyTemplates> | null,
): EmailComposeReplyTemplates {
  return {
    greetingTemplateEn:
      settings?.greetingTemplateEn?.trim() || DEFAULT_COMPOSE_GREETING_EN,
    greetingTemplateNl:
      settings?.greetingTemplateNl?.trim() || DEFAULT_COMPOSE_GREETING_NL,
    signOffTemplateEn:
      settings?.signOffTemplateEn?.trim() || DEFAULT_COMPOSE_SIGN_OFF_EN,
    signOffTemplateNl:
      settings?.signOffTemplateNl?.trim() || DEFAULT_COMPOSE_SIGN_OFF_NL,
  };
}

function renderTemplate(
  template: string,
  vars: { firstName: string; name: string },
): string {
  return template
    .replaceAll("{firstName}", vars.firstName)
    .replaceAll("{name}", vars.name);
}

/**
 * First token of a contact display name ( foregoes email-local heuristics ).
 */
export function composeContactFirstName(
  name: string | null | undefined,
): string | null {
  const first = name?.trim().split(/\s+/).filter(Boolean)[0] ?? "";
  return first || null;
}

/**
 * Preview greeting + sign-off for compose. Uses `Unknown` when no To contact
 * first name / organization name is available yet.
 */
export function renderComposePreviewShell(input: {
  templates: EmailComposeReplyTemplates;
  language: EmailComposeShellLanguage;
  /** Contact first name, organization name, or null → Unknown. */
  firstName?: string | null;
  signOffName: string;
}): { greeting: string; signOff: string } {
  const firstName =
    input.firstName?.trim() || COMPOSE_UNKNOWN_FIRST_NAME;
  const name = input.signOffName.trim() || DEFAULT_COMPOSE_SIGN_OFF_NAME;
  const greetingTemplate =
    input.language === "nl"
      ? input.templates.greetingTemplateNl
      : input.templates.greetingTemplateEn;
  const signOffTemplate =
    input.language === "nl"
      ? input.templates.signOffTemplateNl
      : input.templates.signOffTemplateEn;
  const vars = { firstName, name };
  return {
    greeting: renderTemplate(greetingTemplate, vars),
    signOff: renderTemplate(signOffTemplate, vars),
  };
}

/**
 * Join greeting + core body + sign-off the same way AgentMail assemble does
 * (`greeting\\n\\nbody\\n\\nsignOff`), skipping empty parts.
 */
export function assembleComposeLetterBody(input: {
  greeting?: string | null;
  body: string;
  signOff?: string | null;
}): string {
  const parts: string[] = [];
  const greeting = input.greeting?.trim();
  const body = input.body.replace(/\r\n/g, "\n").trim();
  const signOff = input.signOff?.trim();
  if (greeting) parts.push(greeting);
  if (body) parts.push(body);
  if (signOff) parts.push(signOff);
  return parts.join("\n\n");
}
