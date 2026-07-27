"use client";

import { EntityActionsMenu } from "./entity-actions-menu.js";
import { useEntityHeaderActionsContext } from "./entity-header-actions-context.js";
import { useMounted } from "./use-mounted.js";

export function EntityDeleteMenu() {
  const { deleteConfig, isDeletePending, openDeleteModal } =
    useEntityHeaderActionsContext();
  const mounted = useMounted();

  if (!mounted || !deleteConfig) {
    return null;
  }

  return (
    <EntityActionsMenu
      ariaLabel="Entity actions"
      disabled={isDeletePending}
      items={[
        {
          id: "delete",
          label: "Delete",
          danger: true,
          disabled: isDeletePending,
          onSelect: () => openDeleteModal(deleteConfig),
        },
      ]}
    />
  );
}
