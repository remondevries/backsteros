/**
 * Remembers whether the right agent chat panel is collapsed across task /
 * message switches. Scoped so task (default open) and email (default
 * collapsed) preferences do not overwrite each other.
 */
export type AgentPanelCollapsedScope = "task" | "email";

const AGENT_PANEL_COLLAPSED_KEY_PREFIX =
  "backsteros-desktop.agent-panel-collapsed.";

export function agentPanelCollapsedKey(
  scope: AgentPanelCollapsedScope,
): string {
  return `${AGENT_PANEL_COLLAPSED_KEY_PREFIX}${scope}`;
}

export function readAgentPanelCollapsed(
  scope: AgentPanelCollapsedScope,
  fallback: boolean,
): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(agentPanelCollapsedKey(scope));
    if (raw == null) return fallback;
    return raw === "1" || raw === "true";
  } catch {
    return fallback;
  }
}

export function writeAgentPanelCollapsed(
  scope: AgentPanelCollapsedScope,
  collapsed: boolean,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      agentPanelCollapsedKey(scope),
      collapsed ? "1" : "0",
    );
  } catch {
    /* ignore quota / private mode */
  }
}
