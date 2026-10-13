/**
 * Remove tabs / newlines from values meant for single-line fields
 * (`<input>`, title editors, SEO slug/title). Multi-line textareas and
 * markdown editors should not use this.
 */
export function sanitizeSingleLineText(text: string): string {
  return text.replace(/[\t\n\r\u2028\u2029]/g, "");
}
