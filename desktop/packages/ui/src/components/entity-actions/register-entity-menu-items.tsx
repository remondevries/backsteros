"use client";

import { useId, useLayoutEffect } from "react";

import { useListKeyboardNavMountGate } from "../../list-nav/list-keyboard-nav-mount-gate.js";
import {
  useEntityHeaderActionsContext,
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
  const { registerExtraMenuItems, clearExtraMenuItems } =
    useEntityHeaderActionsContext();
  const itemsRef = useLatestRef(items);

  useLayoutEffect(() => {
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
