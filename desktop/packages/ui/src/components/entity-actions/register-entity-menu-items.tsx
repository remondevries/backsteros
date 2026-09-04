"use client";

import { useId, useLayoutEffect } from "react";

import { useListKeyboardNavMountGate } from "../../list-nav/list-keyboard-nav-mount-gate.js";
import {
  useEntityHeaderActionsContextOptional,
  type EntityExtraMenuItem,
} from "./entity-header-actions-context.js";
import { useLatestRef } from "./use-latest-ref.js";

export function RegisterEntityMenuItems({
  items,
}: {
  items: EntityExtraMenuItem[];
}) {
  const ownerId = useId();
  const mountGate = useListKeyboardNavMountGate();
  const context = useEntityHeaderActionsContextOptional();
  const registerExtraMenuItems = context?.registerExtraMenuItems;
  const clearExtraMenuItems = context?.clearExtraMenuItems;
  const itemsRef = useLatestRef(items);

  useLayoutEffect(() => {
    if (!registerExtraMenuItems || !clearExtraMenuItems) return;
    if (!mountGate) {
      clearExtraMenuItems(ownerId);
      return;
    }
    registerExtraMenuItems(ownerId, itemsRef.current);
    return () => clearExtraMenuItems(ownerId);
  }, [
    clearExtraMenuItems,
    items,
    itemsRef,
    mountGate,
    ownerId,
    registerExtraMenuItems,
  ]);

  return null;
}
