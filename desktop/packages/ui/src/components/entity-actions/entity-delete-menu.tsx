"use client";

import {
  EntityActionsMenu,
  type EntityActionsMenuItem,
} from "./entity-actions-menu.js";
import { useEntityHeaderActionsContext } from "./entity-header-actions-context.js";
import { useMounted } from "./use-mounted.js";

export function EntityDeleteMenu() {
  const {
    deleteConfig,
    duplicateConfig,
    isDeletePending,
    isDuplicatePending,
    openDeleteModal,
    runDuplicate,
  } = useEntityHeaderActionsContext();
  const mounted = useMounted();

  if (!mounted || (!deleteConfig && !duplicateConfig)) {
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
