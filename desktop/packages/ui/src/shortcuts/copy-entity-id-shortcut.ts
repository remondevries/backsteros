"use client";

import { useEffect } from "react";

import { useLatestRef } from "../shared/use-latest-ref.js";
import { showAppToast } from "../toast/app-toast.js";
import {
  isBlockingModalOpen,
  shouldHandleGlobalShortcut,
} from "./shortcut-guards.js";

/** Native Edit → Copy Task/Project ID dispatches this into the webview (Tauri menu). */
export const COPY_ENTITY_ID_EVENT = "backsteros:copy-entity-id";

/**
 * ⌘. / Ctrl+. — copy the current task display id (`KEY-N`) or project key
 * when a task/project list or detail surface has registered a resolver.
 *
 * Conflict note: ⌘. was unbound in-app (⌘, opens settings). Native Edit menu
 * claims the accelerator because AppKit/WKWebView often swallows ⌘. as Cancel
 * before JS `keydown` sees it (same pattern as ⌘K / ⌘R). JS still handles the
 * chord when it does arrive; we only write the clipboard when a resolver
 * returns an id.
 */
export function isCopyEntityIdShortcut(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat"
  >,
): boolean {
  if (event.repeat) return false;
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key === "." || event.code === "Period";
}

type CopyEntityIdRegistration = {
  resolveId: () => string | null;
  isEnabled: () => boolean;
};

const registrations: CopyEntityIdRegistration[] = [];

/** Shared debounce: macOS may deliver both the native menu accelerator and a residual keydown. */
const COPY_DEBOUNCE_MS = 350;
let lastCopyAtMs = 0;
let windowListenersInstalled = false;

export function resolveCopyEntityId(): string | null {
  for (let i = registrations.length - 1; i >= 0; i -= 1) {
    const registration = registrations[i];
    if (!registration?.isEnabled()) continue;
    const id = registration.resolveId()?.trim() || null;
    if (id) return id;
  }
  return null;
}

async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      return false;
    }
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function runCopyEntityId(): boolean {
  const now = Date.now();
  if (now - lastCopyAtMs < COPY_DEBOUNCE_MS) {
    return true;
  }

  if (isBlockingModalOpen()) return false;

  const id = resolveCopyEntityId();
  if (!id) return false;

  lastCopyAtMs = now;
  void writeClipboardText(id).then((ok) => {
    if (!ok) return;
    showAppToast(`Copied ${id}`);
  });
  return true;
}

function onKeyDown(event: KeyboardEvent) {
  if (!isCopyEntityIdShortcut(event)) return;
  if (!shouldHandleGlobalShortcut(event)) return;

  // Always claim the key when a resolver can copy — otherwise AppKit Cancel
  // may still run. When there is nothing to copy, leave the chord alone.
  if (!resolveCopyEntityId()) return;

  event.preventDefault();
  event.stopImmediatePropagation();
  runCopyEntityId();
}

function onNativeCopyEntityId() {
  runCopyEntityId();
}

function ensureWindowListeners() {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  window.addEventListener(COPY_ENTITY_ID_EVENT, onNativeCopyEntityId);
  window.addEventListener("keydown", onKeyDown, true);
}

/** Install once from the app shell so ⌘. works as soon as a surface registers. */
export function installCopyEntityIdShortcutListeners() {
  ensureWindowListeners();
}

function registerCopyEntityId(options: {
  resolveId: () => string | null;
  isEnabled: () => boolean;
}): () => void {
  ensureWindowListeners();
  const registration: CopyEntityIdRegistration = {
    resolveId: options.resolveId,
    isEnabled: options.isEnabled,
  };
  registrations.push(registration);
  return () => {
    const index = registrations.indexOf(registration);
    if (index >= 0) {
      registrations.splice(index, 1);
    }
  };
}

/**
 * Registers a resolver for ⌘. / Ctrl+. copy-id.
 * Later (more nested) registrations win when enabled and non-null.
 */
export function useCopyEntityIdShortcut(
  resolveId: () => string | null,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const resolveIdRef = useLatestRef(resolveId);
  const enabledRef = useLatestRef(enabled);

  useEffect(() => {
    installCopyEntityIdShortcutListeners();
  }, []);

  useEffect(() => {
    return registerCopyEntityId({
      resolveId: () => resolveIdRef.current(),
      isEnabled: () => Boolean(enabledRef.current),
    });
  }, []);
}
