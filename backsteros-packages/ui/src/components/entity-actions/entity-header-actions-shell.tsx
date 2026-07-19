"use client";

import type { ReactNode } from "react";

import { EntityDeleteConfirmModal } from "./entity-delete-confirm-modal.js";
import { EntityDeleteMenu } from "./entity-delete-menu.js";
import { EntityHeaderActionsProvider } from "./entity-header-actions-context.js";
import { useEntityDeleteShortcut } from "./use-entity-delete-shortcut.js";

function EntityDeleteShortcutListener() {
  useEntityDeleteShortcut();
  return null;
}

export function EntityHeaderActionsShell({ children }: { children: ReactNode }) {
  return (
    <EntityHeaderActionsProvider>
      <EntityDeleteShortcutListener />
      <EntityDeleteConfirmModal />
      {children}
    </EntityHeaderActionsProvider>
  );
}

/** ⋯ menu trigger for the chrome header actions slot. */
export function EntityHeaderActionsSlot() {
  return <EntityDeleteMenu />;
}
