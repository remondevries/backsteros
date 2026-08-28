import { isBlockingModalOpen } from "../shortcuts/shortcut-guards.js";

/** Native Edit → Toggle Edit/Preview dispatches this into the webview (Tauri menu). */
export const TOGGLE_CONTENT_VIEW_MODE_EVENT =
  "backsteros:toggle-content-view-mode";

/** Native Edit → Preview dispatches this into the webview (Tauri menu). */
export const FORCE_CONTENT_PREVIEW_EVENT =
  "backsteros:force-content-preview";

/**
 * ⌘E / Ctrl+E — toggle markdown (and email draft) edit ↔ preview.
 * Also match `code` so layout variants still work when `key` is remapped.
 */
export function isToggleContentViewModeShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
  >,
): boolean {
  if (event.repeat) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key.toLowerCase() === "e" || event.code === "KeyE";
}

/**
 * ⌘P / Ctrl+P — force preview. WKWebView otherwise treats this as Print.
 */
export function isForceContentPreviewShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
  >,
): boolean {
  if (event.repeat) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key.toLowerCase() === "p" || event.code === "KeyP";
}

type ContentViewModeRegistration = {
  run: () => void;
  isEnabled: () => boolean;
};

const toggleHandlers: ContentViewModeRegistration[] = [];
const forcePreviewHandlers: ContentViewModeRegistration[] = [];

/** Shared debounce: macOS may deliver both the native menu accelerator and a residual keydown. */
const DEBOUNCE_MS = 350;
let lastToggleAtMs = 0;
let lastForcePreviewAtMs = 0;

let windowListenersInstalled = false;

function runLatestEnabled(
  handlers: ContentViewModeRegistration[],
  getLastAt: () => number,
  setLastAt: (value: number) => void,
): boolean {
  if (isBlockingModalOpen()) return false;

  const now = Date.now();
  if (now - getLastAt() < DEBOUNCE_MS) {
    return true;
  }

  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const registration = handlers[i];
    if (!registration?.isEnabled()) continue;
    setLastAt(now);
    registration.run();
    return true;
  }

  return false;
}

function runActiveContentViewModeToggle(): boolean {
  return runLatestEnabled(
    toggleHandlers,
    () => lastToggleAtMs,
    (value) => {
      lastToggleAtMs = value;
    },
  );
}

function runActiveForceContentPreview(): boolean {
  return runLatestEnabled(
    forcePreviewHandlers,
    () => lastForcePreviewAtMs,
    (value) => {
      lastForcePreviewAtMs = value;
    },
  );
}

function onKeyDown(event: KeyboardEvent) {
  if (isToggleContentViewModeShortcut(event)) {
    if (isBlockingModalOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runActiveContentViewModeToggle();
    return;
  }

  if (isForceContentPreviewShortcut(event)) {
    if (isBlockingModalOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    runActiveForceContentPreview();
  }
}

function ensureWindowListeners() {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  window.addEventListener(
    TOGGLE_CONTENT_VIEW_MODE_EVENT,
    runActiveContentViewModeToggle,
  );
  window.addEventListener(
    FORCE_CONTENT_PREVIEW_EVENT,
    runActiveForceContentPreview,
  );
  window.addEventListener("keydown", onKeyDown, true);
}

/** Install once from the app shell so ⌘E / ⌘P work before any detail editor mounts. */
export function installContentViewModeShortcutListeners() {
  ensureWindowListeners();
}

function registerHandler(
  handlers: ContentViewModeRegistration[],
  options: { run: () => void; isEnabled: () => boolean },
): () => void {
  ensureWindowListeners();
  const registration: ContentViewModeRegistration = {
    run: options.run,
    isEnabled: options.isEnabled,
  };
  handlers.push(registration);
  return () => {
    const index = handlers.indexOf(registration);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  };
}

/**
 * Register a content edit ↔ preview toggle for ⌘E / Ctrl+E.
 * Most recently registered enabled handler wins (visible detail over keep-alive).
 */
export function registerContentViewModeToggle(options: {
  toggle: () => void;
  isEnabled: () => boolean;
}): () => void {
  return registerHandler(toggleHandlers, {
    run: options.toggle,
    isEnabled: options.isEnabled,
  });
}

/**
 * Register a force-preview handler for ⌘P / Ctrl+P.
 * Most recently registered enabled handler wins.
 */
export function registerForceContentPreview(options: {
  forcePreview: () => void;
  isEnabled: () => boolean;
}): () => void {
  return registerHandler(forcePreviewHandlers, {
    run: options.forcePreview,
    isEnabled: options.isEnabled,
  });
}
