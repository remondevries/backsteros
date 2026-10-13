import { isBlockingModalOpen } from "../shortcuts/shortcut-guards.js";

export const ADD_TASK_LINK_SHORTCUT_HINT = "⌘L";

/** Agent browser surface owns ⌘L for the address bar when its pane is active. */
const AGENT_BROWSER_ACTIVE_PANE_SELECTOR =
  ".desktop-agent-chat__pane--browser.is-active";

export function isAddTaskLinkShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
  >,
): boolean {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key.toLowerCase() === "l" || event.code === "KeyL";
}

function isInsideComposeModal(root: HTMLElement | null): boolean {
  return (
    root?.closest("[data-compose-modal], .create-task-modal-root") != null
  );
}

function isComposeModalOpen(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.querySelector("[data-compose-modal]") != null;
}

function isCommandPaletteOpen(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.querySelector("[cmdk-dialog][data-state='open']") != null;
}

function isAgentBrowserPaneActive(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.querySelector(AGENT_BROWSER_ACTIVE_PANE_SELECTOR) != null;
}

/**
 * Shortcut only when this attachments block is on a visible surface — not a
 * keep-alive-hidden task page still mounted under /calendar, /inbox, etc.
 */
export function isTaskLinkAttachmentsSurfaceActive(
  root: HTMLElement | null,
): boolean {
  if (!root || !root.isConnected) {
    return false;
  }
  if (root.closest("[data-keep-alive-hidden]")) {
    return false;
  }
  let el: HTMLElement | null = root;
  while (el) {
    if (el.hasAttribute("hidden")) {
      return false;
    }
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    el = el.parentElement;
  }
  return true;
}

/**
 * ⌘L / Ctrl+L opens the add-link modal on a visible task detail (or the
 * create-task compose popup). Does not fire on other routes where a keep-alive
 * task tree is still mounted. Yields to the agent browser address bar when
 * that pane is active (unless compose owns the shortcut).
 */
export function shouldHandleAddTaskLinkShortcut(
  event: KeyboardEvent,
  {
    enabled,
    modalAlreadyOpen,
    root,
  }: {
    enabled: boolean;
    modalAlreadyOpen: boolean;
    root: HTMLElement | null;
  },
): boolean {
  if (!enabled || modalAlreadyOpen) {
    return false;
  }

  if (!isAddTaskLinkShortcut(event)) {
    return false;
  }

  if (isCommandPaletteOpen()) {
    return false;
  }

  const inCompose = isInsideComposeModal(root);

  if (!inCompose && !isTaskLinkAttachmentsSurfaceActive(root)) {
    return false;
  }

  if (isComposeModalOpen()) {
    if (!inCompose) {
      return false;
    }
  } else if (isBlockingModalOpen()) {
    return false;
  }

  if (!inCompose && isAgentBrowserPaneActive()) {
    return false;
  }

  return true;
}
