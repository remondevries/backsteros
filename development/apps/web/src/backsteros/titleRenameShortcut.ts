/**
 * ⌘R / Ctrl+R — focus the entity title for rename (BacksterOS desktop parity).
 * Also match `code` so layout variants still work when `key` is remapped.
 */
export function isTitleRenameShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
  >,
): boolean {
  if (event.repeat) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key.toLowerCase() === "r" || event.code === "KeyR";
}

type TitleRenameRegistration = {
  rename: () => void;
  isEnabled: () => boolean;
};

const renameHandlers: TitleRenameRegistration[] = [];

/** Shared debounce: some platforms may deliver duplicate keydowns. */
const RENAME_DEBOUNCE_MS = 350;
let lastRenameAtMs = 0;
let windowListenersInstalled = false;

function runActiveTitleRename(): boolean {
  const now = Date.now();
  if (now - lastRenameAtMs < RENAME_DEBOUNCE_MS) {
    return true;
  }

  for (let i = renameHandlers.length - 1; i >= 0; i -= 1) {
    const registration = renameHandlers[i];
    if (!registration?.isEnabled()) continue;
    lastRenameAtMs = now;
    registration.rename();
    return true;
  }

  return false;
}

function onKeyDown(event: KeyboardEvent) {
  if (!isTitleRenameShortcut(event)) return;

  // Always claim the key so the browser cannot Reload when a handler is active.
  if (renameHandlers.some((handler) => handler.isEnabled())) {
    event.preventDefault();
    event.stopImmediatePropagation();
    runActiveTitleRename();
  }
}

function ensureWindowListeners() {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  window.addEventListener("keydown", onKeyDown, true);
}

/**
 * Register a title-rename handler for ⌘R / Ctrl+R.
 * Most recently registered enabled handler wins.
 */
export function registerTitleRename(options: {
  rename: () => void;
  isEnabled: () => boolean;
}): () => void {
  ensureWindowListeners();
  const registration: TitleRenameRegistration = {
    rename: options.rename,
    isEnabled: options.isEnabled,
  };
  renameHandlers.push(registration);
  return () => {
    const index = renameHandlers.indexOf(registration);
    if (index >= 0) {
      renameHandlers.splice(index, 1);
    }
  };
}

/** Test helper — clear registrations between cases. */
export function resetTitleRenameHandlersForTests(): void {
  renameHandlers.length = 0;
  lastRenameAtMs = 0;
}
