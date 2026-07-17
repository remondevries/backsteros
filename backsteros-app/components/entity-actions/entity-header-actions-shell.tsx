"use client";

import type { ReactNode } from "react";

import { EntityDeleteConfirmModal } from "./entity-delete-confirm-modal";
import { EntityDeleteMenu } from "./entity-delete-menu";
import { EntityHeaderActionsProvider } from "./entity-header-actions-context";
import { useEntityDeleteShortcut } from "./use-entity-delete-shortcut";

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

type EntityHeaderActionsSlotProps = {
  triggerVariant?: "default" | "mobile-circle-toolbar";
};

export function EntityHeaderActionsSlot({
  triggerVariant = "default",
}: EntityHeaderActionsSlotProps = {}) {
  return <EntityDeleteMenu triggerVariant={triggerVariant} />;
}
