"use client";

import { useId, useLayoutEffect } from "react";

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
  const { registerExtraMenuItems, clearExtraMenuItems } =
    useEntityHeaderActionsContext();
  const itemsRef = useLatestRef(items);

  useLayoutEffect(() => {
    registerExtraMenuItems(ownerId, itemsRef.current);
    return () => clearExtraMenuItems(ownerId);
  }, [
    clearExtraMenuItems,
    items,
    itemsRef,
    ownerId,
    registerExtraMenuItems,
  ]);

  return null;
}
