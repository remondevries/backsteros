/** In-app agent activity derived from terminal OSC titles (Orca-style heuristics). */
export type AgentActivity = "working" | "attention" | "idle" | "present";

export type AgentActivitySummary = {
  working: number;
  attention: number;
  idle: number;
  present: number;
  /** Sessions with any recognized agent signal. */
  total: number;
};

/**
 * Fallback only — primary turn-end is the Cursor `stop` hook.
 * Quiet gaps between tools/thinking are often >2s; a short timer made the
 * task busy indicator flicker. Keep this long so OSC/hook gaps don't clear it.
 */
export const AGENT_WORKING_IDLE_FALLBACK_MS = 60_000;

const BRAILLE_RE = /[\u2800-\u28ff]/;

function containsBrailleSpinner(title: string): boolean {
  return BRAILLE_RE.test(title);
}

function looksLikeCursorTitle(title: string): boolean {
  const lower = title.trim().toLowerCase();
  if (
    lower === "cursor agent" ||
    lower === "cursorai agent" ||
    lower === "cursor ready" ||
    lower === "cursor - action required" ||
    lower.includes("cursor agent") ||
    /\bcursor-agent\b/i.test(title)
  ) {
    return true;
  }
  return /^[\u2800-\u28ff]+\s*Cursor Agent$/iu.test(title.trim());
}

/**
 * Classify a terminal OSC title into agent activity.
 *
 * Orca note: bare `"Cursor Agent"` is Cursor's info-free native title and is a
 * no-op (`null`) so it cannot stomp a locally/synthesized working state.
 * Prefer marking working when we submit a prompt, then clear on idle/attention.
 */
export function detectAgentActivityFromTitle(
  title: string | null | undefined,
): AgentActivity | null {
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (lower === "cursor - action required") return "attention";
  if (lower === "cursor ready") return "idle";
  // Bare native Cursor title — no working/idle signal (Orca parity).
  if (lower === "cursor agent" || lower === "cursorai agent") return null;

  if (looksLikeCursorTitle(trimmed)) {
    if (
      /action required|permission|\bwaiting\b/i.test(trimmed)
    ) {
      return "attention";
    }
    if (/\b(ready|idle|done)\b/i.test(trimmed)) return "idle";
    if (
      containsBrailleSpinner(trimmed) ||
      /\b(working|thinking|running)\b/i.test(trimmed)
    ) {
      return "working";
    }
    return "present";
  }

  // Other agent TUIs often use braille spinners while working.
  if (containsBrailleSpinner(trimmed)) return "working";

  return null;
}

/** Whether this activity should show the in-list working dots. */
export function isAgentActivelyWorking(
  activity: AgentActivity | null | undefined,
): boolean {
  // Attention = waiting on the user — not an active agent turn.
  return activity === "working";
}

export function summarizeAgentActivity(
  activityBySessionId: Record<string, AgentActivity | null | undefined>,
): AgentActivitySummary {
  const summary: AgentActivitySummary = {
    working: 0,
    attention: 0,
    idle: 0,
    present: 0,
    total: 0,
  };
  for (const activity of Object.values(activityBySessionId)) {
    if (!activity) continue;
    summary.total += 1;
    summary[activity] += 1;
  }
  return summary;
}

export function emptyAgentActivitySummary(): AgentActivitySummary {
  return { working: 0, attention: 0, idle: 0, present: 0, total: 0 };
}
