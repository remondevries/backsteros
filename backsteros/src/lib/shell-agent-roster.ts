/** Fired after Settings saves a cloud agent so shell chat reloads the roster. */
export const SHELL_AGENT_ROSTER_CHANGED_EVENT =
  "backsteros:shell-agent-roster-changed";

export function notifyShellAgentRosterChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SHELL_AGENT_ROSTER_CHANGED_EVENT));
}
