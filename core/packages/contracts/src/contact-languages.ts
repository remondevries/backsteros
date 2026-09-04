export const CONTACT_LANGUAGES = ["nl", "en", "de", "es", "fr", "pl"] as const;
export type ContactLanguage = (typeof CONTACT_LANGUAGES)[number];

export const CONTACT_LANGUAGE_LABELS: Record<ContactLanguage, string> = {
  nl: "Dutch",
  en: "English",
  de: "German",
  es: "Spanish",
  fr: "French",
  pl: "Polish",
};

export function isContactLanguage(
  value: string,
): value is ContactLanguage {
  return (CONTACT_LANGUAGES as readonly string[]).includes(value);
}

export function coerceContactLanguage(
  value: string | null | undefined,
): ContactLanguage | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return isContactLanguage(normalized) ? normalized : null;
}

/** Normalize stored / API language lists; drops unknowns and duplicates. */
export function coerceContactLanguages(
  values: readonly unknown[] | string | null | undefined,
): ContactLanguage[] {
  let list: readonly unknown[] | null | undefined = null;
  if (typeof values === "string") {
    const trimmed = values.trim();
    if (!trimmed || trimmed === "[]") return [];
    try {
      const parsed: unknown = JSON.parse(trimmed);
      list = Array.isArray(parsed) ? parsed : null;
    } catch {
      return [];
    }
  } else {
    list = values;
  }
  if (!list?.length) return [];
  const out: ContactLanguage[] = [];
  const seen = new Set<ContactLanguage>();
  for (const entry of list) {
    const coerced =
      typeof entry === "string"
        ? coerceContactLanguage(entry)
        : entry &&
            typeof entry === "object" &&
            "code" in entry &&
            typeof (entry as { code: unknown }).code === "string"
          ? coerceContactLanguage((entry as { code: string }).code)
          : null;
    if (!coerced || seen.has(coerced)) continue;
    seen.add(coerced);
    out.push(coerced);
  }
  return out;
}

export function contactLanguageLabel(code: ContactLanguage): string {
  return CONTACT_LANGUAGE_LABELS[code];
}
