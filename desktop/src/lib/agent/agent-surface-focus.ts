/**
 * Tab focuses the active agent surface’s primary control; Escape unfocuses it
 * so task-level shortcuts work again (same pattern as Chat → composer).
 */

export const AGENT_SURFACE_FOCUS = {
  browserAddress: "browser-address",
  filesTree: "files-tree",
  terminal: "terminal",
} as const;

export const AGENT_SURFACE_FOCUS_ATTR = "data-agent-surface-focus";

export const FOCUS_AGENT_TERMINAL_EVENT = "backsteros:focus-agent-terminal";
export const BLUR_AGENT_TERMINAL_EVENT = "backsteros:blur-agent-terminal";

export type AgentSurfaceFocusKind =
  | "chat"
  | "browser"
  | "terminal"
  | "files"
  | "plan"
  | "diff"
  | null;

function isHtml(el: EventTarget | null): el is HTMLElement {
  return el instanceof HTMLElement;
}

export function isInsideBrowserAddress(el: EventTarget | null): boolean {
  if (!isHtml(el)) return false;
  return Boolean(
    el.closest(`[${AGENT_SURFACE_FOCUS_ATTR}="${AGENT_SURFACE_FOCUS.browserAddress}"]`),
  );
}

export function isInsideFilesSurface(el: EventTarget | null): boolean {
  if (!isHtml(el)) return false;
  return Boolean(el.closest(".agent-surface-pane--files"));
}

export function isInsideTerminalSurface(el: EventTarget | null): boolean {
  if (!isHtml(el)) return false;
  return Boolean(
    el.closest(`[${AGENT_SURFACE_FOCUS_ATTR}="${AGENT_SURFACE_FOCUS.terminal}"]`) ||
      el.closest(".agent-surface-terminal-host") ||
      el.classList.contains("xterm-helper-textarea"),
  );
}

export function focusBrowserAddress(root: ParentNode | null): boolean {
  const input = root?.querySelector<HTMLInputElement>(
    `.desktop-agent-chat__pane--browser.is-active [${AGENT_SURFACE_FOCUS_ATTR}="${AGENT_SURFACE_FOCUS.browserAddress}"]`,
  );
  if (!input || input.disabled) return false;
  input.focus();
  input.select();
  return true;
}

export function blurBrowserAddress(active: EventTarget | null): boolean {
  if (!isInsideBrowserAddress(active)) return false;
  if (active instanceof HTMLElement) active.blur();
  return true;
}

export function focusFilesTreeFirstItem(root: ParentNode | null): boolean {
  const tree = root?.querySelector(
    `.desktop-agent-chat__pane--files.is-active [${AGENT_SURFACE_FOCUS_ATTR}="${AGENT_SURFACE_FOCUS.filesTree}"]`,
  );
  if (!tree) return false;
  const row =
    tree.querySelector<HTMLElement>(
      `.agent-surface-files-row.keyboard-nav-item-highlight`,
    ) ??
    tree.querySelector<HTMLElement>(
      `.agent-surface-files-row[tabindex="0"]`,
    ) ??
    tree.querySelector<HTMLElement>(`.agent-surface-files-row`);
  if (!row) return false;
  row.focus();
  return true;
}

export function blurFilesSurface(active: EventTarget | null): boolean {
  if (!isInsideFilesSurface(active)) return false;
  if (active instanceof HTMLElement) active.blur();
  return true;
}

export function focusAgentTerminal(sessionKey?: string | null): boolean {
  window.dispatchEvent(
    new CustomEvent(FOCUS_AGENT_TERMINAL_EVENT, {
      detail: { sessionKey: sessionKey ?? null },
    }),
  );
  return true;
}

export function blurAgentTerminal(
  active: EventTarget | null,
  sessionKey?: string | null,
): boolean {
  if (!isInsideTerminalSurface(active)) return false;
  window.dispatchEvent(
    new CustomEvent(BLUR_AGENT_TERMINAL_EVENT, {
      detail: { sessionKey: sessionKey ?? null },
    }),
  );
  if (active instanceof HTMLElement) active.blur();
  return true;
}
