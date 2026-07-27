/** Stable tab label when a Cursor CLI agent is active in the PTY. */
export const CURSOR_AI_TAB_TITLE = "CursorAI Agent";

/**
 * Cursor agent sets the terminal title via OSC (often exactly "Cursor Agent",
 * sometimes with a braille spinner prefix). Match that vocabulary so we don't
 * rename tabs when another tool merely mentions "cursor" in a task title.
 */
export function isCursorAgentTitle(title: string | null | undefined): boolean {
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === "cursor agent" ||
    lower === "cursorai agent" ||
    lower === "cursor ready" ||
    lower === "cursor - action required"
  ) {
    return true;
  }
  // e.g. "⠋ Cursor Agent"
  if (/^[\u2800-\u28ff]+\s*Cursor Agent$/iu.test(trimmed)) return true;
  if (/\bcursor-agent\b/i.test(trimmed)) return true;
  return false;
}

export function terminalTabTitleFromOsc(
  oscTitle: string,
  currentTitle: string,
  defaultTitle: string,
): string {
  if (isCursorAgentTitle(oscTitle)) return CURSOR_AI_TAB_TITLE;
  if (currentTitle === CURSOR_AI_TAB_TITLE) return defaultTitle;
  return currentTitle;
}
