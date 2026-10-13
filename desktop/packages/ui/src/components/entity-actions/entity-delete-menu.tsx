"use client";

import {
  EntityActionsMenu,
  type EntityActionsMenuItem,
} from "./entity-actions-menu.js";
import { useEntityHeaderActionsContextOptional } from "./entity-header-actions-context.js";
import { useMounted } from "./use-mounted.js";

export function EntityDeleteMenu() {
  const context = useEntityHeaderActionsContextOptional();
  const mounted = useMounted();

  if (!context) return null;

  const {
    deleteConfig,
    duplicateConfig,
    extraMenuItems,
    isDeletePending,
    isDuplicatePending,
    openDeleteModal,
    runDuplicate,
  } = context;

  if (
    !mounted ||
    (!deleteConfig && !duplicateConfig && extraMenuItems.length === 0)
  ) {
    return null;
  }

  const busy = isDeletePending || isDuplicatePending;
  const items: EntityActionsMenuItem[] = [];

  if (duplicateConfig) {
    items.push({
      id: "duplicate",
      label: "Duplicate",
      disabled: busy || Boolean(duplicateConfig.disabled),
      onSelect: () => runDuplicate(),
    });
  }

  for (const item of extraMenuItems) {
    items.push({
      id: item.id,
      label: item.label,
      danger: item.danger,
      disabled: busy || Boolean(item.disabled),
      onSelect: () => {
        if (item.confirm) {
          openDeleteModal({
            entityLabel: item.confirm.entityLabel,
            confirmLabel: item.confirm.confirmLabel,
            actionVerb: item.confirm.actionVerb,
            onDelete: async () => {
              const result = await item.onSelect();
              if (result && typeof result === "object" && "ok" in result) {
                return result;
              }
              return { ok: true };
            },
          });
          return;
        }
        void item.onSelect();
      },
    });
  }

  if (deleteConfig) {
    items.push({
      id: "delete",
      label: "Delete",
      danger: true,
      disabled: busy,
      onSelect: () => openDeleteModal(deleteConfig),
    });
  }

  return (
    <EntityActionsMenu
      ariaLabel="Entity actions"
      disabled={busy}
      items={items}
    />
  );
}
