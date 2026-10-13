"use client";

import { useEffect } from "react";

import { requestDocumentTreeFolderRename } from "../documents/document-tree-folder-rename-shortcut.js";
import { getFocusedListKeyboardItemId } from "../list-nav/focused-list-keyboard-item.js";
import { isBlockingModalOpen } from "./shortcut-guards.js";
import { useLatestRef } from "../shared/use-latest-ref.js";

/** Native Edit → Rename dispatches this into the webview (Tauri menu). */
export const TITLE_RENAME_EVENT = "backsteros:title-rename";

export function isTitleRenameShortcut(event: KeyboardEvent): boolean {
  if (event.repeat) return false;
  return (
    (event.metaKey || event.ctrlKey) &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === "r" || event.code === "KeyR")
  );
}

export function focusAndSelectTitleInput(
  input: HTMLInputElement | null | undefined,
): void {
  if (!input) {
    return;
  }

  input.focus();
  input.select();
}

/** When a folder row is keyboard-focused, ⌘R renames the folder instead of the entity title. */
function tryHandleDocumentTreeFolderRename(): boolean {
  const focusedItemId = getFocusedListKeyboardItemId();
  if (!focusedItemId) {
    return false;
  }

  return requestDocumentTreeFolderRename(focusedItemId);
}

function isComposeModalOpen(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector("[data-compose-modal]") != null;
}

type TitleRenameRegistration = {
  rename: () => void;
  isEnabled: () => boolean;
};

const renameHandlers: TitleRenameRegistration[] = [];

/** Shared debounce: macOS may deliver both the native menu accelerator and a residual keydown. */
const RENAME_DEBOUNCE_MS = 350;
let lastRenameAtMs = 0;
let windowListenersInstalled = false;

function runActiveTitleRename(): boolean {
  const now = Date.now();
  if (now - lastRenameAtMs < RENAME_DEBOUNCE_MS) {
    return true;
  }

  // Compose owns ⌘R while open (detail handlers stay mounted under keep-alive).
  if (isComposeModalOpen()) {
    return false;
  }

  if (isBlockingModalOpen()) return false;

  if (tryHandleDocumentTreeFolderRename()) {
    lastRenameAtMs = now;
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

  // Always claim the key so WKWebView cannot Reload — even when a modal owns
  // the actual rename action.
  event.preventDefault();

  if (isComposeModalOpen()) {
    // Let compose's document capture listener focus its title field.
    return;
  }

  if (isBlockingModalOpen()) return;

  event.stopImmediatePropagation();
  runActiveTitleRename();
}

function onNativeTitleRename() {
  if (isComposeModalOpen()) {
    // Compose listens for TITLE_RENAME_EVENT separately.
    return;
  }
  runActiveTitleRename();
}

function ensureWindowListeners() {
  if (windowListenersInstalled || typeof window === "undefined") return;
  windowListenersInstalled = true;
  window.addEventListener(TITLE_RENAME_EVENT, onNativeTitleRename);
  window.addEventListener("keydown", onKeyDown, true);
}

/** Install once from the app shell so ⌘R works before any detail view mounts. */
export function installTitleRenameShortcutListeners() {
  ensureWindowListeners();
}

function registerTitleRename(options: {
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

/**
 * ⌘R / Ctrl+R focuses the entity title for rename.
 * Also listens for the Tauri Edit menu accelerator — WKWebView otherwise
 * treats ⌘R as Reload while a text field / CodeMirror is focused.
 */
export function useTitleRenameShortcut(
  onRename: () => void,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const onRenameRef = useLatestRef(onRename);
  const enabledRef = useLatestRef(enabled);

  useEffect(() => {
    installTitleRenameShortcutListeners();
  }, []);

  useEffect(() => {
    return registerTitleRename({
      rename: () => {
        onRenameRef.current();
      },
      isEnabled: () => Boolean(enabledRef.current),
    });
  }, []);
}
