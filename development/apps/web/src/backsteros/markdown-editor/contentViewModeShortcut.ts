/**
 * ⌘E / Ctrl+E — toggle markdown edit ↔ preview (BacksterOS desktop parity).
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
 * ⌘P / Ctrl+P — force preview (desktop parity; also avoids browser Print).
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
  getHost?: (() => Element | null | undefined) | undefined;
};

const toggleHandlers: ContentViewModeRegistration[] = [];
const forcePreviewHandlers: ContentViewModeRegistration[] = [];

/** Shared debounce: some platforms may deliver duplicate keydowns. */
const DEBOUNCE_MS = 350;
let lastToggleAtMs = 0;
let lastForcePreviewAtMs = 0;

let windowListenersInstalled = false;

function isHostVisible(host: Element | null | undefined): boolean {
  if (!host) return true;
  return host.closest("[inert], [data-keep-alive-hidden], [hidden]") == null;
}

function runLatestEnabled(
  handlers: ContentViewModeRegistration[],
  getLastAt: () => number,
  setLastAt: (value: number) => void,
): boolean {
  const now = Date.now();
  if (now - getLastAt() < DEBOUNCE_MS) {
    return true;
  }

  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const registration = handlers[i];
    if (!registration?.isEnabled()) continue;
    const host = registration.getHost?.();
    if (host != null && !isHostVisible(host)) continue;
    if (host != null) {
      setLastAt(now);
      registration.run();
      return true;
    }
  }

  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const registration = handlers[i];
    if (!registration?.isEnabled()) continue;
    if (registration.getHost?.()) continue;
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
    event.preventDefault();
    event.stopImmediatePropagation();
    runActiveContentViewModeToggle();
    return;
  }

  if (isForceContentPreviewShortcut(event)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    runActiveForceContentPreview();
  }
}

function ensureWindowListeners() {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  window.addEventListener("keydown", onKeyDown, true);
}

function registerHandler(
  handlers: ContentViewModeRegistration[],
  options: {
    run: () => void;
    isEnabled: () => boolean;
    getHost?: (() => Element | null | undefined) | undefined;
  },
): () => void {
  ensureWindowListeners();
  const registration: ContentViewModeRegistration = {
    run: options.run,
    isEnabled: options.isEnabled,
    getHost: options.getHost,
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
 * Most recently registered enabled (and visible) handler wins.
 */
export function registerContentViewModeToggle(options: {
  toggle: () => void;
  isEnabled: () => boolean;
  getHost?: (() => Element | null | undefined) | undefined;
}): () => void {
  return registerHandler(toggleHandlers, {
    run: options.toggle,
    isEnabled: options.isEnabled,
    getHost: options.getHost,
  });
}

/**
 * Register a force-preview handler for ⌘P / Ctrl+P.
 */
export function registerForceContentPreview(options: {
  forcePreview: () => void;
  isEnabled: () => boolean;
  getHost?: (() => Element | null | undefined) | undefined;
}): () => void {
  return registerHandler(forcePreviewHandlers, {
    run: options.forcePreview,
    isEnabled: options.isEnabled,
    getHost: options.getHost,
  });
}

/** Test helper — clear registrations between cases. */
export function resetContentViewModeShortcutHandlersForTests(): void {
  toggleHandlers.length = 0;
  forcePreviewHandlers.length = 0;
  lastToggleAtMs = 0;
  lastForcePreviewAtMs = 0;
}
