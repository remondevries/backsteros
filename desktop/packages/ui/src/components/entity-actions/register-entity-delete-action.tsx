"use client";

import { useId, useLayoutEffect } from "react";

import { useListKeyboardNavMountGate } from "../../list-nav/list-keyboard-nav-mount-gate.js";
import {
  useEntityHeaderActionsContext,
  type EntityDeleteConfig,
} from "./entity-header-actions-context.js";
import { useLatestRef } from "./use-latest-ref.js";

export function RegisterEntityDeleteAction({
  entityLabel,
  confirmLabel,
  actionVerb,
  onDelete,
}: EntityDeleteConfig) {
  const ownerId = useId();
  const mountGate = useListKeyboardNavMountGate();
  const { registerDeleteConfig, clearDeleteConfig } =
    useEntityHeaderActionsContext();
  const onDeleteRef = useLatestRef(onDelete);

  useLayoutEffect(() => {
    if (!mountGate) {
      clearDeleteConfig(ownerId);
      return;
    }
    registerDeleteConfig(ownerId, {
      entityLabel,
      confirmLabel,
      actionVerb,
      onDelete: () => onDeleteRef.current(),
    });
    return () => clearDeleteConfig(ownerId);
  }, [
    actionVerb,
    clearDeleteConfig,
    confirmLabel,
    entityLabel,
    mountGate,
    onDeleteRef,
    ownerId,
    registerDeleteConfig,
  ]);

  return null;
}
